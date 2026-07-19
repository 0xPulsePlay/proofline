/**
 * capture-run — assembles the §3.7 evidence layout for a completed pipeline
 * run: reads the workflow outputs + events from evidence/runs/<run-id> and
 * writes the canonical evidence files + manifest.json (the replay-mode input).
 *
 * Every artifact produced by a simulated leg is labeled `simulated: true` —
 * the Solana/Wormhole legs of this build never touched a real network and
 * their receipts say so explicitly (the no-fake-evidence rule).
 *
 * Usage: pnpm --filter @proofline/relay-cli capture-run -- --run-id <id>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINAL_MARKER } from "@proofline/protocol";
import { validateManifest, type RunEvent, type RunManifest } from "@proofline/event-model";
import { canonicalValidateStatV2Data, type FixtureState } from "@proofline/config/cre-runtime";
import { findDeployment } from "@proofline/config/deployments";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonOptional<T>(path: string): T | undefined {
  return existsSync(path) ? readJson<T>(path) : undefined;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

interface Handoff {
  runId: string;
  fixturePath?: string;
  fixtureId: string;
  sequence: string;
  proofBundleHash: string;
  bufferAddress: string;
  rootAccount: string;
  wormhole?: { emitterBase58: string; sequence: string };
  simulatedSolanaLeg: true;
}

async function main(): Promise<void> {
  const runId = argValue("--run-id");
  if (!runId) throw new Error("--run-id required");
  const runDir = argValue("--run-dir") ?? join(repoRoot, "evidence/runs", runId);
  if (!existsSync(runDir)) throw new Error(`run dir not found: ${runDir}`);

  const handoff = readJson<Handoff>(join(runDir, "handoff.json"));
  if (!handoff.fixturePath) throw new Error("handoff has no fixturePath");
  // Handoffs record fixturePath repo-relative for portability.
  const fixturePath = isAbsolute(handoff.fixturePath)
    ? handoff.fixturePath
    : join(repoRoot, handoff.fixturePath);
  const fixture = readJson<FixtureState>(fixturePath);
  const finalRecord = fixture.records.find(
    (r) =>
      r.action === FINAL_MARKER.action &&
      r.statusId === FINAL_MARKER.statusId &&
      r.period === FINAL_MARKER.period,
  );
  if (!finalRecord) throw new Error("fixture has no final record");

  const level3 = readJson<any>(join(runDir, "level3-report.json"));
  const level4 = readJson<any>(join(runDir, "level4-report.json"));
  const sourceState = readJsonOptional<any>(join(runDir, "source-dispatch.state.json"));
  const verifyCommand = readJsonOptional<any>(join(runDir, "verify-command.json"));

  // Both lanes MUST have independently derived the same attestationId — the
  // dual-finality identity. A mismatch is a broken run, not evidence.
  const l3Att = level3.report?.attestationId as string | undefined;
  const l4Att = level4.attestationId as string | undefined;
  if (!l3Att || !l4Att || l3Att !== l4Att)
    throw new Error(`attestationId mismatch/missing: L3=${l3Att} L4=${l4Att}`);

  // ---- txline-final-record.json — the exact canonical-bundle finalRecord
  // fields (plus timestampMs) so verify-evidence can rebuild the bundle -----
  writeJson(join(runDir, "txline-final-record.json"), {
    action: finalRecord.action,
    fixtureId: fixture.fixtureId,
    statusId: finalRecord.statusId,
    period: finalRecord.period,
    participant1: fixture.participant1,
    participant2: fixture.participant2,
    participant1Score: finalRecord.participant1Score,
    participant2Score: finalRecord.participant2Score,
    sequence: finalRecord.sequence,
    timestampMs: finalRecord.timestampMs,
    sourceNote: "recorded deterministic fixture (synthetic) — packages/test-vectors",
  });

  // ---- txline-proof.json — the proof side of the canonical bundle ---------
  writeJson(join(runDir, "txline-proof.json"), {
    proof: fixture.proof,
    rootAccount: fixture.rootAccount,
    strategy: fixture.strategy,
  });

  // ---- validation-instruction.bin — canonical validate_stat_v2 data -------
  const instructionData = canonicalValidateStatV2Data({
    fixtureId: fixture.fixtureId,
    participant1Score: finalRecord.participant1Score,
    participant2Score: finalRecord.participant2Score,
    period: finalRecord.period,
    txoracleProgramB58: "",
    dailyRootAccountB58: "",
  });
  writeFileSync(join(runDir, "validation-instruction.bin"), Buffer.from(instructionData));

  // ---- receipts (simulated legs labeled as such) --------------------------
  writeJson(join(runDir, "solana-verify-receipt.json"), {
    simulated: true,
    note: "Solana leg SIMULATED in this build — file-backed ProofBuffer + sim: signatures; no transaction was broadcast.",
    bufferAddress: handoff.bufferAddress,
    sealSignature: sourceState?.sealSignature ?? null,
    verifyCommandSignature: sourceState?.verifyCommandSignature ?? null,
    verifyCommand: verifyCommand ?? null,
  });
  writeJson(join(runDir, "solana-publish-receipt.json"), {
    simulated: true,
    note: "Wormhole publication SIMULATED in this build — no real Solana emission; the dev guardian set signed the VAA (see vaa-decoded.json).",
    emitter: handoff.wormhole?.emitterBase58 ?? null,
    sequence: handoff.wormhole?.sequence ?? null,
  });
  writeJson(join(runDir, "base-relay-receipt.json"), {
    level3: {
      simulated: Boolean(level3.simulated),
      txHash: level3.txHash,
      receiver: level3.receiver,
      chainId: level3.chainId,
      attestationId: l3Att,
    },
    level4: {
      simulated: Boolean(level4.simulated),
      txHash: level4.txHash,
      receiver: level4.receiver,
      chainId: level4.chainId,
      vaaHash: level4.vaaHash,
      attestationId: l4Att,
    },
  });
  if (level4.settleTxHash) {
    writeJson(join(runDir, "market-settlement-receipt.json"), {
      simulated: Boolean(level4.simulated),
      txHash: level4.settleTxHash,
      market: level4.market ?? null,
    });
  }

  // ---- events → manifest.json --------------------------------------------
  const eventsPath = join(runDir, "events.ndjson");
  if (!existsSync(eventsPath)) throw new Error(`no events.ndjson in ${runDir} — did relay-fixture run?`);
  const events: RunEvent[] = readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);

  const deployment = findDeployment("base-sepolia");
  const contracts = (deployment?.contracts ?? {}) as Record<string, string>;
  const zero = "0x0000000000000000000000000000000000000000";

  const artifacts: Record<string, string> = {
    "events.ndjson": "Full RunEvent stream (real timestamps; simulated legs labeled)",
    "handoff.json": "source-dispatch → attestor/executor handoff",
    "txline-final-record.json": "Canonical final score record (recorded synthetic fixture)",
    "txline-proof.json": "TxLINE proof bundle inputs (synthetic proof, labeled)",
    "validation-instruction.bin": "Canonical validate_stat_v2 instruction data",
    "level3-report.json": `Level 3 CRE report + exact onReport calldata (${level3.simulated ? "simulated" : "LIVE Base Sepolia"} delivery)`,
    "level4-report.json": `Level 4 CRE report + exact submitVaa calldata (${level4.simulated ? "simulated" : "LIVE Base Sepolia"} delivery)`,
    "vaa.bin": "Signed VAA bytes — dev guardian set (13-of-19 real secp256k1 signatures)",
    "vaa-decoded.json": "Decoded VAA header/payload + signing digest",
    "solana-verify-receipt.json": "SIMULATED Solana verify receipt",
    "solana-publish-receipt.json": "SIMULATED Wormhole publish receipt",
    "base-relay-receipt.json": "Base delivery receipts (simulated:true in sim runs)",
  };
  if (level4.settleTxHash) artifacts["market-settlement-receipt.json"] = "Market settlement receipt";

  const manifest: RunManifest = {
    runId,
    createdAtIso: new Date().toISOString(),
    description:
      "Proofline dual-lane pipeline run over the recorded fixture 982341 (Canada 2-1 France). " +
      (level3.simulated || level4.simulated
        ? "Solana + Wormhole-guardian + Base-transaction legs SIMULATED and labeled; "
        : "Base-transaction leg LIVE on Base Sepolia (real onReport / submitVaa / settle receipts); " +
          "Solana + Wormhole-guardian legs SIMULATED and labeled; ") +
      "all hashes, signatures and payload bytes are real and independently verifiable (verify-evidence).",
    fixture: {
      fixtureId: fixture.fixtureId,
      participant1: fixture.participant1,
      participant2: fixture.participant2,
      participant1Score: finalRecord.participant1Score,
      participant2Score: finalRecord.participant2Score,
      period: finalRecord.period,
      competition: fixture.competition,
      synthetic: true,
    },
    contracts: {
      chainId: (deployment?.chainId as number) ?? 84532,
      explorerBaseUrl: (deployment?.explorerBaseUrl as string) ?? "https://sepolia.basescan.org",
      finalityRegistry: contracts.finalityRegistry ?? zero,
      creLevel3Receiver: contracts.creLevel3Receiver ?? zero,
      wormholeOutcomeReceiver: contracts.wormholeOutcomeReceiver ?? zero,
      demoPredictionMarket: contracts.demoPredictionMarket ?? zero,
      wormholeCore: contracts.wormholeCore ?? zero,
      wormholeCoreKind: "dev-guardian-set-mock",
    },
    attestationId: l3Att,
    simulatedLegs: [
      "txline-feed (recorded fixture)",
      "solana-adapter (file-backed ProofBuffer)",
      "level3-rpc (recorded responders)",
      "wormhole-guardians (dev guardian set)",
      ...(level3.simulated || level4.simulated ? ["base-transactions (calldata only)"] : []),
    ],
    events,
    artifacts,
  };
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error(`manifest invalid: ${errs.join("; ")}`);
  writeJson(join(runDir, "manifest.json"), manifest);

  process.stderr.write(
    `capture-run: evidence assembled in ${runDir}\n` +
      `  attestationId ${l3Att}\n  ${events.length} events, ${Object.keys(artifacts).length} artifacts\n` +
      `Next: pnpm --filter @proofline/relay-cli verify-evidence -- --run-id ${runId}\n`,
  );
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
