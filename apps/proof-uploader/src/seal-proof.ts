/**
 * seal-proof — seal a fully-uploaded ProofBuffer with its expected hash.
 *
 * The seal invariant is REAL and enforced by the adapter exactly as the
 * on-chain program would: the concatenated uploaded bytes are re-hashed
 * (keccak256 — the primitive all @proofline/protocol digests are built on)
 * and must equal the expected hash, or sealing fails. An uploader that
 * uploaded garbage cannot seal against the true proof hash.
 *
 * CLI: pnpm --filter @proofline/proof-uploader seal <store-dir> <buffer-address> <expected-hash>
 */
import {
  FileBackedProofBufferAdapter,
  type ProofBufferAdapter,
  type InstructionResult,
} from "./proof-buffer-adapter";

export async function sealProofBuffer(
  adapter: ProofBufferAdapter,
  bufferAddress: string,
  expectedHash: `0x${string}`,
): Promise<InstructionResult> {
  return adapter.sealProof(bufferAddress, expectedHash);
}

// --- CLI ---
const isMain = process.argv[1]?.endsWith("seal-proof.ts");
if (isMain) {
  const [storeDir, address, expectedHash] = process.argv.slice(2);
  if (!storeDir || !address || !expectedHash?.startsWith("0x")) {
    process.stderr.write("usage: seal-proof.ts <store-dir> <buffer-address> <0x-expected-hash>\n");
    process.exit(2);
  }
  const adapter = new FileBackedProofBufferAdapter(storeDir);
  sealProofBuffer(adapter, address, expectedHash as `0x${string}`)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((err: Error) => {
      process.stderr.write(`seal failed: ${err.message}\n`);
      process.exit(1);
    });
}
