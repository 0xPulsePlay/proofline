/**
 * Memo v1 attestation builder — checklist items 7 and 8.
 *
 * DRY-RUN IS THE DEFAULT AND THE ONLY UNGATED MODE. Broadcasting requires
 * BOTH the `--broadcast` flag AND PROOFLINE_MAINNET_GO=1 (set only after an
 * explicit Director GO in-thread). In dry-run this builds the memo from a
 * rehearsed evidence manifest, prints the decoded contents, serializes and
 * fully validates the UNSIGNED transaction locally, and writes a
 * memo-preview.json next to the manifest. Nothing touches the network beyond
 * a recent-blockhash fetch.
 *
 * Memo format (review §2B, verbatim schema):
 *   proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|
 *   root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=<commit>
 *   [|supersedes=<signature>]
 *
 * Deterministic attestation id: sha256 over the canonical identity tuple
 * (cluster, TxLINE program, fixture, seq, root, ix, bundle) — one id per
 * tuple; corrections must use supersedes=<signature>, never overwrite.
 *
 * Usage:
 *   pnpm --filter @proofline/mainnet-attestor memo -- --manifest <path>            # dry-run
 *   pnpm --filter @proofline/mainnet-attestor memo -- --manifest <path> --broadcast # gated
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  assertMainnet,
  AUTHORIZED_SIGNER,
  canonicalJson,
  MAX_TOTAL_FEE_LAMPORTS,
  MEMO_PROGRAM_ID,
  RPC_PRIMARY,
  sha256,
  TXLINE_IDL_COMMIT,
  TXLINE_PROGRAM_ID,
} from "./common";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const MEMO_RE =
  /^proofline:v1\|cluster=mainnet-beta\|fixture=\d+\|seq=\d+\|result=[HDA]\|root=[1-9A-HJ-NP-Za-km-z]{32,44}\|ix=0x[0-9a-f]{64}\|bundle=0x[0-9a-f]{64}\|proofTs=\d+\|txlineIdl=[0-9a-f]{40}(\|supersedes=[1-9A-HJ-NP-Za-km-z]{64,88})?$/;

export function buildMemoString(m: {
  fixtureId: string;
  seq: number;
  result: string;
  rootPda: string;
  ixHash: string;
  bundleHash: string;
  proofTsMs: number;
  supersedes?: string;
}): string {
  const memo =
    `proofline:v1|cluster=mainnet-beta|fixture=${m.fixtureId}|seq=${m.seq}|result=${m.result}` +
    `|root=${m.rootPda}|ix=${m.ixHash}|bundle=${m.bundleHash}|proofTs=${m.proofTsMs}` +
    `|txlineIdl=${TXLINE_IDL_COMMIT}` +
    (m.supersedes ? `|supersedes=${m.supersedes}` : "");
  if (!MEMO_RE.test(memo)) throw new Error(`built memo fails schema validation: ${memo}`);
  if (Buffer.byteLength(memo, "utf8") > 566) throw new Error("memo too long for a single transaction");
  return memo;
}

export function decodeMemo(memo: string): Record<string, string> {
  if (!MEMO_RE.test(memo)) throw new Error("memo does not match proofline:v1 schema");
  const out: Record<string, string> = {};
  for (const part of memo.split("|").slice(1)) {
    const eq = part.indexOf("=");
    out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

export function attestationIdFor(m: {
  fixtureId: string;
  seq: number;
  rootPda: string;
  ixHash: string;
  bundleHash: string;
}): string {
  const tuple = canonicalJson({
    cluster: "mainnet-beta",
    txlineProgram: TXLINE_PROGRAM_ID,
    fixture: m.fixtureId,
    seq: m.seq,
    root: m.rootPda,
    ix: m.ixHash,
    bundle: m.bundleHash,
  });
  return `0x${sha256(Buffer.from(tuple, "utf8")).toString("hex")}`;
}

async function main(): Promise<void> {
  const manifestPath = argValue("--manifest");
  if (!manifestPath) throw new Error("--manifest <path to rehearsal/live manifest.json> required");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const k of ["fixtureId", "seq", "result", "rootPda", "ixHash", "bundleHash", "proofTsMs"])
    if (manifest[k] === undefined) throw new Error(`manifest missing ${k}`);
  if (!manifest.views?.length || !manifest.views.every((v: any) => v.returned === true))
    throw new Error("manifest does not show .view() true on all RPCs — refusing to build a memo (never memo unverified)");

  const memo = buildMemoString({ ...manifest, supersedes: argValue("--supersedes") });
  const attestationId = attestationIdFor(manifest);
  const decoded = decodeMemo(memo);

  console.log("=== MEMO PREVIEW (decoded before any signing — checklist item 7) ===");
  for (const [k, v] of Object.entries(decoded)) console.log(`  ${k.padEnd(10)} ${v}`);
  console.log(`  attestationId ${attestationId}`);
  console.log(`  memo bytes    ${Buffer.byteLength(memo, "utf8")}`);

  // Build the transaction (unsigned in dry-run).
  const connection = new Connection(RPC_PRIMARY, "finalized");
  assertMainnet(await connection.getGenesisHash(), RPC_PRIMARY);
  const signerPk = new PublicKey(AUTHORIZED_SIGNER);
  const memoIx = new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: signerPk, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
  // No priority fee by default; the cap check below still enforces the ceiling.
  const computePrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction({ feePayer: signerPk, blockhash, lastValidBlockHeight });
  tx.add(computePrice, memoIx);

  const feeResp = await connection.getFeeForMessage(tx.compileMessage(), "finalized");
  const fee = feeResp.value ?? 5000;
  if (fee > MAX_TOTAL_FEE_LAMPORTS) throw new Error(`fee ${fee} exceeds cap ${MAX_TOTAL_FEE_LAMPORTS}`);
  console.log(`  fee (queried) ${fee} lamports (cap ${MAX_TOTAL_FEE_LAMPORTS})`);

  const preview = {
    schema: "proofline-memo-preview-v1",
    memo,
    decoded,
    attestationId,
    signer: AUTHORIZED_SIGNER,
    memoProgram: MEMO_PROGRAM_ID,
    feeLamports: fee,
    blockhash,
    lastValidBlockHeight,
    unsignedTxBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
  };
  const outPath = join(dirname(manifestPath), "memo-preview.json");
  writeFileSync(outPath, JSON.stringify(preview, null, 2));
  console.log(`\nDRY-RUN: unsigned transaction validated + serialized → ${outPath}`);

  const wantBroadcast = process.argv.includes("--broadcast");
  const goEnv = process.env.PROOFLINE_MAINNET_GO === "1";
  if (!wantBroadcast) {
    console.log("No --broadcast flag: stopping at dry-run (default).");
    return;
  }
  if (!goEnv) {
    console.log("BROADCAST BLOCKED: PROOFLINE_MAINNET_GO != 1 — Director GO not recorded. Staying dry.");
    return;
  }

  // ---- GATED BROADCAST PATH (requires --broadcast AND PROOFLINE_MAINNET_GO=1) ----
  const keyPath = process.env.PROOFLINE_SIGNER_KEYPAIR;
  if (!keyPath) throw new Error("PROOFLINE_SIGNER_KEYPAIR not set");
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))));
  if (keypair.publicKey.toBase58() !== AUTHORIZED_SIGNER)
    throw new Error("keypair is not the authorized signer — refusing");
  tx.sign(keypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`broadcast: ${sig} — awaiting finalized…`);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "finalized");
  writeFileSync(
    join(dirname(manifestPath), "memo-broadcast.json"),
    JSON.stringify({ signature: sig, memo, attestationId, broadcastAt: Date.now() }, null, 2),
  );
  console.log(`finalized: ${sig}`);
  console.log(`explorer: https://explorer.solana.com/tx/${sig}`);
  console.log(`next: pnpm --filter @proofline/mainnet-attestor readback -- --signature ${sig} --memo-file ${join(dirname(manifestPath), "memo-broadcast.json")}`);
}

const invokedDirectly = process.argv[1]?.endsWith("memo.ts");
if (invokedDirectly)
  main().catch((err: Error) => {
    console.error(`memo failed: ${err.stack ?? err.message}`);
    process.exit(1);
  });
