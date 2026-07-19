/**
 * proofline-vaa-executor — CRE workflow #3 (design §3.6).
 *
 * heartbeat → read source-dispatch handoff (Solana Wormhole emitter+sequence)
 * → build the canonical MatchOutcomeV1 payload → poll the configured VAA
 * source for the signed VAA → decode + validate the header locally (13-of-19
 * quorum) → produce a CRE report whose payload is the EXACT VAA bytes →
 * submit to WormholeOutcomeReceiver on Base → confirm OutcomeImported →
 * optionally trigger DemoPredictionMarket.settle().
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HONESTY NOTE — what runs where in this build:
 * Written to the CRE programming model (workflow.yaml + config + runtime/
 * report pattern) but executed by a LOCAL SIMULATION runner: `pnpm tsx
 * main.ts --config config/config.local.yaml`. No DON is deployed. The Solana
 * leg is SIMULATED, so the live Guardian network can never observe our
 * emitter: the "VAA source" polled here is the DEV GUARDIAN SET signer —
 * 13-of-19 REAL secp256k1 signatures over the REAL Wormhole
 * keccak256(keccak256(body)) digest, keys derived from public strings
 * (@proofline/protocol guardians.ts) — labeled `simulated: true` everywhere.
 * In sim mode no Base transaction is sent: exact submitVaa/onReport calldata
 * goes to level4-report.json and emitted tx hashes are "sim:"-prefixed so
 * they can never pass as real. REAL in this build: MatchOutcomeV1 encoding
 * (checked byte-for-byte against packages/test-vectors/match-outcome-v1.json
 * at runtime — mismatch fails loudly), VAA wire encode/decode, signature
 * recovery + quorum validation, every digest derivation, and the local
 * digest-equality reconciliation against the Level 3 report before
 * DUAL_FINALITY_REACHED is emitted.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * State-transition discipline (§3.6): no handoff → wait, no writes; VAA
 * delivered → ONE report; already submitted → no-op. Idempotency lives in
 * vaa-executor.state.json under runDir.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, http, keccak256, recoverAddress, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  attestationId,
  base58ToHex32,
  bytesToHex,
  devGuardianAddress,
  encodeMatchOutcomeV1,
  decodeMatchOutcomeV1,
  FINAL_MARKER,
  GUARDIAN_QUORUM,
  proofBundleHash,
  RESULT,
  SOURCE_VALIDATION,
  validationInstructionHash,
  WORMHOLE_CHAIN_BASE_SEPOLIA,
  WORMHOLE_CHAIN_SOLANA,
  type MatchOutcomeV1,
  type ResultCode,
} from "@proofline/protocol";
import {
  encodeVaa,
  fetchVaa,
  signVaaWithDevGuardians,
  vaaHash,
  vaaSigningDigest,
  type VaaBody,
} from "@proofline/wormhole-sdk";
import { createLogger } from "@proofline/observability";
import {
  buildProofBundle,
  buildValidateStatV2Transaction,
  createEventSink,
  cronHeartbeat,
  creReport,
  loadWorkflowConfig,
  lookupDailyRootPda,
  readJsonFile,
  resolveConfigPath,
  resolveSecret,
  simSignature,
  sleep,
  writeJsonFileAtomic,
  type FixtureState,
} from "@proofline/config/cre-runtime";
import { deployedContract } from "@proofline/config/deployments";
import {
  encodeLevel4OnReportCalldata,
  encodeSubmitVaaCalldata,
  makeClients,
  readFinalityStatus,
  readLevel4Attestation,
  readMarketState,
  sendSettle,
  sendSubmitVaa,
} from "@proofline/evm-sdk";

interface VaaExecutorConfig {
  mode: "simulation" | "live";
  runId: string;
  runDir: string;
  heartbeat: { intervalMs: number; maxTicks?: number };
  vaaSource: { kind: "wormholescan" | "guardian-rpc" | "dev-guardian-file"; locator: string };
  txoracleProgramId: string;
  receiver: { chainId: number; deployment: string; contract: string; rpcUrlEnv?: string };
  market?: { settle: boolean; deployment: string; contract: string };
  forwarder: { privateKeySecret: string };
  coordinatorUrl?: string;
}

/** Handoff written by cre-source-dispatch to <runDir>/handoff.json. */
interface Handoff {
  runId: string;
  fixturePath?: string;
  fixtureId: string;
  sequence: string;
  proofBundleHash: `0x${string}`;
  bufferAddress: string;
  rootAccount: string;
  wormhole?: { emitterBase58: string; sequence: string };
  simulatedSolanaLeg: true;
}

interface VaaExecutorState {
  phase: "watching" | "submitted";
  attestationId?: `0x${string}`;
  vaaHash?: `0x${string}`;
  txHash?: string;
  dualFinalized?: boolean;
  settleTxHash?: string;
}

interface ConformanceVector {
  outcome: { fixtureId: string; scoreSequence: string };
  sourceEmitter: `0x${string}`;
  encodedPayload: `0x${string}`;
  attestationId: `0x${string}`;
}

/**
 * Post-submitVaa reconciliation against the REAL registry: poll status (the
 * public Base Sepolia RPC is load-balanced, so a read right after the receipt
 * can hit a lagging replica), then emit DUAL_FINALITY_REACHED and settle the
 * market if configured and not already settled. Used both on first delivery
 * and on resume (a prior run that submitted but exited before finality was
 * observable).
 */
async function finalizeOnBase(opts: {
  sink: ReturnType<typeof createEventSink>;
  log: ReturnType<typeof createLogger>;
  publicClient: ReturnType<typeof makeClients>["publicClient"];
  wallet: Parameters<typeof sendSettle>[0];
  registryAddress: `0x${string}`;
  marketAddress?: `0x${string}`;
  fixtureId: bigint;
  attempts?: number;
}): Promise<{ dualFinalized: boolean; settleTxHash?: string }> {
  const { sink, log, publicClient, wallet, registryAddress, marketAddress, fixtureId } = opts;
  const attempts = opts.attempts ?? 6;
  for (let i = 0; i < attempts; i++) {
    const status = await readFinalityStatus(publicClient, registryAddress, fixtureId);
    if (status.name === "DualFinalized") {
      const rec = await readLevel4Attestation(publicClient, registryAddress, fixtureId);
      await sink.emit({ type: "DUAL_FINALITY_REACHED", attestationId: rec.attestationId }, false);
      let settleTxHash: string | undefined;
      if (marketAddress) {
        const market = await readMarketState(publicClient, marketAddress);
        if (market.settled) {
          log.info("market already settled — no-op", { marketAddress });
        } else {
          settleTxHash = await sendSettle(wallet, marketAddress);
          await publicClient.waitForTransactionReceipt({ hash: settleTxHash as `0x${string}` });
          await sink.emit({ type: "CONSUMER_SETTLED", txHash: settleTxHash }, false);
        }
      }
      return { dualFinalized: true, settleTxHash };
    }
    log.info("registry not DualFinalized yet — repoll", { attempt: i + 1, status: status.name });
    await sleep(2000);
  }
  return { dualFinalized: false };
}

async function main(): Promise<void> {
  const log = createLogger("cre-vaa-executor");
  const workflowDir = dirname(fileURLToPath(import.meta.url));
  const configFlag = process.argv.indexOf("--config");
  const configPath =
    configFlag >= 0 ? process.argv[configFlag + 1] : join(workflowDir, "config/config.local.yaml");
  const { config, configDir } = loadWorkflowConfig<VaaExecutorConfig>(configPath);
  const runDir = resolveConfigPath(configDir, config.runDir);
  const statePath = join(runDir, "vaa-executor.state.json");
  const handoffPath = join(runDir, "handoff.json");
  const vaaLocator = resolveConfigPath(configDir, config.vaaSource.locator);
  const sink = createEventSink(process.env.COORDINATOR_URL ?? config.coordinatorUrl);

  log.info("local simulation runner starting (no deployed DON; dev guardian set)", {
    configPath,
    runDir,
    eventSink: sink.mode,
    vaaSource: `${config.vaaSource.kind}:${vaaLocator}`,
  });

  await cronHeartbeat({
    intervalMs: config.heartbeat.intervalMs,
    maxTicks: config.heartbeat.maxTicks,
    onTick: async (tick) => {
      const now = Date.now();
      await sink.emit({ type: "HEARTBEAT", at: now, nextAt: now + config.heartbeat.intervalMs }, false);

      const state = readJsonFile<VaaExecutorState>(statePath) ?? { phase: "watching" };
      if (state.phase === "submitted") {
        // Already submitted. In live mode, a prior run may have exited before
        // dual finality was observable (RPC replica lag) — RESUME the
        // finalize/settle leg; otherwise idempotent no-op (§3.6).
        const rpcUrl = process.env[config.receiver.rpcUrlEnv ?? "BASE_RPC_URL"];
        const forwarderKey = resolveSecret(config.forwarder.privateKeySecret); // never logged
        const registryAddress = deployedContract(config.receiver.deployment, "finalityRegistry");
        const marketAddress = config.market?.settle
          ? deployedContract(config.market.deployment, config.market.contract)
          : undefined;
        if (
          config.mode === "live" &&
          !state.settleTxHash &&
          !state.dualFinalized &&
          rpcUrl &&
          forwarderKey &&
          registryAddress
        ) {
          const account = privateKeyToAccount(forwarderKey as `0x${string}`);
          const { publicClient, chain } = makeClients(rpcUrl);
          const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
          log.info("resuming finalize/settle for already-submitted VAA", { txHash: state.txHash });
          const fin = await finalizeOnBase({
            sink,
            log,
            publicClient,
            wallet,
            registryAddress: registryAddress as `0x${string}`,
            marketAddress: marketAddress as `0x${string}` | undefined,
            fixtureId: BigInt(readJsonFile<Handoff>(handoffPath)?.fixtureId ?? 0),
          });
          writeJsonFileAtomic(statePath, {
            ...state,
            dualFinalized: fin.dualFinalized,
            settleTxHash: fin.settleTxHash ?? state.settleTxHash,
          } satisfies VaaExecutorState);
          return "done";
        }
        log.info("already submitted — no-op", { tick, vaaHash: state.vaaHash });
        return "done";
      }

      const handoff = readJsonFile<Handoff>(handoffPath);
      if (!handoff) {
        log.info("no handoff yet — waiting for source-dispatch", { tick, handoffPath });
        return "continue";
      }
      const fail = async (reason: string) => {
        await sink.emit({ type: "RUN_FAILED", stage: "vaa-executor", reason }, true);
        return "done" as const;
      };
      if (!handoff.fixturePath) return fail("handoff has no fixturePath");
      if (!handoff.wormhole) return fail("handoff carries no wormhole emitter/sequence");

      const repoRoot = resolve(workflowDir, "../..");
      const fixtureFile = isAbsolute(handoff.fixturePath)
        ? handoff.fixturePath
        : join(repoRoot, handoff.fixturePath);
      const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as FixtureState;
      const finalRecord = fixture.records.find(
        (r) =>
          r.action === FINAL_MARKER.action &&
          r.statusId === FINAL_MARKER.statusId &&
          r.period === FINAL_MARKER.period,
      );
      if (!finalRecord) return fail("handoff exists but fixture has no final record");

      // --- Simulated Solana adapter leg: re-run the verification the adapter
      // performs — recompute the bundle hash and check it against the sealed
      // handoff value (a REAL check over real files; the on-chain CPI itself
      // is what's simulated) --------------------------------------------
      const pbh = proofBundleHash(buildProofBundle(fixture, finalRecord));
      if (pbh !== handoff.proofBundleHash)
        return fail("recomputed proofBundleHash differs from sealed handoff value");
      const derivedPda = lookupDailyRootPda(fixture.dailyRootPdaByEpochDay, finalRecord.timestampMs);
      if (derivedPda !== handoff.rootAccount)
        return fail("daily root PDA does not match the timestamp-derived PDA");
      const simSlot =
        351_000_000 + Number(BigInt(keccak256(stringToBytes(`proofline.sim.slot.${fixture.fixtureId}`))) % 50_000n);
      await sink.emit({ type: "TXLINE_CPI_VERIFIED", slot: simSlot }, true);

      // --- Canonical MatchOutcomeV1 payload — every field deterministic from
      // the recorded fixture (no Date.now anywhere near payload fields) ---
      // Level 4 derives validationInstructionHash INDEPENDENTLY of Level 3 by
      // rebuilding the same canonical instruction (shared builder, not a
      // copied digest — the §3.7 no-copy-paste rule).
      const built = buildValidateStatV2Transaction({
        fixtureId: fixture.fixtureId,
        participant1Score: finalRecord.participant1Score,
        participant2Score: finalRecord.participant2Score,
        period: finalRecord.period,
        txoracleProgramB58: config.txoracleProgramId,
        dailyRootAccountB58: handoff.rootAccount,
      });
      const txlineProgramId = base58ToHex32(config.txoracleProgramId);
      const dailyRootAccount = base58ToHex32(handoff.rootAccount);
      const vih = validationInstructionHash(txlineProgramId, dailyRootAccount, built.instructionData);
      const result: ResultCode =
        finalRecord.participant1Score > finalRecord.participant2Score
          ? RESULT.HOME
          : finalRecord.participant1Score === finalRecord.participant2Score
            ? RESULT.DRAW
            : RESULT.AWAY;
      const outcome: MatchOutcomeV1 = {
        flags: 0,
        destinationChain: fixture.destinationChain ?? WORMHOLE_CHAIN_BASE_SEPOLIA,
        sourceValidationVersion: SOURCE_VALIDATION.VALIDATE_STAT_V2,
        result,
        fixtureId: BigInt(fixture.fixtureId),
        scoreSequence: BigInt(finalRecord.sequence),
        proofTimestampMs: BigInt(finalRecord.timestampMs),
        period: finalRecord.period,
        participant1Score: finalRecord.participant1Score,
        participant2Score: finalRecord.participant2Score,
        txlineProgramId,
        dailyRootAccount,
        validationInstructionHash: vih,
        proofBundleHash: pbh,
      };
      const payload = encodeMatchOutcomeV1(outcome);
      const payloadHex = bytesToHex(payload);
      const emitterAddress = base58ToHex32(handoff.wormhole.emitterBase58);
      const attId = attestationId({
        sourceEmitter: emitterAddress,
        fixtureId: outcome.fixtureId,
        scoreSequence: outcome.scoreSequence,
        validationInstructionHash: vih,
        proofBundleHash: pbh,
      });

      // Conformance gate: for the recorded demo fixture the payload bytes must
      // reproduce packages/test-vectors/match-outcome-v1.json EXACTLY.
      const vectorPath = join(workflowDir, "../../packages/test-vectors/match-outcome-v1.json");
      const vector = readJsonFile<ConformanceVector>(vectorPath);
      if (
        vector &&
        vector.outcome.fixtureId === fixture.fixtureId &&
        vector.outcome.scoreSequence === finalRecord.sequence
      ) {
        const mismatches: string[] = [];
        if (payloadHex !== vector.encodedPayload)
          mismatches.push(`encodedPayload\n  got  ${payloadHex}\n  want ${vector.encodedPayload}`);
        if (attId !== vector.attestationId)
          mismatches.push(`attestationId got ${attId} want ${vector.attestationId}`);
        if (emitterAddress !== vector.sourceEmitter)
          mismatches.push(`sourceEmitter got ${emitterAddress} want ${vector.sourceEmitter}`);
        if (mismatches.length) {
          await sink.emit(
            { type: "RUN_FAILED", stage: "vaa-executor", reason: `conformance vector mismatch: ${mismatches.length} field(s)` },
            true,
          );
          throw new Error(`conformance vector mismatch:\n${mismatches.join("\n")}`);
        }
        log.info("conformance vector reproduced byte-for-byte", { attestationId: attId });
      }

      // --- VAA body — deterministic fields only (timestamp from the proof
      // record, not the wall clock) --------------------------------------
      const body: VaaBody = {
        timestamp: Math.floor(finalRecord.timestampMs / 1000),
        nonce: 0,
        emitterChainId: WORMHOLE_CHAIN_SOLANA,
        emitterAddress,
        sequence: BigInt(handoff.wormhole.sequence),
        consistencyLevel: 1, // finalized
        payload,
      };
      await sink.emit(
        { type: "WORMHOLE_MESSAGE_PUBLISHED", emitter: handoff.wormhole.emitterBase58, sequence: handoff.wormhole.sequence },
        true, // SIMULATED leg: no real Solana emission exists in this build
      );

      // --- "Poll VAA source" — identical polling contract to Wormholescan /
      // guardian RPC; the dev-guardian source is SIMULATED observation with
      // REAL signature math. The signer writes vaa.bin, then we poll it back.
      if (config.vaaSource.kind === "dev-guardian-file") {
        const signed = await signVaaWithDevGuardians(body);
        mkdirSync(dirname(vaaLocator), { recursive: true });
        writeFileSync(vaaLocator, Buffer.from(encodeVaa(signed)));
      }
      const fetched = await fetchVaa(
        { kind: config.vaaSource.kind, locator: vaaLocator },
        { emitterChainId: body.emitterChainId, emitterAddress, sequence: body.sequence },
      );
      if (!fetched) {
        log.info("VAA not yet available from source — retry next heartbeat", { tick });
        return "continue";
      }
      const { bytes: vaaBytes, vaa } = fetched;

      // --- Decode + validate the header LOCALLY before spending gas -------
      if (vaa.version !== 1) return fail(`unsupported VAA version ${vaa.version}`);
      if (vaa.signatures.length < GUARDIAN_QUORUM)
        return fail(`no quorum: ${vaa.signatures.length} < ${GUARDIAN_QUORUM}`);
      const digest = vaaSigningDigest(vaa);
      let lastIndex = -1;
      for (const sig of vaa.signatures) {
        if (sig.guardianIndex <= lastIndex) return fail("signature indices not strictly ascending");
        lastIndex = sig.guardianIndex;
        const recovered = await recoverAddress({
          hash: digest,
          signature: `0x${sig.r.slice(2)}${sig.s.slice(2)}${(sig.v + 27).toString(16).padStart(2, "0")}` as `0x${string}`,
        });
        if (recovered.toLowerCase() !== devGuardianAddress(sig.guardianIndex).toLowerCase())
          return fail(`signature ${sig.guardianIndex} does not recover to its guardian address`);
      }
      const decodedOutcome = decodeMatchOutcomeV1(vaa.payload);
      if (bytesToHex(vaa.payload) !== payloadHex) return fail("fetched VAA payload differs from built payload");
      const hash = vaaHash(vaaBytes);
      await sink.emit(
        { type: "VAA_READY", vaaHash: hash, signatures: vaa.signatures.map((s) => s.guardianIndex) },
        true, // guardian OBSERVATION is simulated (dev set); the signatures are real secp256k1
      );

      writeJsonFileAtomic(join(runDir, "vaa-decoded.json"), {
        simulatedLeg: "dev-guardian-set (real signature math, simulated observation)",
        vaaHash: hash,
        signingDigest: digest,
        version: vaa.version,
        guardianSetIndex: vaa.guardianSetIndex,
        signatures: vaa.signatures,
        timestamp: vaa.timestamp,
        nonce: vaa.nonce,
        emitterChainId: vaa.emitterChainId,
        emitterAddress: vaa.emitterAddress,
        sequence: vaa.sequence.toString(),
        consistencyLevel: vaa.consistencyLevel,
        payloadHex,
        decodedOutcome: JSON.parse(
          JSON.stringify(decodedOutcome, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
        ),
        attestationId: attId,
      });

      // --- CRE report: the payload is the EXACT VAA bytes ----------------
      const vaaHex = bytesToHex(vaaBytes);
      const report = creReport(vaaHex);
      const receiverAddress = deployedContract(config.receiver.deployment, config.receiver.contract);
      const marketAddress = config.market?.settle
        ? deployedContract(config.market.deployment, config.market.contract)
        : undefined;
      const submitVaaCalldata = encodeSubmitVaaCalldata(vaaHex);
      const onReportCalldata = encodeLevel4OnReportCalldata(vaaHex);

      const rpcUrl = process.env[config.receiver.rpcUrlEnv ?? "BASE_RPC_URL"];
      const forwarderKey = resolveSecret(config.forwarder.privateKeySecret); // never logged
      let txHash: string;
      let settleTxHash: string | undefined;
      let liveDelivery = false;
      let dualFinalized = false;

      if (config.mode === "live" && rpcUrl && forwarderKey && receiverAddress) {
        // LIVE mode — permissionless submitVaa via @proofline/evm-sdk, then
        // read the registry back for the REAL dual-finality state.
        const account = privateKeyToAccount(forwarderKey as `0x${string}`);
        const { publicClient, chain } = makeClients(rpcUrl);
        const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
        txHash = await sendSubmitVaa(wallet, receiverAddress as `0x${string}`, vaaHex);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        liveDelivery = true;
        await sink.emit({ type: "LEVEL4_BASE_SUBMITTED", txHash }, false);
        await sink.emit({ type: "BASE_VAA_VERIFIED", blockNumber: Number(receipt.blockNumber) }, false);

        const registryAddress = deployedContract(config.receiver.deployment, "finalityRegistry");
        if (registryAddress) {
          const fin = await finalizeOnBase({
            sink,
            log,
            publicClient,
            wallet,
            registryAddress: registryAddress as `0x${string}`,
            marketAddress: marketAddress as `0x${string}` | undefined,
            fixtureId: outcome.fixtureId,
          });
          dualFinalized = fin.dualFinalized;
          settleTxHash = fin.settleTxHash;
        }
      } else {
        if (config.mode === "live")
          log.warn("live mode requested but missing rpc url / forwarder key / receiver — falling back to sim output", {
            haveRpcUrl: Boolean(rpcUrl),
            haveForwarderKey: Boolean(forwarderKey),
            receiver: receiverAddress ?? null,
          });
        // SIM mode — exact calldata to level4-report.json; "sim:" hashes by design.
        txHash = simSignature("level4-submitvaa", hash);
        await sink.emit({ type: "LEVEL4_BASE_SUBMITTED", txHash }, true);
        const simBlock = 44_000_000 + Number(BigInt(hash) % 1_000_000n);
        await sink.emit({ type: "BASE_VAA_VERIFIED", blockNumber: simBlock }, true);

        // Local dual-finality reconciliation — a REAL digest-equality check
        // against the Level 3 report (the same comparison FinalityRegistry
        // performs on-chain); only the venue is simulated.
        const level3 = readJsonFile<{ report?: { attestationId?: string } }>(
          join(runDir, "level3-report.json"),
        );
        const level3AttId = level3?.report?.attestationId;
        if (level3AttId === attId) {
          await sink.emit({ type: "DUAL_FINALITY_REACHED", attestationId: attId }, true);
          if (config.market?.settle) {
            settleTxHash = simSignature("market-settle", attId);
            await sink.emit({ type: "CONSUMER_SETTLED", txHash: settleTxHash }, true);
          }
        } else if (level3AttId) {
          return fail(`attestationId mismatch vs Level 3: L3=${level3AttId} L4=${attId} — would freeze in Conflict`);
        } else {
          log.info("no level3-report.json yet — dual finality not asserted in this run", {});
        }
      }

      writeJsonFileAtomic(join(runDir, "level4-report.json"), {
        simulated: !liveDelivery,
        note: liveDelivery
          ? "VAA delivered live via @proofline/evm-sdk submitVaa (permissionless path)"
          : "SIM MODE — no Base transaction sent. submitVaaCalldata (permissionless) and onReportCalldata (forwarder path) below are exactly what live mode submits; report payload is the EXACT VAA bytes; tx hashes are 'sim:'-prefixed and can never pass as real.",
        chainId: config.receiver.chainId,
        receiver: receiverAddress ?? null,
        market: marketAddress ?? null,
        txHash,
        settleTxHash: settleTxHash ?? null,
        vaaHash: hash,
        attestationId: attId,
        creReport: report,
        vaaHex,
        submitVaaCalldata,
        onReportCalldata,
      });

      writeJsonFileAtomic(statePath, {
        phase: "submitted",
        attestationId: attId,
        vaaHash: hash,
        txHash,
        dualFinalized: liveDelivery ? dualFinalized : undefined,
        settleTxHash,
      } satisfies VaaExecutorState);
      log.info("level4 delivery complete", { attestationId: attId, vaaHash: hash, txHash });
      return "done";
    },
  });
  log.info("vaa-executor run complete");
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
