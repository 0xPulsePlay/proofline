/**
 * chunk-proof — split a canonicalized proof bundle into ProofBuffer-sized
 * chunks and upload them via the (untrusted) ProofBuffer adapter.
 *
 * Chunk size defaults to 900 bytes — the value that keeps one
 * append_proof_chunk instruction comfortably inside a Solana transaction
 * packet alongside account metadata (the entire reason the staged path
 * exists, §3.5). The chunking/sealing logic is REAL; the Solana leg behind
 * the adapter is simulated in this build (see proof-buffer-adapter.ts).
 *
 * CLI: pnpm --filter @proofline/proof-uploader chunk <proof-file> <store-dir>
 */
import { readFileSync } from "node:fs";
import { canonicalJson, proofBundleHash } from "@proofline/protocol";
import {
  FileBackedProofBufferAdapter,
  type ProofBufferAdapter,
  type InstructionResult,
} from "./proof-buffer-adapter";

export const DEFAULT_CHUNK_SIZE = 900;

export function chunkBytes(bytes: Uint8Array, chunkSize = DEFAULT_CHUNK_SIZE): Uint8Array[] {
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < bytes.length; off += chunkSize) {
    chunks.push(bytes.slice(off, off + chunkSize));
  }
  return chunks;
}

export interface StageResult {
  bufferAddress: string;
  chunkCount: number;
  byteLength: number;
  initSignature: string;
  chunkSignatures: string[];
  /** keccak256 the buffer must seal to — derived via @proofline/protocol hashing. */
  expectedHash: `0x${string}`;
  simulated: boolean;
}

/**
 * Canonicalize a proof bundle (sorted-key JSON — the same canonical form
 * proof_bundle_hash commits to), chunk it, and upload every chunk.
 * Does NOT seal — sealing is a separate explicit step (seal-proof.ts),
 * mirroring the on-chain instruction split.
 */
export async function stageProofBundle(
  adapter: ProofBufferAdapter,
  bundle: unknown,
  opts: { seed: string; authority?: string; chunkSize?: number },
): Promise<StageResult> {
  const canonical = new TextEncoder().encode(canonicalJson(bundle));
  const expectedHash = proofBundleHash(bundle);
  const init = await adapter.initializeProofBuffer(opts.seed, opts.authority ?? "sim:uploader");
  const chunks = chunkBytes(canonical, opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const chunkSignatures: string[] = [];
  let simulated = init.simulated;
  for (const chunk of chunks) {
    const res: InstructionResult = await adapter.appendProofChunk(init.address, chunk);
    chunkSignatures.push(res.signature);
    simulated = simulated || res.simulated;
  }
  return {
    bufferAddress: init.address,
    chunkCount: chunks.length,
    byteLength: canonical.length,
    initSignature: init.signature,
    chunkSignatures,
    expectedHash,
    simulated,
  };
}

// --- CLI ---
const isMain = process.argv[1]?.endsWith("chunk-proof.ts");
if (isMain) {
  const [proofFile, storeDir] = process.argv.slice(2);
  if (!proofFile || !storeDir) {
    process.stderr.write("usage: chunk-proof.ts <proof-bundle.json> <store-dir>\n");
    process.exit(2);
  }
  const bundle = JSON.parse(readFileSync(proofFile, "utf8")) as unknown;
  const adapter = new FileBackedProofBufferAdapter(storeDir);
  stageProofBundle(adapter, bundle, { seed: proofFile }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });
}
