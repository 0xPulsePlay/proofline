/**
 * The rehearsed verify→bundle pipeline, shared verbatim by rehearse.ts
 * (historical gate) and live.ts (the final). The live path runs EXACTLY the
 * code the rehearsal proved green — that is the point of the gate.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import {
  AUTHORIZED_SIGNER,
  buildInstruction,
  buildValidation,
  bundleHash,
  canonicalJson,
  instructionHash,
  readRootAccount,
  resultFromStats,
  RPC_PRIMARY,
  RPC_SECONDARY,
  TXLINE_IDL_COMMIT,
  TXLINE_PROGRAM_ID,
  viewOnEndpoint,
  type CapturedProof,
} from "./common";

export interface FinalRecord {
  FixtureId: number;
  Action: string;
  StatusId: number;
  Seq: number;
  Ts: number;
  Stats?: Record<string, number>;
}

export interface PipelineResult {
  manifest: Record<string, unknown>;
  outDir: string;
  allTrue: boolean;
}

export async function runVerification(opts: {
  proof: CapturedProof;
  finalRecord: FinalRecord;
  outDir: string;
  mode: "historical-rehearsal" | "live-final";
  log?: (line: string) => void;
}): Promise<PipelineResult> {
  const { proof, finalRecord, outDir, mode } = opts;
  const log = opts.log ?? ((l: string) => console.log(l));
  mkdirSync(outDir, { recursive: true });

  const built = buildValidation(proof);
  // Cross-check proof stat leaves against the finalisation record (item 4).
  for (const stat of built.stats) {
    const recorded = finalRecord.Stats?.[String(stat.key)];
    if (recorded !== undefined && recorded !== stat.value)
      throw new Error(`stat ${stat.key}: proof=${stat.value} but finalisation record=${recorded}`);
  }
  if (proof.seq !== finalRecord.Seq)
    throw new Error(`proof seq ${proof.seq} != finalisation record seq ${finalRecord.Seq}`);
  const result = resultFromStats(built.stats);
  log(`stats: ${built.stats.map((s) => `${s.key}=${s.value}`).join(" ")} → result=${result}`);

  const signerPk = new PublicKey(AUTHORIZED_SIGNER);
  const a = await buildInstruction(built, signerPk);
  const b = await buildInstruction(built, signerPk);
  if (!a.instructionData.equals(b.instructionData)) throw new Error("instruction bytes differ between builds");
  const ixHash = instructionHash(a.instructionData);
  log(`instruction ${a.instructionData.length}B ix=0x${ixHash.toString("hex").slice(0, 16)}…`);

  const rootReads = [
    await readRootAccount(RPC_PRIMARY, built.dailyScoresPda),
    await readRootAccount(RPC_SECONDARY, built.dailyScoresPda),
  ];
  const views = [await viewOnEndpoint(RPC_PRIMARY, built), await viewOnEndpoint(RPC_SECONDARY, built)];
  for (const v of views) log(`view @ ${v.endpoint}: slot=${v.slot} returned=${v.returned}`);
  const allTrue = views.every((v) => v.returned === true);

  const bHash = bundleHash({
    rawResponse: proof.rawResponse,
    strategy: built.strategy,
    rootPda: built.dailyScoresPda.toBase58(),
    finalRecord,
  });
  const manifest = {
    schema: "proofline-mainnet-evidence-v1",
    mode,
    cluster: "mainnet-beta",
    txlineProgram: TXLINE_PROGRAM_ID,
    txlineIdlCommit: TXLINE_IDL_COMMIT,
    fixtureId: proof.fixtureId,
    seq: proof.seq,
    result,
    stats: built.stats,
    proofTsMs: built.proofTsMs,
    epochDay: built.epochDay,
    rootPda: built.dailyScoresPda.toBase58(),
    rootReads,
    views,
    instructionDataLength: a.instructionData.length,
    ixHash: `0x${ixHash.toString("hex")}`,
    bundleHash: `0x${bHash.toString("hex")}`,
    capturedAt: proof.capturedAt,
    proofSource: proof.source,
    trustWording:
      "real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet",
  };
  writeFileSync(join(outDir, "raw-proof-response.json"), proof.rawResponse);
  writeFileSync(join(outDir, "instruction-data.bin"), a.instructionData);
  writeFileSync(join(outDir, "strategy.canonical.json"), canonicalJson(built.strategy));
  writeFileSync(join(outDir, "final-record.json"), JSON.stringify(finalRecord, null, 2));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { manifest, outDir, allTrue };
}
