/**
 * proofline-source-dispatch — CRE workflow #1 (design §3.6).
 *
 * heartbeat → fetch fixture state → detect game_finalised → wait for proof
 * availability → canonicalize proof → create/locate sealed ProofBuffer →
 * write compact verification command → record source tx signature.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HONESTY NOTE — what runs where in this build:
 * Written to the CRE programming model (workflow.yaml + config + runtime/
 * report pattern) but executed by a LOCAL SIMULATION runner: `pnpm tsx
 * main.ts --config config/config.local.yaml`. No DON is deployed. The Solana
 * leg (ProofBuffer staging + verification command) is SIMULATED via a
 * file-backed ProofBuffer mock and emits events with `simulated: true`;
 * signatures are "sim:"-prefixed so they can never pass as real ones.
 * REAL in this build: fixture-state reads, final-record detection, proof
 * canonicalization + keccak256 bundle hashing, chunk/seal verification, the
 * state machine, and every emitted event (each corresponds to an action that
 * actually happened — the no-fake-animation rule).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * State-transition discipline (§3.6): IN_PLAY → no action; game_finalised →
 * wait for proof; proof unavailable → retry, no writes; proof verified → one
 * staged write; already relayed → no-op. Idempotency lives in a run-state
 * JSON file under runDir.
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINAL_MARKER, proofBundleHash } from "@proofline/protocol";
import { createLogger } from "@proofline/observability";
import {
  buildProofBundle,
  createEventSink,
  cronHeartbeat,
  fetchFixtureState,
  findFinalRecord,
  loadWorkflowConfig,
  lookupDailyRootPda,
  readJsonFile,
  resolveConfigPath,
  simSignature,
  writeJsonFileAtomic,
  type FixtureState,
} from "@proofline/config/cre-runtime";
import { FileBackedProofBufferAdapter, stageProofBundle, sealProofBuffer } from "@proofline/proof-uploader";

interface SourceDispatchConfig {
  mode: "simulation" | "live";
  runId: string;
  runDir: string;
  fixture: { source: "file" | "txline-api"; path?: string; fixtureId?: string };
  heartbeat: { intervalMs: number; maxTicks?: number };
  proofBuffer: { chunkSize: number };
  coordinatorUrl?: string;
  secrets?: string[];
}

type Phase = "watching" | "final_observed" | "staged";

interface SourceDispatchState {
  phase: Phase;
  finalObservedTick?: number;
  proofBundleHash?: `0x${string}`;
  bufferAddress?: string;
  sealSignature?: string;
  verifyCommandSignature?: string;
}

/** Handoff consumed by cre-level3-attestor and cre-vaa-executor. */
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

async function main(): Promise<void> {
  const log = createLogger("cre-source-dispatch");
  const configFlag = process.argv.indexOf("--config");
  const configPath =
    configFlag >= 0
      ? process.argv[configFlag + 1]
      : join(dirname(fileURLToPath(import.meta.url)), "config/config.local.yaml");
  const { config, configDir } = loadWorkflowConfig<SourceDispatchConfig>(configPath);
  const runDir = resolveConfigPath(configDir, config.runDir);
  const fixturePath = config.fixture.path
    ? resolveConfigPath(configDir, config.fixture.path)
    : undefined;
  const statePath = join(runDir, "source-dispatch.state.json");
  const sink = createEventSink(process.env.COORDINATOR_URL ?? config.coordinatorUrl);
  const adapter = new FileBackedProofBufferAdapter(join(runDir, "proof-buffer"));

  log.info("local simulation runner starting (no deployed DON)", {
    configPath,
    runDir,
    eventSink: sink.mode,
  });

  await cronHeartbeat({
    intervalMs: config.heartbeat.intervalMs,
    maxTicks: config.heartbeat.maxTicks,
    onTick: async (tick) => {
      const now = Date.now();
      // The heartbeat is a real observer action; it belongs here, never on-chain.
      await sink.emit({ type: "HEARTBEAT", at: now, nextAt: now + config.heartbeat.intervalMs }, false);

      const state = readJsonFile<SourceDispatchState>(statePath) ?? { phase: "watching" };
      if (state.phase === "staged") {
        // already relayed → no-op (idempotent; §3.6)
        log.info("already staged — no-op", { tick, bufferAddress: state.bufferAddress });
        return "done";
      }

      const { state: fixture, live } = await fetchFixtureState({
        source: config.fixture.source,
        fixturePath,
        fixtureId: config.fixture.fixtureId,
        apiKeySecretName: "TXLINE_API_KEY",
      });
      const finalRecord = findFinalRecord(fixture, FINAL_MARKER);
      if (!finalRecord) {
        // IN_PLAY → no action, no writes.
        log.info("fixture in play — no action", { tick, fixtureId: fixture.fixtureId });
        return "continue";
      }

      if (state.phase === "watching") {
        await sink.emit(
          { type: "FINAL_RECORD_OBSERVED", fixtureId: fixture.fixtureId, sequence: finalRecord.sequence },
          !live,
        );
        state.phase = "final_observed";
        state.finalObservedTick = tick;
        writeJsonFileAtomic(statePath, state);
      }

      // Wait for TxLINE proof availability (five-minute batch close + indexing;
      // modeled as a tick delay by the deterministic recorded fixture).
      const readyAfter = fixture.proofAvailability?.ticksAfterFinalObserved ?? 0;
      if (tick < (state.finalObservedTick ?? tick) + readyAfter) {
        log.info("proof unavailable — retry next heartbeat, no writes", { tick });
        return "continue";
      }

      // Canonicalize the proof into the evidence bundle and hash it.
      const bundle = buildProofBundle(fixture, finalRecord);
      const bundleHash = proofBundleHash(bundle);
      await sink.emit({ type: "PROOF_AVAILABLE", proofHash: bundleHash, rootPda: fixture.rootAccount }, !live);

      // Cross-check the recorded daily-root PDA against the proof timestamp
      // (the same invariant Level 3's anti-spoofing assertions re-run).
      const derivedPda = lookupDailyRootPda(fixture.dailyRootPdaByEpochDay, finalRecord.timestampMs);
      if (derivedPda !== fixture.rootAccount) {
        await sink.emit(
          { type: "RUN_FAILED", stage: "source-dispatch", reason: "daily root PDA does not match proof timestamp" },
          !live,
        );
        return "done";
      }

      // Create/locate the sealed ProofBuffer (untrusted-transport component;
      // Solana leg SIMULATED — file-backed mock, real chunk/seal-hash logic).
      const staged = await stageProofBundle(adapter, bundle, {
        seed: `${fixture.fixtureId}:${finalRecord.sequence}`,
        chunkSize: config.proofBuffer.chunkSize,
      });
      const seal = await sealProofBuffer(adapter, staged.bufferAddress, bundleHash);
      await sink.emit({ type: "PROOF_STAGED", solanaSignature: seal.signature }, true);
      log.info("proof buffer sealed", {
        bufferAddress: staged.bufferAddress,
        chunks: staged.chunkCount,
        bytes: staged.byteLength,
      });

      // Compact verification command — on the live path this is the small
      // instruction CRE sends to the adapter program; simulated here.
      const verifyCommand = {
        kind: "verify_outcome",
        proofBuffer: staged.bufferAddress,
        expectedHash: bundleHash,
        fixtureId: fixture.fixtureId,
        sequence: finalRecord.sequence,
        dailyRootAccount: fixture.rootAccount,
        strategy: fixture.strategy,
        simulated: true,
      };
      writeJsonFileAtomic(join(runDir, "verify-command.json"), verifyCommand);
      const verifySignature = simSignature("verify-command", `${fixture.fixtureId}:${finalRecord.sequence}`);
      await sink.emit({ type: "SOLANA_VERIFY_SUBMITTED", signature: verifySignature }, true);

      // Repo-relative in the handoff so recorded evidence stays portable
      // (consumers resolve against the repo root).
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
      const handoff: Handoff = {
        runId: config.runId,
        fixturePath: fixturePath ? relative(repoRoot, fixturePath) : undefined,
        fixtureId: fixture.fixtureId,
        sequence: finalRecord.sequence,
        proofBundleHash: bundleHash,
        bufferAddress: staged.bufferAddress,
        rootAccount: fixture.rootAccount,
        wormhole: fixture.wormhole,
        simulatedSolanaLeg: true,
      };
      writeJsonFileAtomic(join(runDir, "handoff.json"), handoff);

      writeJsonFileAtomic(statePath, {
        ...state,
        phase: "staged",
        proofBundleHash: bundleHash,
        bufferAddress: staged.bufferAddress,
        sealSignature: seal.signature,
        verifyCommandSignature: verifySignature,
      } satisfies SourceDispatchState);
      log.info("staged; next heartbeat will verify idempotent no-op", { tick });
      return "continue";
    },
  });
  log.info("source-dispatch run complete");
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
