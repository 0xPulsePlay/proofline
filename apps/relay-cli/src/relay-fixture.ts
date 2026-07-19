/**
 * relay-fixture — orchestrates the three CRE workflow simulation runners
 * sequentially (source-dispatch → level3-attestor → vaa-executor) over the
 * recorded fixture, into one run dir under evidence/runs/<run-id>.
 *
 * HONESTY NOTE: this drives the LOCAL SIMULATION runners (no deployed DON).
 * Each workflow is spawned exactly the way its own `sim` script runs it
 * (`pnpm exec tsx main.ts --config …`), with a derived config whose only
 * changes are runId/runDir (+ absolute paths). Nothing is imported from the
 * workflows — the process boundary is the same one a DON would impose.
 *
 * Event capture: COORDINATOR_URL is passed through to the children. When it
 * is set, events land in the coordinator (which persists events.ndjson
 * itself). When it is not, children emit RunEvent NDJSON on stdout; this
 * orchestrator collects those lines, re-assigns the authoritative global seq
 * (the coordinator's job in coordinator mode) and writes
 * <runDir>/events.ndjson. Timestamps are the children's real wall-clock
 * times, never rewritten.
 *
 * Usage: pnpm --filter @proofline/relay-cli relay-fixture [--run-id <id>]
 *          [--config-name <config.local.yaml>]
 *
 * --config-name picks which per-workflow config file to derive from (e.g.
 * config.live-base.yaml for the live Base Sepolia delivery run); the same
 * runId/runDir/path rewriting applies either way.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { RunEvent } from "@proofline/event-model";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const workflowsDir = join(repoRoot, "workflows");

const WORKFLOWS = ["cre-source-dispatch", "cre-level3-attestor", "cre-vaa-executor"] as const;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function deriveConfig(workflow: string, runId: string, runDir: string, configName: string): string {
  const srcPath = join(workflowsDir, workflow, "config", configName);
  const srcDir = dirname(srcPath);
  const cfg = parseYaml(readFileSync(srcPath, "utf8")) as Record<string, any>;
  cfg.runId = runId;
  cfg.runDir = runDir; // absolute — loadWorkflowConfig keeps absolute paths as-is
  if (cfg.fixture?.path) cfg.fixture.path = resolve(srcDir, cfg.fixture.path);
  if (cfg.vaaSource?.locator) cfg.vaaSource.locator = join(runDir, "vaa.bin");
  const outPath = join(runDir, "configs", `${workflow}.${configName.replace(/^config\./, "")}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `# Derived from workflows/${workflow}/config/${configName} by relay-fixture\n` +
      `# (only runId/runDir/paths changed).\n${stringifyYaml(cfg)}`,
  );
  return outPath;
}

function runWorkflow(workflow: string, configPath: string): Promise<RunEvent[]> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", "main.ts", "--config", configPath], {
      cwd: join(workflowsDir, workflow),
      env: process.env, // COORDINATOR_URL passthrough
      stdio: ["ignore", "pipe", "inherit"],
    });
    const events: RunEvent[] = [];
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          events.push(JSON.parse(line) as RunEvent);
        } catch {
          process.stderr.write(`[${workflow}] non-event stdout: ${line}\n`);
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(events);
      else reject(new Error(`${workflow} exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const runId =
    argValue("--run-id") ??
    `run-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
  const runDir = join(repoRoot, "evidence/runs", runId);
  mkdirSync(runDir, { recursive: true });
  const coordinatorUrl = process.env.COORDINATOR_URL;

  process.stderr.write(`relay-fixture: run ${runId} → ${runDir}\n`);
  if (coordinatorUrl) {
    // Register the run so the coordinator (the authoritative seq assigner)
    // accepts the children's events and persists events.ndjson itself.
    await fetch(`${coordinatorUrl.replace(/\/$/, "")}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, createdAtIso: new Date().toISOString() }),
    });
  }

  const all: RunEvent[] = [];
  const configName = argValue("--config-name") ?? "config.local.yaml";
  for (const workflow of WORKFLOWS) {
    const configPath = deriveConfig(workflow, runId, runDir, configName);
    process.stderr.write(`relay-fixture: ${workflow} starting…\n`);
    const events = await runWorkflow(workflow, configPath);
    all.push(...events);
    process.stderr.write(`relay-fixture: ${workflow} done (${events.length} stdout events)\n`);
  }

  if (!coordinatorUrl) {
    // No coordinator: this orchestrator assigns the authoritative global seq.
    const lines = all
      .map((e, seq) => JSON.stringify({ ...e, seq }))
      .join("\n");
    writeFileSync(join(runDir, "events.ndjson"), lines + "\n");
    process.stderr.write(`relay-fixture: wrote ${all.length} events to ${join(runDir, "events.ndjson")}\n`);
  }
  process.stderr.write(
    `relay-fixture: complete. Next: pnpm --filter @proofline/relay-cli capture-run -- --run-id ${runId}\n`,
  );
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
