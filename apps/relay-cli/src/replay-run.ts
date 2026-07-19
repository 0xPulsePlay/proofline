/**
 * replay-run — streams a captured run's RunEvents for UI replay.
 *
 * Default: NDJSON to stdout, paced by the events' REAL recorded timestamp
 * gaps (divided by --speed, default 20; --instant emits with no pacing).
 * With COORDINATOR_URL (or --post <url>): registers a `<run-id>-replay-…`
 * run and POSTs each event to the coordinator, which fans out over SSE to
 * the control-room UI. Replay never rewrites what happened: same events,
 * same order, same `simulated` labels; only the pacing is scaled.
 *
 * Usage: pnpm --filter @proofline/relay-cli replay-run -- --run-id <id> [--speed 20|--instant] [--post <url>]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunManifest } from "@proofline/event-model";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const runId = argValue("--run-id");
  if (!runId) throw new Error("--run-id required");
  const manifestPath = join(repoRoot, "evidence/runs", runId, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`no manifest.json for run ${runId} — run capture-run first`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RunManifest;

  const instant = process.argv.includes("--instant");
  const speed = Number(argValue("--speed") ?? 20);
  const postUrl = (argValue("--post") ?? process.env.COORDINATOR_URL)?.replace(/\/$/, "");

  const pace = async (i: number) => {
    if (instant || i === 0) return;
    const gap = manifest.events[i].at - manifest.events[i - 1].at;
    if (gap > 0) await sleep(Math.min(gap / speed, 5000));
  };

  if (postUrl) {
    // Replay into the coordinator under a fresh run id so the captured
    // evidence dir is never appended to or overwritten.
    const replayId = `${runId}-replay-${Date.now()}`;
    const { events, artifacts, attestationId, ...meta } = manifest;
    await fetch(`${postUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...meta, runId: replayId, description: `REPLAY of ${runId}: ${meta.description}` }),
    });
    for (let i = 0; i < events.length; i++) {
      await pace(i);
      const res = await fetch(`${postUrl}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ simulated: events[i].simulated, event: events[i].event }),
      });
      if (!res.ok) throw new Error(`coordinator responded ${res.status} at seq ${events[i].seq}`);
    }
    await fetch(`${postUrl}/runs/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attestationId, artifacts }),
    });
    process.stderr.write(`replay-run: replayed ${events.length} events to ${postUrl} as ${replayId}\n`);
    return;
  }

  for (let i = 0; i < manifest.events.length; i++) {
    await pace(i);
    process.stdout.write(JSON.stringify(manifest.events[i]) + "\n");
  }
  process.stderr.write(`replay-run: streamed ${manifest.events.length} events for ${runId}\n`);
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
