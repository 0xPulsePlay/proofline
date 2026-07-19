/**
 * ProofBuffer adapter — the untrusted-transport component from the design's
 * §3.5 staged-upload path.
 *
 * TRUST MODEL: the uploader is UNTRUSTED by design. It can submit garbage;
 * garbage fails the TxLINE CPI on-chain, so no trust ever transfers to this
 * role. Correctness is enforced by the Solana adapter program + Base
 * receivers, never here.
 *
 * WHAT IS REAL vs SIMULATED IN THIS BUILD:
 *  - REAL: chunking, seal-hash computation and verification (keccak256 — the
 *    same primitive @proofline/protocol/hashing builds every digest from),
 *    buffer lifecycle rules (append-only until sealed, seal-once, close).
 *  - SIMULATED: the Solana leg. `FileBackedProofBufferAdapter` persists the
 *    ProofBuffer account as a local JSON file and returns deterministic
 *    "sim:"-prefixed signatures that can never be mistaken for real ones.
 *
 * The `ProofBufferAdapter` interface mirrors the Anchor instruction set of
 * programs/proofline-adapter one-for-one (initialize_proof_buffer /
 * append_proof_chunk / seal_proof / close_proof_buffer). The real Anchor
 * client implementation is a clearly-marked drop-in (see AnchorProofBufferAdapter
 * note at the bottom) — no caller changes needed to go live.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "viem";

export interface ProofBufferAccount {
  address: string;
  authority: string;
  /** hex-encoded chunks in append order */
  chunks: string[];
  byteLength: number;
  sealed: boolean;
  /** keccak256 over the concatenated chunk bytes, set at seal time */
  sealedHash?: `0x${string}`;
  createdAt: number;
  sealedAt?: number;
  closedAt?: number;
}

export interface InstructionResult {
  /** Transaction signature. Simulated legs return "sim:"-prefixed values. */
  signature: string;
  simulated: boolean;
}

/** Mirrors the on-chain instruction set of programs/proofline-adapter. */
export interface ProofBufferAdapter {
  initializeProofBuffer(seed: string, authority: string): Promise<{ address: string } & InstructionResult>;
  appendProofChunk(address: string, chunk: Uint8Array): Promise<InstructionResult>;
  sealProof(address: string, expectedHash: `0x${string}`): Promise<InstructionResult>;
  closeProofBuffer(address: string): Promise<InstructionResult>;
  readBuffer(address: string): Promise<ProofBufferAccount | undefined>;
}

export function concatChunks(chunksHex: string[]): Uint8Array {
  const parts = chunksHex.map((h) => hexToBytes(h));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SIMULATED SOLANA LEG — file-backed mock of the ProofBuffer PDA. */
export class FileBackedProofBufferAdapter implements ProofBufferAdapter {
  constructor(private readonly storeDir: string) {}

  private path(address: string): string {
    return join(this.storeDir, `${address.replace(/[^a-zA-Z0-9:_-]/g, "_")}.json`);
  }

  private load(address: string): ProofBufferAccount {
    const p = this.path(address);
    if (!existsSync(p)) throw new Error(`ProofBuffer ${address} does not exist`);
    return JSON.parse(readFileSync(p, "utf8")) as ProofBufferAccount;
  }

  private save(account: ProofBufferAccount): void {
    mkdirSync(this.storeDir, { recursive: true });
    const p = this.path(account.address);
    writeFileSync(`${p}.tmp`, `${JSON.stringify(account, null, 2)}\n`);
    renameSync(`${p}.tmp`, p);
  }

  private simSig(op: string, seed: string): string {
    return `sim:${op}:${keccak256(new TextEncoder().encode(`proofline.proof-buffer.${op}.${seed}`)).slice(2, 18)}`;
  }

  async initializeProofBuffer(seed: string, authority: string) {
    // Deterministic sim address; "sim:" prefix so it cannot pass as a real PDA.
    const address = `sim:proofbuffer:${keccak256(new TextEncoder().encode(`proofline.proof-buffer.${seed}`)).slice(2, 14)}`;
    const existing = existsSync(this.path(address));
    if (!existing) {
      this.save({
        address,
        authority,
        chunks: [],
        byteLength: 0,
        sealed: false,
        createdAt: Date.now(),
      });
    }
    return { address, signature: this.simSig("init", address), simulated: true };
  }

  async appendProofChunk(address: string, chunk: Uint8Array): Promise<InstructionResult> {
    const account = this.load(address);
    if (account.sealed) throw new Error("cannot append to a sealed ProofBuffer");
    account.chunks.push(bytesToHex(chunk));
    account.byteLength += chunk.length;
    this.save(account);
    return {
      signature: this.simSig("append", `${address}.${account.chunks.length}`),
      simulated: true,
    };
  }

  async sealProof(address: string, expectedHash: `0x${string}`): Promise<InstructionResult> {
    const account = this.load(address);
    if (account.sealed) throw new Error("ProofBuffer already sealed");
    // The REAL invariant, enforced exactly as the on-chain program would:
    // re-hash the concatenated uploaded bytes and require equality with the
    // expected hash before the buffer becomes consumable.
    const actual = keccak256(concatChunks(account.chunks));
    if (actual !== expectedHash) {
      throw new Error(`seal hash mismatch: uploaded bytes hash to ${actual}, expected ${expectedHash}`);
    }
    account.sealed = true;
    account.sealedHash = actual;
    account.sealedAt = Date.now();
    this.save(account);
    return { signature: this.simSig("seal", address), simulated: true };
  }

  async closeProofBuffer(address: string): Promise<InstructionResult> {
    const account = this.load(address);
    account.closedAt = Date.now();
    this.save(account);
    rmSync(this.path(account.address));
    return { signature: this.simSig("close", address), simulated: true };
  }

  async readBuffer(address: string): Promise<ProofBufferAccount | undefined> {
    return existsSync(this.path(address)) ? this.load(address) : undefined;
  }
}

/**
 * LIVE-PATH ADAPTER (NOT IMPLEMENTED IN THIS BUILD) — the real implementation
 * of ProofBufferAdapter is an Anchor client against programs/proofline-adapter:
 *   initializeProofBuffer -> program.methods.initializeProofBuffer(...)
 *   appendProofChunk      -> program.methods.appendProofChunk(...)
 *   sealProof             -> program.methods.sealProof(expectedHash)
 *   closeProofBuffer      -> program.methods.closeProofBuffer()
 * Every call site in this repo goes through the interface above, so wiring
 * the Anchor client in is a constructor swap, not a refactor.
 */
export const ANCHOR_ADAPTER_NOTE =
  "AnchorProofBufferAdapter is intentionally absent in this build: the Solana leg is simulated.";
