/**
 * cleanup — close a ProofBuffer after the verification command has consumed
 * it (rent reclamation on the real Solana leg; file removal in this build's
 * file-backed simulation).
 *
 * CLI: pnpm --filter @proofline/proof-uploader cleanup <store-dir> <buffer-address>
 */
import {
  FileBackedProofBufferAdapter,
  type ProofBufferAdapter,
  type InstructionResult,
} from "./proof-buffer-adapter";

export async function closeProofBuffer(
  adapter: ProofBufferAdapter,
  bufferAddress: string,
): Promise<InstructionResult> {
  return adapter.closeProofBuffer(bufferAddress);
}

// --- CLI ---
const isMain = process.argv[1]?.endsWith("cleanup.ts");
if (isMain) {
  const [storeDir, address] = process.argv.slice(2);
  if (!storeDir || !address) {
    process.stderr.write("usage: cleanup.ts <store-dir> <buffer-address>\n");
    process.exit(2);
  }
  const adapter = new FileBackedProofBufferAdapter(storeDir);
  closeProofBuffer(adapter, address)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((err: Error) => {
      process.stderr.write(`cleanup failed: ${err.message}\n`);
      process.exit(1);
    });
}
