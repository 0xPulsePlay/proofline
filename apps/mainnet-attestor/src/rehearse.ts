/**
 * Historical rehearsal — checklist item 10 and THE GATE for everything after
 * it: run the ENTIRE read → verify → hash → bundle pipeline (the same
 * pipeline.ts module live.ts uses, byte-for-byte) on an already-captured
 * historical V2 proof against 2+ independent mainnet RPCs at finalized
 * commitment. No transaction is constructed, signed, or sent.
 *
 * Usage: pnpm --filter @proofline/mainnet-attestor rehearse [-- --fixture <id>]
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

function findFinalisationRecord(fixtureDir: string): FinalRecord {
  for (const fname of ["snapshots.ndjson", "scores-stream.ndjson"]) {
    let text: string;
    try {
      text = readFileSync(join(fixtureDir, fname), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
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
        if (r && r.Action === "game_finalised" && r.StatusId === 100 && typeof r.Seq === "number") return r;
      }
    }
  }
  throw new Error(`no game_finalised (StatusId=100) record captured in ${fixtureDir}`);
}

async function main(): Promise<void> {
  const fixtureId = argValue("--fixture") ?? "18175918";
  const kind = argValue("--kind") ?? "historical";
  const fixtureDir = join(CAPTURE_ROOT, kind, fixtureId);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const outDir = join(repoRoot, "evidence/mainnet", `rehearsal-${fixtureId}`);

  const finalRecord = findFinalisationRecord(fixtureDir);
  console.log(`finalisation record: seq=${finalRecord.Seq} ts=${finalRecord.Ts}`);

  const proofs = loadCapturedProofs(join(fixtureDir, "proofs.ndjson"));
  const proof = proofs.find(
    (p) => p.seq === finalRecord.Seq && p.statKeys.split(",").includes("1") && p.statKeys.split(",").includes("2"),
  );
  if (!proof) throw new Error(`no captured score-stat proof for finalisation seq ${finalRecord.Seq}`);
  console.log(`proof: ${proof.source.slice(0, 110)}`);

  const { allTrue, manifest } = await runVerification({
    proof,
    finalRecord,
    outDir,
    mode: "historical-rehearsal",
  });
  if (!allTrue) throw new Error("REHEARSAL FAILED: .view() did not return true on all RPCs");
  console.log(`\nREHEARSAL PASS — evidence in ${outDir}`);
  console.log(`bundle=${manifest.bundleHash}`);
}

main().catch((err: Error) => {
  console.error(`REHEARSAL FAILED: ${err.stack ?? err.message}`);
  process.exit(1);
});
