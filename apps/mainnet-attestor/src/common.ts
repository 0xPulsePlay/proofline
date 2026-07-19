/**
 * Proofline mainnet attestor — shared core for the HYBRID no-deploy path
 * (docs/codex-mainnet-review.md is the spec; its "Mandatory before the first
 * mainnet Memo" checklist is implemented here item by item).
 *
 * TRUST WORDING (fixed): "real TxLINE data, client-verified by TxLINE's
 * deployed mainnet verifier against its real mainnet root, then immutably
 * attested by Proofline on Solana mainnet." This module performs CLIENT
 * verification via TxLINE's deployed program `.view()` — it never claims
 * Proofline verified anything on-chain.
 *
 * SAFETY RAILS (checklist item 7):
 * - DRY-RUN DEFAULT. Broadcasting requires BOTH `--broadcast` AND
 *   PROOFLINE_MAINNET_GO=1 in the environment (set only after an explicit
 *   Director GO in-thread).
 * - Hardcoded allowlists: mainnet genesis hash, TxLINE program id, Memo
 *   program id, the single authorized signer pubkey, and a total fee cap.
 * - Key material is only ever read from PROOFLINE_SIGNER_KEYPAIR (file path)
 *   and never printed or logged.
 *
 * The forbidden placeholder paths (canonicalValidateStatV2Data, the Level 3
 * sim builder, verify-evidence's textual instruction) are NOT imported here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Allowlists — hardcoded, checklist item 7
// ---------------------------------------------------------------------------

export const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TXLINE_PROGRAM_ID = "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
/** The ONE authorized mainnet signer (worldcup-2026-burner). */
export const AUTHORIZED_SIGNER = "Cd5i4a2ydUY8xBVcGWLtdumvPPwfEeyMyXX8ZacLCyMP";
/** Pinned official TxLINE IDL commit (tx-on-chain repo). */
export const TXLINE_IDL_COMMIT = "f7e3bcd5db4c6744445f75dfab7eccc879c6d2de";
/** Official pinned discriminator for validate_stat_v2. */
export const VALIDATE_STAT_V2_DISCRIMINATOR = [208, 215, 194, 214, 241, 71, 246, 178];
/** Absolute cap on total fee per transaction (base + priority), lamports. */
export const MAX_TOTAL_FEE_LAMPORTS = 15_000;

/** Two independent mainnet RPC endpoints (checklist item 5). */
export const RPC_PRIMARY = process.env.PROOFLINE_RPC_PRIMARY ?? "https://api.mainnet-beta.solana.com";
export const RPC_SECONDARY = process.env.PROOFLINE_RPC_SECONDARY ?? "https://solana-rpc.publicnode.com";

export const IDL_PATH =
  process.env.TXLINE_IDL ?? join(homedir(), ".config/solana/txline-capture/txoracle-mainnet.json");
export const CAPTURE_ROOT =
  process.env.TXLINE_CAPTURE_ROOT ?? join(homedir(), "code/txodds/txline-capture/capture");

export function sha256(...segments: Uint8Array[]): Buffer {
  const h = createHash("sha256");
  for (const s of segments) {
    // Length-prefix every segment so concatenation is unambiguous.
    const len = Buffer.alloc(4);
    len.writeUInt32BE(s.length);
    h.update(len);
    h.update(s);
  }
  return h.digest();
}

export function assertMainnet(genesisHash: string, endpoint: string): void {
  if (genesisHash !== MAINNET_GENESIS_HASH)
    throw new Error(`${endpoint} is NOT mainnet-beta (genesis ${genesisHash}) — refusing`);
}

// ---------------------------------------------------------------------------
// Captured proof loading (raw verbatim envelopes — checklist item 2)
// ---------------------------------------------------------------------------

export interface CapturedProof {
  /** Verbatim raw response string exactly as captured — hash input. */
  rawResponse: string;
  value: any;
  source: string;
  capturedAt: number;
  fixtureId: string;
  seq: number;
  statKeys: string;
}

/**
 * Load successful stat-validation captures from a fixture's proofs.ndjson
 * (read-only; the active capture process owns the file — we only read).
 */
export function loadCapturedProofs(proofsPath: string): CapturedProof[] {
  const out: CapturedProof[] = [];
  for (const line of readFileSync(proofsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let env: { capturedAt: number; source: string; raw: string };
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }
    if (!env.source?.includes("status=200")) continue;
    let value: any;
    try {
      value = JSON.parse(env.raw);
    } catch {
      continue;
    }
    if (!value?.summary || !Array.isArray(value.statsToProve) || !value.statsToProve.length) continue;
    const seq = Number(env.source.match(/[?&]seq=(\d+)/)?.[1] ?? NaN);
    const statKeys = env.source.match(/[?&]statKeys?=([\d,]+)/)?.[1] ?? "";
    const fixtureId = String(value.summary.fixtureId);
    if (!Number.isFinite(seq) || seq <= 0) continue; // seq must come from a real record
    out.push({ rawResponse: env.raw, value, source: env.source, capturedAt: env.capturedAt, fixtureId, seq, statKeys });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payload/strategy construction from the VERBATIM proof (items 1, 4)
// ---------------------------------------------------------------------------

function bytes32(value: unknown): number[] {
  let bytes: Buffer;
  if (Array.isArray(value)) bytes = Buffer.from(value as number[]);
  else if (typeof value === "string" && value.startsWith("0x")) bytes = Buffer.from(value.slice(2), "hex");
  else if (typeof value === "string") bytes = Buffer.from(value, "base64");
  else throw new Error("Unsupported proof hash encoding");
  if (bytes.length !== 32) throw new Error(`Expected 32 proof bytes, received ${bytes.length}`);
  return [...bytes];
}

function proofNodes(value: unknown): Array<{ hash: number[]; isRightSibling: boolean }> {
  if (!Array.isArray(value)) throw new Error("Proof nodes are not an array");
  return value.map((item) => {
    const node = item as { hash: unknown; isRightSibling: boolean };
    if (typeof node.isRightSibling !== "boolean") throw new Error("proof node missing isRightSibling");
    return { hash: bytes32(node.hash), isRightSibling: node.isRightSibling };
  });
}

export interface BuiltValidation {
  payload: any;
  strategy: any;
  dailyScoresPda: PublicKey;
  epochDay: number;
  proofTsMs: number;
  stats: Array<{ key: number; value: number; period: number }>;
}

/**
 * Build the validateStatV2 payload + exact-equality strategy from the
 * verbatim captured proof. NO DEFAULTS: any missing field is a hard error
 * (checklist item 4 — never default a field that enters an attestation).
 */
export function buildValidation(proof: CapturedProof): BuiltValidation {
  const v = proof.value;
  const minTs = v.summary?.updateStats?.minTimestamp;
  if (typeof minTs !== "number") throw new Error("proof missing summary.updateStats.minTimestamp");
  const epochDay = Math.floor(minTs / 86_400_000);
  const [dailyScoresPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    new PublicKey(TXLINE_PROGRAM_ID),
  );
  const stats = v.statsToProve.map((s: any) => {
    if (typeof s.key !== "number" || typeof s.value !== "number" || typeof s.period !== "number")
      throw new Error(`stat leaf missing key/value/period: ${JSON.stringify(s)}`);
    return { key: s.key, value: s.value, period: s.period };
  });
  const payload = {
    // MUST equal summary.updateStats.minTimestamp: the program re-derives the
    // daily-root seed from this ts and rejects TimestampMismatch otherwise
    // (deployed txoracle validate_stat_v2.rs:24).
    ts: new BN(minTs),
    fixtureSummary: {
      fixtureId: new BN(v.summary.fixtureId),
      updateStats: {
        updateCount: v.summary.updateStats.updateCount,
        minTimestamp: new BN(v.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(v.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: bytes32(v.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: proofNodes(v.subTreeProof),
    mainTreeProof: proofNodes(v.mainTreeProof),
    eventStatRoot: bytes32(v.eventStatRoot),
    stats: v.statsToProve.map((stat: unknown, index: number) => ({
      stat,
      statProof: proofNodes(v.statProofs[index]),
    })),
  };
  const strategy = {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates: stats.map((stat: { value: number }, index: number) => ({
      single: {
        index,
        // Exact equality against the PROOF's own attested value — no defaults.
        predicate: { threshold: stat.value, comparison: { equalTo: {} } },
      },
    })),
  };
  return { payload, strategy, dailyScoresPda, epochDay, proofTsMs: minTs, stats };
}

// ---------------------------------------------------------------------------
// Instruction bytes + multi-RPC .view() (items 1, 3, 5)
// ---------------------------------------------------------------------------

export interface RpcViewResult {
  endpoint: string;
  genesisHash: string;
  slot: number;
  returned: boolean;
}

export interface RootRead {
  endpoint: string;
  pda: string;
  slot: number;
  owner: string;
  lamports: number;
  dataLength: number;
  dataSha256: string;
}

export async function loadIdl(): Promise<anchor.Idl> {
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8")) as anchor.Idl;
  const ix = (idl as any).instructions?.find((i: any) => i.name === "validateStatV2" || i.name === "validate_stat_v2");
  if (!ix) throw new Error("pinned IDL has no validateStatV2 instruction");
  const disc = ix.discriminator as number[] | undefined;
  if (disc && JSON.stringify(disc) !== JSON.stringify(VALIDATE_STAT_V2_DISCRIMINATOR))
    throw new Error(`IDL discriminator mismatch: ${JSON.stringify(disc)}`);
  return idl;
}

/** Build the EXACT instruction (official IDL encoding) and assert its discriminator. */
export async function buildInstruction(built: BuiltValidation, payer: PublicKey) {
  const connection = new Connection(RPC_PRIMARY, "finalized");
  const provider = new anchor.AnchorProvider(
    connection,
    { publicKey: payer, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any,
    { commitment: "finalized" },
  );
  const program = new anchor.Program(await loadIdl(), provider);
  if (program.programId.toBase58() !== TXLINE_PROGRAM_ID)
    throw new Error(`IDL program id ${program.programId.toBase58()} != allowlisted TxLINE program`);
  const ix = await (program.methods as any)
    .validateStatV2(built.payload, built.strategy)
    .accounts({ dailyScoresMerkleRoots: built.dailyScoresPda })
    .instruction();
  const disc = [...ix.data.slice(0, 8)];
  if (JSON.stringify(disc) !== JSON.stringify(VALIDATE_STAT_V2_DISCRIMINATOR))
    throw new Error(`built instruction discriminator mismatch: ${JSON.stringify(disc)}`);
  return { program, instruction: ix, instructionData: Buffer.from(ix.data) };
}

/** Read the daily-root account at finalized commitment (item 3). */
export async function readRootAccount(endpoint: string, pda: PublicKey): Promise<RootRead> {
  const connection = new Connection(endpoint, "finalized");
  const genesisHash = await connection.getGenesisHash();
  assertMainnet(genesisHash, endpoint);
  const res = await connection.getAccountInfoAndContext(pda, "finalized");
  if (!res.value) throw new Error(`daily-root PDA ${pda.toBase58()} does not exist at finalized on ${endpoint}`);
  if (res.value.owner.toBase58() !== TXLINE_PROGRAM_ID)
    throw new Error(`daily-root PDA owner ${res.value.owner.toBase58()} != TxLINE program`);
  return {
    endpoint,
    pda: pda.toBase58(),
    slot: res.context.slot,
    owner: res.value.owner.toBase58(),
    lamports: res.value.lamports,
    dataLength: res.value.data.length,
    dataSha256: createHash("sha256").update(res.value.data).digest("hex"),
  };
}

/**
 * Run the read-only .view() on one endpoint using the IDENTICAL built
 * payload/strategy. Returns the boolean + finalized slot (item 5).
 */
/**
 * Simulation identity: the fee payer must be a FUNDED existing account for
 * simulateTransaction to pass the fee check, so we use the authorized burner
 * keypair (path from PROOFLINE_SIGNER_KEYPAIR) to sign the LOCAL simulation
 * only — identical to the capture repo's own .view() verifier. Nothing is
 * broadcast from this function and key material is never printed.
 */
function simulationKeypair(): Keypair {
  const path = process.env.PROOFLINE_SIGNER_KEYPAIR;
  if (!path) return Keypair.generate(); // may fail simulation fee checks on some RPCs
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  if (kp.publicKey.toBase58() !== AUTHORIZED_SIGNER)
    throw new Error(`keypair at PROOFLINE_SIGNER_KEYPAIR is not the authorized signer ${AUTHORIZED_SIGNER}`);
  return kp;
}

export async function viewOnEndpoint(endpoint: string, built: BuiltValidation): Promise<RpcViewResult> {
  const connection = new Connection(endpoint, "finalized");
  const genesisHash = await connection.getGenesisHash();
  assertMainnet(genesisHash, endpoint);
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(simulationKeypair()), {
    commitment: "finalized",
  });
  const program = new anchor.Program(await loadIdl(), provider);
  const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const slot = await connection.getSlot("finalized");
  let returned: boolean;
  try {
    returned = (await (program.methods as any)
      .validateStatV2(built.payload, built.strategy)
      .accounts({ dailyScoresMerkleRoots: built.dailyScoresPda })
      .preInstructions([compute])
      .view()) as boolean;
  } catch (error) {
    const detailed = error as Error & { logs?: string[]; simulationResponse?: unknown };
    const logs = detailed.logs ?? (detailed.simulationResponse as any)?.logs;
    throw new Error(
      `${endpoint} .view() failed: ${detailed.message}\nlogs: ${JSON.stringify(logs ?? "none", null, 2).slice(0, 2000)}`,
    );
  }
  if (typeof returned !== "boolean") throw new Error(`${endpoint} returned non-boolean: ${String(returned)}`);
  return { endpoint, genesisHash, slot, returned };
}

// ---------------------------------------------------------------------------
// Canonical evidence bundle + hashes (item 6)
// ---------------------------------------------------------------------------

/** Deterministic JSON: recursively sorted object keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Canonical bundle hash (documented recipe, checklist item 6): sha256 over
 * length-prefixed segments, in order:
 *   1. the VERBATIM raw stat-validation response string (utf8 bytes)
 *   2. canonicalJson(strategy)
 *   3. the daily-root PDA (base58, utf8)
 *   4. canonicalJson(finalRecord)
 */
export function bundleHash(opts: {
  rawResponse: string;
  strategy: unknown;
  rootPda: string;
  finalRecord: unknown;
}): Buffer {
  return sha256(
    Buffer.from(opts.rawResponse, "utf8"),
    Buffer.from(canonicalJson(opts.strategy), "utf8"),
    Buffer.from(opts.rootPda, "utf8"),
    Buffer.from(canonicalJson(opts.finalRecord), "utf8"),
  );
}

/** ix hash: sha256 over programId(base58,utf8) + exact instruction data bytes. */
export function instructionHash(instructionData: Buffer): Buffer {
  return sha256(Buffer.from(TXLINE_PROGRAM_ID, "utf8"), instructionData);
}

/** H/D/A from the proof's score stat leaves (keys 1 and 2). No defaults. */
export function resultFromStats(stats: Array<{ key: number; value: number; period: number }>): "H" | "D" | "A" {
  const p1 = stats.find((s) => s.key === 1);
  const p2 = stats.find((s) => s.key === 2);
  if (!p1 || !p2) throw new Error("proof stats do not include score keys 1 and 2 — cannot derive result");
  if (p1.value > p2.value) return "H";
  if (p1.value < p2.value) return "A";
  return "D";
}
