/**
 * Shared CRE-runtime shims for Proofline's three workflows.
 *
 * HONESTY NOTE — what runs where in this build:
 * The workflows under workflows/cre-* are written to the Chainlink CRE
 * programming model (workflow.yaml + config/config.<env>.yaml + a main
 * entrypoint that follows the runtime/report pattern). In THIS BUILD they are
 * executed by this LOCAL SIMULATION runner — a plain `pnpm tsx main.ts`
 * heartbeat loop. No DON is deployed, no Keystone Forwarder signs reports,
 * and nothing in this file pretends otherwise. The shapes here (heartbeat
 * trigger loop, secrets-by-name resolution, `creReport()`) intentionally
 * mirror the CRE SDK surface so the workflow bodies read like real CRE code
 * and swapping to the deployed-DON SDK is mechanical, not a rewrite.
 *
 * Shared here (instead of copy-pasted per workflow — explicit spec rule):
 *  - workflow config loading (YAML) + path/secret resolution
 *  - the RunEvent sink (POST to coordinator, else NDJSON on stdout)
 *  - cron-heartbeat loop + run-state JSON persistence (idempotency)
 *  - canonical validate_stat_v2 simulateTransaction construction (the REAL
 *    JSON-RPC request shape, used identically by Level 3 and Level 4 so both
 *    lanes independently derive the same validation_instruction_hash)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { keccak256 } from "viem";
import { base58ToHex32 } from "@proofline/protocol";
import type { RelayEvent, RunEvent } from "@proofline/event-model";

// ---------------------------------------------------------------------------
// Config + secrets
// ---------------------------------------------------------------------------

/** Load a workflow config YAML. Relative paths inside it resolve against the config file's directory. */
export function loadWorkflowConfig<T>(configPath: string): { config: T; configDir: string } {
  const abs = resolve(configPath);
  const config = parseYaml(readFileSync(abs, "utf8")) as T;
  return { config, configDir: dirname(abs) };
}

export function resolveConfigPath(configDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(configDir, p);
}

/**
 * Secrets are referenced by NAME everywhere (workflow.yaml + configs). In the
 * local runner names resolve from process.env; on a deployed DON they would
 * resolve from the DON secrets store. Values never appear in any config file.
 */
export function resolveSecret(name: string): string | undefined {
  return process.env[name];
}

// ---------------------------------------------------------------------------
// RunEvent sink — real actions only (the no-fake-animation rule)
// ---------------------------------------------------------------------------

export interface EventSink {
  /** Emit a RunEvent for a REAL action that just happened. `simulated: true` labels legs that did not touch a real network. */
  emit(event: RelayEvent, simulated: boolean): Promise<RunEvent>;
  readonly mode: "coordinator" | "stdout";
}

/**
 * When COORDINATOR_URL is set, POST `{ simulated, event }` to
 * `${COORDINATOR_URL}/events` (the coordinator assigns the authoritative
 * seq). Otherwise write RunEvent NDJSON to stdout — stdout is reserved for
 * events; all human logging goes to stderr (see @proofline/observability).
 */
export function createEventSink(coordinatorUrl?: string): EventSink {
  let seq = 0;
  const writeNdjson = (runEvent: RunEvent) => {
    process.stdout.write(`${JSON.stringify(runEvent)}\n`);
  };
  if (!coordinatorUrl) {
    return {
      mode: "stdout",
      async emit(event, simulated) {
        const runEvent: RunEvent = { seq: seq++, at: Date.now(), simulated, event };
        writeNdjson(runEvent);
        return runEvent;
      },
    };
  }
  const url = `${coordinatorUrl.replace(/\/$/, "")}/events`;
  return {
    mode: "coordinator",
    async emit(event, simulated) {
      const runEvent: RunEvent = { seq: seq++, at: Date.now(), simulated, event };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ simulated, event }),
        });
        if (!res.ok) throw new Error(`coordinator responded ${res.status}`);
      } catch (err) {
        // Never lose a real event: fall back to NDJSON and say so on stderr.
        process.stderr.write(
          `[cre-runtime] coordinator POST failed (${(err as Error).message}); event written to stdout instead\n`,
        );
        writeNdjson(runEvent);
      }
      return runEvent;
    },
  };
}

// ---------------------------------------------------------------------------
// Cron heartbeat loop (local stand-in for the CRE cron trigger)
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Local stand-in for a CRE cron trigger. On a deployed DON the schedule in
 * workflow.yaml fires the entrypoint; locally we loop. `onTick` returns
 * "done" to stop (terminal state reached) or "continue" to keep polling.
 */
export async function cronHeartbeat(opts: {
  intervalMs: number;
  maxTicks?: number;
  onTick: (tick: number) => Promise<"continue" | "done">;
}): Promise<void> {
  const max = opts.maxTicks ?? Number.POSITIVE_INFINITY;
  for (let tick = 1; tick <= max; tick++) {
    const result = await opts.onTick(tick);
    if (result === "done") return;
    if (tick < max) await sleep(opts.intervalMs);
  }
}

// ---------------------------------------------------------------------------
// Run-state persistence — state-transition discipline / idempotency (§3.6)
// ---------------------------------------------------------------------------

export function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJsonFileAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Simulated-leg identifiers — deterministic and honestly labeled
// ---------------------------------------------------------------------------

/**
 * Deterministic stand-in for a Solana transaction signature on a simulated
 * leg. Deliberately prefixed "sim:" so it can never be mistaken for (or
 * pasted into an explorer as) a real signature.
 */
export function simSignature(kind: string, seed: string): string {
  return `sim:${kind}:${keccak256(new TextEncoder().encode(`proofline.sim.${kind}.${seed}`)).slice(2, 18)}`;
}

// ---------------------------------------------------------------------------
// TxLINE daily-root PDA resolution
// ---------------------------------------------------------------------------

export function epochDay(timestampMs: number | bigint): number {
  return Number(BigInt(timestampMs) / 86_400_000n);
}

/**
 * Resolve the timestamp-derived daily score-root PDA. The REAL derivation
 * uses TxLINE's PDA seeds ("daily_scores_roots" + epoch day) against the
 * TxOracle program; in this build the mapping comes from the deterministic
 * recorded fixture, and this function enforces the same invariant the live
 * check would: the PDA in the packaged transaction MUST equal the PDA derived
 * from the proof's timestamp — a mismatched PDA is a spoofing attempt.
 */
export function lookupDailyRootPda(
  pdaByEpochDay: Record<string, string>,
  timestampMs: number | bigint,
): string {
  const day = String(epochDay(timestampMs));
  const pda = pdaByEpochDay[day];
  if (!pda) throw new Error(`no daily root PDA recorded for epoch day ${day}`);
  return pda;
}

// ---------------------------------------------------------------------------
// TxLINE fixture state + canonical proof bundle (shared by source-dispatch and
// level3-attestor so both lanes derive identical digests — never copy-pasted)
// ---------------------------------------------------------------------------

export interface FixtureScoreRecord {
  action: string;
  statusId: number;
  period: number;
  sequence: string;
  participant1Score: number;
  participant2Score: number;
  timestampMs: number;
}

/** Shape of a recorded fixture-state document (packages/test-vectors/fixture-*.json) and of the optional TxLINE API branch's response. */
export interface FixtureState {
  fixtureId: string;
  participant1: string;
  participant2: string;
  competition?: string;
  records: FixtureScoreRecord[];
  /** Opaque proof object as committed to the evidence bundle. */
  proof: Record<string, unknown>;
  rootAccount: string;
  dailyRootPdaByEpochDay: Record<string, string>;
  strategy: string;
  proofAvailability?: { ticksAfterFinalObserved?: number };
  wormhole?: { emitterBase58: string; sequence: string };
  destinationChain?: number;
}

/**
 * Final-settlement detection — the single marker that covers regulation,
 * extra time, penalties and abandonment (design §3.1). Matched against
 * @proofline/protocol FINAL_MARKER by the caller.
 */
export function findFinalRecord(
  state: FixtureState,
  marker: { action: string; statusId: number; period: number },
): FixtureScoreRecord | undefined {
  return state.records.find(
    (r) => r.action === marker.action && r.statusId === marker.statusId && r.period === marker.period,
  );
}

/**
 * The canonical evidence bundle that proof_bundle_hash commits to — this
 * exact shape (key set and value types) is what gen-vectors.ts hashed for
 * packages/test-vectors/match-outcome-v1.json. Both lanes call this one
 * function; that is what makes their attestationIds meet.
 */
export function buildProofBundle(state: FixtureState, finalRecord: FixtureScoreRecord): unknown {
  return {
    finalRecord: {
      action: finalRecord.action,
      fixtureId: state.fixtureId,
      statusId: finalRecord.statusId,
      period: finalRecord.period,
      participant1: state.participant1,
      participant2: state.participant2,
      participant1Score: finalRecord.participant1Score,
      participant2Score: finalRecord.participant2Score,
      sequence: finalRecord.sequence,
    },
    proof: state.proof,
    rootAccount: state.rootAccount,
    strategy: state.strategy,
  };
}

/**
 * Fetch fixture state: deterministic recorded fixture file (the demo default)
 * or LIVE TxLINE ingestion via @proofline/txline-sdk when source is
 * "txline-api" (real free-tier API, verified 2026-07-19 — guest JWT +
 * X-Api-Token on every request). Returns the state plus whether the read came
 * from a live source.
 *
 * Live mode still requires fixturePath: the recorded fixture doubles as the
 * proof-leg TEMPLATE (root PDA / wormhole / strategy fields the free tier
 * does not expose — labeled synthetic by the SDK); live score RECORDS overlay
 * it, so recorded and live ingestion share one downstream code path.
 */
export async function fetchFixtureState(opts: {
  source: "file" | "txline-api";
  fixturePath?: string;
  fixtureId?: string;
  apiKeySecretName?: string;
}): Promise<{ state: FixtureState; live: boolean }> {
  if (!opts.fixturePath) throw new Error("fixture path required (recorded state or live proof-leg template)");
  const template = JSON.parse(readFileSync(opts.fixturePath, "utf8")) as FixtureState;
  if (opts.source === "txline-api") {
    if (!opts.fixtureId) throw new Error("fixtureId required for live TxLINE ingestion");
    const { fetchLiveFixtureState } = await import("@proofline/txline-sdk");
    const baseUrl = process.env.TXLINE_API_BASE_URL ?? undefined;
    const live = await fetchLiveFixtureState(opts.fixtureId, template, baseUrl);
    return { state: live as FixtureState, live: true };
  }
  return { state: template, live: false };
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

export function hexToBytes(hex: `0x${string}`): Uint8Array {
  const clean = hex.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function base58ToBytes32(b58: string): Uint8Array {
  return hexToBytes(base58ToHex32(b58));
}

/** Solana shortvec (compact-u16) length encoding. */
function shortVec(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

// ---------------------------------------------------------------------------
// Canonical validate_stat_v2 simulation transaction
// ---------------------------------------------------------------------------

export interface ValidateStatV2Params {
  fixtureId: string | bigint;
  participant1Score: number;
  participant2Score: number;
  period: number;
  txoracleProgramB58: string;
  dailyRootAccountB58: string;
}

/**
 * Canonical instruction data for the exact-equality final-score predicate.
 * This textual encoding is the canonical form used across this whole build —
 * it is what validation_instruction_hash commits to, and it matches
 * packages/test-vectors/match-outcome-v1.json byte-for-byte. TxOracle's real
 * IDL wire encoding (Anchor discriminator + Borsh args) is a drop-in
 * replacement at this single site once confirmed against the deployed IDL.
 */
export function canonicalValidateStatV2Data(p: ValidateStatV2Params): Uint8Array {
  return new TextEncoder().encode(
    `validate_stat_v2:fixture=${p.fixtureId}:p1=${p.participant1Score}:p2=${p.participant2Score}:period=${p.period}`,
  );
}

/** Parse the canonical instruction data back — used by anti-spoofing assertions. */
export function parseValidateStatV2Data(data: Uint8Array): {
  fixtureId: string;
  participant1Score: number;
  participant2Score: number;
  period: number;
} {
  const text = new TextDecoder().decode(data);
  const m = /^validate_stat_v2:fixture=(\d+):p1=(\d+):p2=(\d+):period=(\d+)$/.exec(text);
  if (!m) throw new Error(`instruction data is not canonical validate_stat_v2 form: ${text}`);
  return {
    fixtureId: m[1],
    participant1Score: Number(m[2]),
    participant2Score: Number(m[3]),
    period: Number(m[4]),
  };
}

export interface BuiltSimulationTx {
  /** base64 of the fully serialized (dummy-signed) legacy transaction. */
  txBase64: string;
  txBytes: Uint8Array;
  /** keccak256 of the serialized transaction — recorded in the evidence trail. */
  txDigest: `0x${string}`;
  instructionData: Uint8Array;
  accountKeys: { payerHex: `0x${string}`; dailyRootHex: `0x${string}`; programHex: `0x${string}` };
}

/**
 * Serialize the canonical TxOracle validate_stat_v2 transaction as a REAL
 * Solana legacy transaction (dummy signature — the request is sent with
 * sigVerify:false and replaceRecentBlockhash:true, so signature and
 * blockhash are irrelevant by design; commitment is "finalized").
 *
 * Layout: shortvec(sig count) + 64-byte zero signature + message
 *   message = header(3 bytes) + shortvec(keys) + keys + blockhash(32 zeros)
 *           + shortvec(instructions) + instruction
 */
export function buildValidateStatV2Transaction(p: ValidateStatV2Params): BuiltSimulationTx {
  const instructionData = canonicalValidateStatV2Data(p);
  const payerHex = keccak256(new TextEncoder().encode("proofline.sim.payer"));
  const payer = hexToBytes(payerHex);
  const dailyRootHex = base58ToHex32(p.dailyRootAccountB58);
  const dailyRoot = hexToBytes(dailyRootHex);
  const programHex = base58ToHex32(p.txoracleProgramB58);
  const program = hexToBytes(programHex);

  const message: number[] = [];
  // header: 1 required signature, 0 readonly signed, 2 readonly unsigned
  message.push(1, 0, 2);
  message.push(...shortVec(3), ...payer, ...dailyRoot, ...program);
  message.push(...new Array<number>(32).fill(0)); // recent blockhash — replaced server-side
  message.push(...shortVec(1));
  message.push(2); // program id index -> TxOracle
  message.push(...shortVec(1), 1); // one account: the daily root PDA
  message.push(...shortVec(instructionData.length), ...instructionData);

  const tx = new Uint8Array([...shortVec(1), ...new Array<number>(64).fill(0), ...message]);
  return {
    txBase64: bytesToBase64(tx),
    txBytes: tx,
    txDigest: keccak256(tx),
    instructionData,
    accountKeys: { payerHex, dailyRootHex, programHex },
  };
}

/**
 * Decode the serialized transaction back out (real parsing, not an echo of
 * builder inputs) — the anti-spoofing assertions run against THIS, so a
 * corrupted packager output cannot pass by construction.
 */
export function decodeValidateStatV2Transaction(txBytes: Uint8Array): {
  programHex: `0x${string}`;
  dailyRootHex: `0x${string}`;
  instructionData: Uint8Array;
} {
  let off = 0;
  const readShortVec = (): number => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = txBytes[off++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
  };
  const numSigs = readShortVec();
  off += numSigs * 64;
  off += 3; // header
  const numKeys = readShortVec();
  const keys: Uint8Array[] = [];
  for (let i = 0; i < numKeys; i++) {
    keys.push(txBytes.slice(off, off + 32));
    off += 32;
  }
  off += 32; // blockhash
  const numInstructions = readShortVec();
  if (numInstructions !== 1) throw new Error(`expected 1 instruction, got ${numInstructions}`);
  const programIdIndex = txBytes[off++];
  const numAccounts = readShortVec();
  const accountIndices: number[] = [];
  for (let i = 0; i < numAccounts; i++) accountIndices.push(txBytes[off++]);
  const dataLen = readShortVec();
  const instructionData = txBytes.slice(off, off + dataLen);
  const toHex = (b: Uint8Array) =>
    `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
  return {
    programHex: toHex(keys[programIdIndex]),
    dailyRootHex: toHex(keys[accountIndices[0]]),
    instructionData,
  };
}

export interface SimulateTransactionRequest {
  jsonrpc: "2.0";
  id: number;
  method: "simulateTransaction";
  params: [
    string,
    {
      sigVerify: false;
      replaceRecentBlockhash: true;
      commitment: "finalized";
      encoding: "base64";
    },
  ];
}

/** The REAL Solana JSON-RPC simulateTransaction request shape (identical bytes go to every provider). */
export function buildSimulateTransactionRequest(txBase64: string, id = 1): SimulateTransactionRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "simulateTransaction",
    params: [
      txBase64,
      { sigVerify: false, replaceRecentBlockhash: true, commitment: "finalized", encoding: "base64" },
    ],
  };
}

/** The stable subset of a simulateTransaction response that providers must agree on. */
export interface StableSimulationOutputs {
  errIsNull: boolean;
  returnDataProgramId: string | undefined;
  returnsTrue: boolean;
  unexpectedPrograms: string[];
}

export interface SimulateTransactionResponse {
  jsonrpc: "2.0";
  id: number;
  result: {
    context: { slot: number; apiVersion?: string };
    value: {
      err: unknown;
      logs: string[] | null;
      returnData: { programId: string; data: [string, "base64"] } | null;
      unitsConsumed?: number;
      accounts?: unknown;
    };
  };
}

/**
 * Extract STABLE OUTPUTS ONLY (§3.4): err === null, return-data program id,
 * return data decodes to boolean true, and no unexpected invoked program.
 * Context slots, compute units, and incidental log text legitimately differ
 * between providers and are deliberately NOT compared.
 */
export function extractStableOutputs(
  resp: SimulateTransactionResponse,
  expectedProgramB58: string,
): StableSimulationOutputs {
  const value = resp.result.value;
  const invoked = new Set<string>();
  for (const line of value.logs ?? []) {
    const m = /^Program (\S+) invoke/.exec(line);
    if (m) invoked.add(m[1]);
  }
  invoked.delete(expectedProgramB58);
  const returnData = value.returnData ?? undefined;
  let returnsTrue = false;
  if (returnData) {
    const decoded = base64ToBytes(returnData.data[0]);
    returnsTrue = decoded.length === 1 && decoded[0] === 1;
  }
  return {
    errIsNull: value.err === null,
    returnDataProgramId: returnData?.programId,
    returnsTrue,
    unexpectedPrograms: [...invoked],
  };
}

/** True when a provider's stable outputs match the expected agreement tuple. */
export function stableOutputsAgree(
  outputs: StableSimulationOutputs,
  expectedProgramB58: string,
): boolean {
  return (
    outputs.errIsNull &&
    outputs.returnDataProgramId === expectedProgramB58 &&
    outputs.returnsTrue &&
    outputs.unexpectedPrograms.length === 0
  );
}

// ---------------------------------------------------------------------------
// CRE report shim
// ---------------------------------------------------------------------------

export interface CreReport {
  encodedPayload: string; // base64
  encoderName: "evm";
  signingAlgo: "ecdsa";
  hashingAlgo: "keccak256";
}

/**
 * Shape-compatible shim for CRE's `runtime.report({...}).result()`. On a
 * deployed DON this is where the DON's threshold signature over the payload
 * happens; locally it only packages the payload (and the caller submits as a
 * plain EOA "forwarder" in live mode, or prints calldata in sim mode).
 */
export function creReport(encodedPayloadHex: `0x${string}`): CreReport {
  return {
    encodedPayload: bytesToBase64(hexToBytes(encodedPayloadHex)),
    encoderName: "evm",
    signingAlgo: "ecdsa",
    hashingAlgo: "keccak256",
  };
}
