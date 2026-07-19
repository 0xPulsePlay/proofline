/**
 * Live-final watcher — runs ONLY after the historical rehearsal gate passed
 * (same pipeline module, byte-for-byte). Polls the capture directory
 * (READ-ONLY — the capture process owns those files) for the finalisation
 * record + its score-stat proof, then runs the rehearsed verify→bundle
 * pipeline and stops at a memo DRY-RUN. Broadcasting is a separate,
 * operator-invoked `memo --broadcast` step gated on PROOFLINE_MAINNET_GO=1.
 *
 * Failure behavior (review abort rules): proof-not-yet-indexed → bounded
 * retry through the ~5-minute indexing window; RPC disagreement or non-true
 * → NEVER memo (the pipeline refuses), keep polling until --deadline-ts,
 * then exit nonzero for operator escalation.
 *
 * Usage: pnpm --filter @proofline/mainnet-attestor live -- \
 *          [--fixture 18257739] [--poll-ms 30000] [--deadline-iso <iso>]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURE_ROOT, loadCapturedProofs } from "./common";
import { runVerification, type FinalRecord } from "./pipeline";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findFinalisationRecord(fixtureDir: string, fixtureId: string): FinalRecord | undefined {
  for (const fname of ["scores-stream.ndjson", "snapshots.ndjson"]) {
    let text: string;
    try {
      text = readFileSync(join(fixtureDir, fname), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.includes("game_finalised")) continue;
      let env: { raw: string };
      try {
        env = JSON.parse(line);
      } catch {
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(env.raw);
      } catch {
        continue;
      }
      const items = Array.isArray(payload) ? payload : [payload];
      for (const r of items as FinalRecord[]) {
        if (
          r &&
          r.Action === "game_finalised" &&
          r.StatusId === 100 &&
          String(r.FixtureId) === fixtureId &&
          typeof r.Seq === "number"
        )
          return r;
      }
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const fixtureId = argValue("--fixture") ?? "18257739";
  const pollMs = Number(argValue("--poll-ms") ?? 30_000);
  const deadlineIso = argValue("--deadline-iso");
  const deadlineMs = deadlineIso ? Date.parse(deadlineIso) : Number.POSITIVE_INFINITY;
  const fixtureDir = join(CAPTURE_ROOT, "live", fixtureId);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const outDir = join(repoRoot, "evidence/mainnet", `live-${fixtureId}`);

  console.log(`live watcher: fixture ${fixtureId}, polling ${fixtureDir} every ${pollMs}ms (read-only)`);
  let announcedFinal = false;

  for (;;) {
    if (Date.now() > deadlineMs) {
      console.error("DEADLINE REACHED without a verified proof — escalate per abort rules");
      process.exit(2);
    }
    try {
      const finalRecord = findFinalisationRecord(fixtureDir, fixtureId);
      if (!finalRecord) {
        console.log(`${new Date().toISOString()} no game_finalised yet — match in progress or pre-match`);
        await sleep(pollMs);
        continue;
      }
      if (!announcedFinal) {
        console.log(`FINALISATION OBSERVED: seq=${finalRecord.Seq} ts=${finalRecord.Ts} — waiting for its proof`);
        announcedFinal = true;
      }
      const proofs = loadCapturedProofs(join(fixtureDir, "proofs.ndjson"));
      const proof = proofs.find(
        (p) =>
          p.seq === finalRecord.Seq &&
          p.statKeys.split(",").includes("1") &&
          p.statKeys.split(",").includes("2"),
      );
      if (!proof) {
        console.log(`${new Date().toISOString()} finalisation proof not indexed yet (5-min window) — retrying`);
        await sleep(Math.min(pollMs, 60_000));
        continue;
      }
      console.log(`proof captured: ${proof.source.slice(0, 110)}`);
      const { allTrue, outDir: dir } = await runVerification({
        proof,
        finalRecord,
        outDir,
        mode: "live-final",
      });
      if (!allTrue) {
        console.error("RPC verification did not return true on all endpoints — NOT memoing; will retry once");
        await sleep(pollMs);
        continue;
      }
      console.log(`\nLIVE VERIFICATION PASS — evidence in ${dir}`);
      console.log(
        `next (DRY-RUN): pnpm --filter @proofline/mainnet-attestor memo -- --manifest ${join(dir, "manifest.json")}`,
      );
      console.log("broadcast remains gated on --broadcast + PROOFLINE_MAINNET_GO=1 (Director GO).");
      return;
    } catch (err) {
      console.error(`poll error (continuing): ${(err as Error).message}`);
      await sleep(pollMs);
    }
  }
}

main().catch((err: Error) => {
  console.error(`live watcher failed: ${err.stack ?? err.message}`);
  process.exit(1);
});
