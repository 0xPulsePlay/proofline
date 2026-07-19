/**
 * proofline-level3-attestor — CRE workflow #2 (design §3.6).
 *
 * heartbeat → read source-dispatch handoff → build the exact canonical
 * TxOracle validate_stat_v2 simulation transaction → submit the IDENTICAL
 * serialized transaction to 3 independent Solana RPC providers → require a
 * 2-of-3 quorum on STABLE OUTPUTS ONLY → anti-spoofing assertions → derive
 * attestationId → ABI-encode the Level 3 report → deliver to
 * CRELevel3Receiver on Base.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HONESTY NOTE — what runs where in this build:
 * Written to the CRE programming model (workflow.yaml + config + runtime/
 * report pattern) but executed by a LOCAL SIMULATION runner: `pnpm tsx
 * main.ts --config config/config.local.yaml`. No DON is deployed. The three
 * RPC "providers" (`sim://recorded/*`) are deterministic RECORDED responders,
 * not live Solana RPCs — their responses differ per provider in slot /
 * unitsConsumed on purpose, proving the stable-outputs-only comparison; the
 * events they produce are labeled `simulated: true`. In sim mode no Base
 * transaction is sent: the exact onReport calldata is written to
 * level3-report.json and the emitted tx hash is "sim:"-prefixed so it can
 * never pass as real. REAL in this build: canonical transaction serialization
 * and its keccak digest, the decode-and-verify anti-spoofing assertions, the
 * stable-outputs extraction/agreement math, every hash derivation
 * (validationInstructionHash / proofBundleHash / attestationId — checked
 * byte-for-byte against packages/test-vectors/match-outcome-v1.json), and the
 * ABI encoding the Base receiver decodes.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * State-transition discipline (§3.6): no handoff → wait, no writes;
 * quorum reached → ONE report; already reported → no-op. Idempotency lives in
 * level3-attestor.state.json under runDir.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, encodeAbiParameters, http, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  attestationId,
  base58ToHex32,
  FINAL_MARKER,
  proofBundleHash,
  RESULT,
  validationInstructionHash,
  type ResultCode,
} from "@proofline/protocol";
import { createLogger } from "@proofline/observability";
import {
  buildProofBundle,
  buildSimulateTransactionRequest,
  buildValidateStatV2Transaction,
  bytesToBase64,
  createEventSink,
  cronHeartbeat,
  decodeValidateStatV2Transaction,
  creReport,
  extractStableOutputs,
  loadWorkflowConfig,
  lookupDailyRootPda,
  parseValidateStatV2Data,
  readJsonFile,
  resolveConfigPath,
  resolveSecret,
  simSignature,
  stableOutputsAgree,
  writeJsonFileAtomic,
  type FixtureState,
  type SimulateTransactionRequest,
  type SimulateTransactionResponse,
} from "@proofline/config/cre-runtime";
import { deployedContract } from "@proofline/config/deployments";
import { encodeLevel3OnReportCalldata, makeClients, sendLevel3Report } from "@proofline/evm-sdk";

interface RpcProviderConfig {
  name: string;
  url: string;
  mode: "simulated" | "live";
}

interface Level3AttestorConfig {
  mode: "simulation" | "live";
  runId: string;
  runDir: string;
  heartbeat: { intervalMs: number; maxTicks?: number };
  rpcProviders: RpcProviderConfig[];
  quorum: number;
  txoracleProgramId: string;
  receiver: { chainId: number; deployment: string; contract: string; rpcUrlEnv?: string };
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

interface Level3AttestorState {
  phase: "watching" | "reported";
  attestationId?: `0x${string}`;
  txHash?: string;
}

interface ConformanceVector {
  outcome: {
    fixtureId: string;
    scoreSequence: string;
    validationInstructionHash: `0x${string}`;
    proofBundleHash: `0x${string}`;
  };
  attestationId: `0x${string}`;
}

// ---------------------------------------------------------------------------
// Deterministic recorded RPC responder (the `sim://recorded/<name>` providers)
// ---------------------------------------------------------------------------

/**
 * SIMULATED provider: a deterministic recorded responder standing in for one
 * independent Solana RPC. Per-provider slot and unitsConsumed deliberately
 * DIFFER (derived from provider name + request bytes) — exactly the fields
 * real providers legitimately disagree on — proving that agreement is judged
 * on stable outputs only. err is null and the return data is the TxOracle
 * program returning byte 0x01 (true), as recorded for fixture 982341.
 */
function recordedSimulateResponse(
  provider: RpcProviderConfig,
  req: SimulateTransactionRequest,
  txoracleProgramB58: string,
): SimulateTransactionResponse {
  const seed = BigInt(
    keccak256(stringToBytes(`proofline.sim.rpc.${provider.name}.${req.params[0]}`)),
  );
  const slot = 351_000_000 + Number(seed % 50_000n);
  const unitsConsumed = 42_000 + Number((seed >> 64n) % 9_000n);
  return {
    jsonrpc: "2.0",
    id: req.id,
    result: {
      context: { slot, apiVersion: "2.0.15" },
      value: {
        err: null,
        logs: [
          `Program ${txoracleProgramB58} invoke [1]`,
          `Program ${txoracleProgramB58} consumed ${unitsConsumed} of 200000 compute units`,
          `Program ${txoracleProgramB58} success`,
        ],
        returnData: {
          programId: txoracleProgramB58,
          data: [bytesToBase64(new Uint8Array([1])), "base64"],
        },
        unitsConsumed,
      },
    },
  };
}

async function simulateOnProvider(
  provider: RpcProviderConfig,
  req: SimulateTransactionRequest,
  txoracleProgramB58: string,
): Promise<{ response: SimulateTransactionResponse; live: boolean }> {
  if (provider.mode === "simulated" || provider.url.startsWith("sim://")) {
    return { response: recordedSimulateResponse(provider, req, txoracleProgramB58), live: false };
  }
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`${provider.name} responded ${res.status}`);
  return { response: (await res.json()) as SimulateTransactionResponse, live: true };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const log = createLogger("cre-level3-attestor");
  const workflowDir = dirname(fileURLToPath(import.meta.url));
  const configFlag = process.argv.indexOf("--config");
  const configPath =
    configFlag >= 0 ? process.argv[configFlag + 1] : join(workflowDir, "config/config.local.yaml");
  const { config, configDir } = loadWorkflowConfig<Level3AttestorConfig>(configPath);
  const runDir = resolveConfigPath(configDir, config.runDir);
  const statePath = join(runDir, "level3-attestor.state.json");
  const handoffPath = join(runDir, "handoff.json");
  const sink = createEventSink(process.env.COORDINATOR_URL ?? config.coordinatorUrl);
  const txoracleB58 = config.txoracleProgramId;

  log.info("local simulation runner starting (no deployed DON)", {
    configPath,
    runDir,
    eventSink: sink.mode,
    providers: config.rpcProviders.map((p) => `${p.name}(${p.mode})`),
    quorum: config.quorum,
  });

  await cronHeartbeat({
    intervalMs: config.heartbeat.intervalMs,
    maxTicks: config.heartbeat.maxTicks,
    onTick: async (tick) => {
      const now = Date.now();
      await sink.emit({ type: "HEARTBEAT", at: now, nextAt: now + config.heartbeat.intervalMs }, false);

      const state = readJsonFile<Level3AttestorState>(statePath) ?? { phase: "watching" };
      if (state.phase === "reported") {
        // already reported → no-op (idempotent; §3.6)
        log.info("already reported — no-op", { tick, attestationId: state.attestationId });
        return "done";
      }

      const handoff = readJsonFile<Handoff>(handoffPath);
      if (!handoff) {
        // Source-dispatch has not staged yet → wait, no writes.
        log.info("no handoff yet — waiting for source-dispatch", { tick, handoffPath });
        return "continue";
      }
      if (!handoff.fixturePath) {
        await sink.emit(
          { type: "RUN_FAILED", stage: "level3-attestor", reason: "handoff has no fixturePath (live TxLINE branch not wired in this build)" },
          true,
        );
        return "done";
      }

      // Re-read the recorded fixture ourselves — Level 3 must not trust the
      // packager beyond what it can independently re-verify (§3.4 item 5).
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
      if (!finalRecord) {
        await sink.emit(
          { type: "RUN_FAILED", stage: "level3-attestor", reason: "handoff exists but fixture has no final record" },
          true,
        );
        return "done";
      }

      // --- Canonical simulation transaction (ONE serialization; identical
      // bytes go to every provider) -------------------------------------
      const built = buildValidateStatV2Transaction({
        fixtureId: fixture.fixtureId,
        participant1Score: finalRecord.participant1Score,
        participant2Score: finalRecord.participant2Score,
        period: finalRecord.period,
        txoracleProgramB58: txoracleB58,
        dailyRootAccountB58: handoff.rootAccount,
      });

      // --- Anti-spoofing assertions (§3.4 item 5), run against the DECODED
      // serialized bytes, not the builder inputs ------------------------
      const decoded = decodeValidateStatV2Transaction(built.txBytes);
      const expectedProgramHex = base58ToHex32(txoracleB58);
      const failSpoof = async (reason: string) => {
        await sink.emit({ type: "RUN_FAILED", stage: "level3-attestor", reason }, true);
        return "done" as const;
      };
      if (decoded.programHex !== expectedProgramHex)
        return failSpoof("packaged tx program id is not the TxLINE TxOracle program");
      const derivedPda = lookupDailyRootPda(fixture.dailyRootPdaByEpochDay, finalRecord.timestampMs);
      if (derivedPda !== handoff.rootAccount || decoded.dailyRootHex !== base58ToHex32(derivedPda))
        return failSpoof("daily root PDA does not match the timestamp-derived PDA");
      const parsed = parseValidateStatV2Data(decoded.instructionData);
      if (
        parsed.fixtureId !== fixture.fixtureId ||
        parsed.participant1Score !== finalRecord.participant1Score ||
        parsed.participant2Score !== finalRecord.participant2Score ||
        parsed.period !== finalRecord.period
      )
        return failSpoof("instruction predicate does not match the reported final scores");

      // --- Fan out to the 3 providers; agreement on STABLE OUTPUTS ONLY --
      const request = buildSimulateTransactionRequest(built.txBase64);
      let agreedCount = 0;
      const providerResults: {
        provider: string;
        agreed: boolean;
        live: boolean;
        slot: number;
        unitsConsumed?: number;
      }[] = [];
      for (const provider of config.rpcProviders) {
        const { response, live } = await simulateOnProvider(provider, request, txoracleB58);
        const stable = extractStableOutputs(response, txoracleB58);
        const agreed = stableOutputsAgree(stable, txoracleB58);
        if (agreed) agreedCount++;
        providerResults.push({
          provider: provider.name,
          agreed,
          live,
          slot: response.result.context.slot,
          unitsConsumed: response.result.value.unitsConsumed,
        });
        await sink.emit(
          { type: "LEVEL3_RPC_RESULT", provider: provider.name, agreed, simulationDigest: built.txDigest },
          !live,
        );
        log.info("provider result (slots/units differ by design; not compared)", {
          provider: provider.name,
          agreed,
          slot: response.result.context.slot,
          unitsConsumed: response.result.value.unitsConsumed,
        });
      }
      if (agreedCount < config.quorum) {
        await sink.emit(
          {
            type: "RUN_FAILED",
            stage: "level3-attestor",
            reason: `quorum not reached: ${agreedCount}/${config.rpcProviders.length} agreed, need ${config.quorum}`,
          },
          true,
        );
        return "done";
      }

      // --- Independent digest derivation (the dual-finality identity) ----
      // proofBundleHash is recomputed from the fixture, not copied from the
      // handoff; the handoff value is cross-checked.
      const pbh = proofBundleHash(buildProofBundle(fixture, finalRecord));
      if (pbh !== handoff.proofBundleHash)
        return failSpoof("recomputed proofBundleHash differs from handoff");
      const vih = validationInstructionHash(expectedProgramHex, decoded.dailyRootHex, decoded.instructionData);
      const emitterB58 = handoff.wormhole?.emitterBase58 ?? fixture.wormhole?.emitterBase58;
      if (!emitterB58) return failSpoof("handoff carries no wormhole emitter");
      const sourceEmitter = base58ToHex32(emitterB58);
      const fixtureIdBig = BigInt(fixture.fixtureId);
      const sequenceBig = BigInt(finalRecord.sequence);
      const attId = attestationId({
        sourceEmitter,
        fixtureId: fixtureIdBig,
        scoreSequence: sequenceBig,
        validationInstructionHash: vih,
        proofBundleHash: pbh,
      });

      // Conformance gate: for the recorded demo fixture the derivation must
      // reproduce packages/test-vectors/match-outcome-v1.json byte-for-byte.
      const vectorPath = join(workflowDir, "../../packages/test-vectors/match-outcome-v1.json");
      const vector = readJsonFile<ConformanceVector>(vectorPath);
      if (
        vector &&
        vector.outcome.fixtureId === fixture.fixtureId &&
        vector.outcome.scoreSequence === finalRecord.sequence
      ) {
        const mismatches: string[] = [];
        if (vih !== vector.outcome.validationInstructionHash)
          mismatches.push(`validationInstructionHash ${vih} != ${vector.outcome.validationInstructionHash}`);
        if (pbh !== vector.outcome.proofBundleHash)
          mismatches.push(`proofBundleHash ${pbh} != ${vector.outcome.proofBundleHash}`);
        if (attId !== vector.attestationId)
          mismatches.push(`attestationId ${attId} != ${vector.attestationId}`);
        if (mismatches.length) {
          await sink.emit(
            { type: "RUN_FAILED", stage: "level3-attestor", reason: `conformance vector mismatch: ${mismatches.join("; ")}` },
            true,
          );
          throw new Error(`conformance vector mismatch:\n${mismatches.join("\n")}`);
        }
        log.info("conformance vector reproduced byte-for-byte", { attestationId: attId });
      }

      // --- Level 3 report: abi.encode(Level3Report) — field order exactly as
      // the struct in CRELevel3Receiver.sol ------------------------------
      const result: ResultCode =
        finalRecord.participant1Score > finalRecord.participant2Score
          ? RESULT.HOME
          : finalRecord.participant1Score === finalRecord.participant2Score
            ? RESULT.DRAW
            : RESULT.AWAY;
      const reportHex = encodeAbiParameters(
        [
          { name: "attestationId", type: "bytes32" },
          { name: "fixtureId", type: "int64" },
          { name: "participant1Score", type: "int32" },
          { name: "participant2Score", type: "int32" },
          { name: "proofBundleHash", type: "bytes32" },
          { name: "result", type: "uint8" },
        ],
        [attId, fixtureIdBig, finalRecord.participant1Score, finalRecord.participant2Score, pbh, result],
      );
      const report = creReport(reportHex);
      const receiverAddress = deployedContract(config.receiver.deployment, config.receiver.contract);

      // onReport(bytes metadata, bytes report) — metadata intentionally empty.
      const onReportCalldata = encodeLevel3OnReportCalldata(reportHex);

      let txHash: string;
      let liveDelivery = false;
      const rpcUrl = process.env[config.receiver.rpcUrlEnv ?? "BASE_RPC_URL"];
      const forwarderKey = resolveSecret(config.forwarder.privateKeySecret); // never logged
      if (config.mode === "live" && rpcUrl && forwarderKey && receiverAddress) {
        // LIVE mode — deliver via the forwarder EOA through @proofline/evm-sdk.
        const account = privateKeyToAccount(forwarderKey as `0x${string}`);
        const { publicClient, chain } = makeClients(rpcUrl, config.receiver.chainId);
        const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
        txHash = await sendLevel3Report(wallet, receiverAddress as `0x${string}`, reportHex);
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        liveDelivery = true;
        log.info("Level 3 report delivered on Base", { txHash, receiver: receiverAddress });
      } else {
        if (config.mode === "live")
          log.warn("live mode requested but missing rpc url / forwarder key / receiver — falling back to sim output", {
            haveRpcUrl: Boolean(rpcUrl),
            haveForwarderKey: Boolean(forwarderKey),
            receiver: receiverAddress ?? null,
          });
        // SIM mode — print the exact calldata and hand off; "sim:" tx hash by design.
        txHash = simSignature("level3-onreport", attId);
      }

      writeJsonFileAtomic(join(runDir, "level3-report.json"), {
        simulated: !liveDelivery,
        note: liveDelivery
          ? "Level 3 report delivered live via @proofline/evm-sdk"
          : "SIM MODE — no Base transaction sent. onReportCalldata below is exactly what live mode submits to CRELevel3Receiver.onReport; the txHash is 'sim:'-prefixed and can never pass as real.",
        chainId: config.receiver.chainId,
        receiver: receiverAddress ?? null,
        txHash,
        report: {
          attestationId: attId,
          fixtureId: fixture.fixtureId,
          participant1Score: finalRecord.participant1Score,
          participant2Score: finalRecord.participant2Score,
          proofBundleHash: pbh,
          result,
        },
        reportAbi: reportHex,
        creReport: report,
        onReportCalldata,
        validationInstructionHash: vih,
        simulationTxBase64: built.txBase64,
        simulationTxDigest: built.txDigest,
        sourceEmitter,
        quorum: { required: config.quorum, agreed: agreedCount, providers: providerResults },
      });

      await sink.emit({ type: "LEVEL3_BASE_FINALIZED", txHash }, !liveDelivery);
      writeJsonFileAtomic(statePath, {
        phase: "reported",
        attestationId: attId,
        txHash,
      } satisfies Level3AttestorState);
      log.info("level3 attestation complete", { attestationId: attId, txHash, agreedCount });
      return "done";
    },
  });
  log.info("level3-attestor run complete");
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
