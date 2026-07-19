/**
 * Readback verifier — checklist item 8: after a broadcast, fetch the
 * transaction at finalized commitment from the SECOND RPC (not the one that
 * sent it), and verify: success, signer = the authorized burner, memo
 * program invoked, and byte-exact memo contents. Prints the explorer link
 * only after all checks pass.
 *
 * Usage: pnpm --filter @proofline/mainnet-attestor readback -- \
 *          --signature <sig> --memo-file <memo-broadcast.json>
 */
import { readFileSync } from "node:fs";
import { Connection } from "@solana/web3.js";
import { assertMainnet, AUTHORIZED_SIGNER, MEMO_PROGRAM_ID, RPC_SECONDARY } from "./common";
import { decodeMemo } from "./memo";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const signature = argValue("--signature");
  const memoFile = argValue("--memo-file");
  if (!signature || !memoFile) throw new Error("--signature and --memo-file required");
  const expected = JSON.parse(readFileSync(memoFile, "utf8")) as { memo: string };

  const connection = new Connection(RPC_SECONDARY, "finalized");
  assertMainnet(await connection.getGenesisHash(), RPC_SECONDARY);

  const tx = await connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error(`transaction ${signature} not found at finalized on ${RPC_SECONDARY}`);
  if (tx.meta?.err) throw new Error(`transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);

  const message = tx.transaction.message;
  const keys = message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  const signer = keys[0];
  if (signer !== AUTHORIZED_SIGNER) throw new Error(`signer ${signer} != authorized ${AUTHORIZED_SIGNER}`);

  const memoIx = message.compiledInstructions.find(
    (ix) => keys[ix.programIdIndex] === MEMO_PROGRAM_ID,
  );
  if (!memoIx) throw new Error("no Memo-program instruction in transaction");
  const onChainMemo = Buffer.from(memoIx.data).toString("utf8");
  if (onChainMemo !== expected.memo)
    throw new Error(`memo bytes differ!\n on-chain: ${onChainMemo}\n expected: ${expected.memo}`);
  const decoded = decodeMemo(onChainMemo);

  console.log("READBACK PASS (verified via second RPC at finalized):");
  console.log(`  signature ${signature}`);
  console.log(`  slot      ${tx.slot}`);
  console.log(`  blockTime ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "n/a"}`);
  console.log(`  signer    ${signer} (authorized ✓)`);
  console.log(`  memo      byte-exact ✓ (${Buffer.byteLength(onChainMemo)} bytes)`);
  for (const [k, v] of Object.entries(decoded)) console.log(`    ${k.padEnd(10)} ${v}`);
  console.log(`  explorer  https://explorer.solana.com/tx/${signature}`);
  console.log(`  solscan   https://solscan.io/tx/${signature}`);
}

main().catch((err: Error) => {
  console.error(`READBACK FAILED: ${err.stack ?? err.message}`);
  process.exit(1);
});
