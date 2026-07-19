/**
 * verify-evidence — INDEPENDENT verifier for a captured evidence run.
 *
 * Recomputes every digest from the raw evidence files (never trusting the
 * values the workflows wrote), decodes and cryptographically verifies the
 * VAA against the dev guardian set, and checks the dual-finality identity
 * attestationId(L3) === attestationId(L4) === conformance vector. Prints a
 * PASS/FAIL table and exits non-zero on any FAIL.
 *
 * What "verified" means here, honestly: the hashes, ABI/payload bytes and
 * 13-of-19 secp256k1 signatures are REAL and re-derived in this process.
 * The guardian set is the public-string-derived DEV set (the Solana leg is
 * simulated in this build), and sim-mode Base "transactions" are calldata
 * with "sim:"-prefixed hashes — this tool also asserts that labeling.
 *
 * Usage: pnpm --filter @proofline/relay-cli verify-evidence -- --run-id <id>
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverAddress } from "viem";
import {
  attestationId,
  base58ToHex32,
  bytesToHex,
  decodeMatchOutcomeV1,
  devGuardianAddress,
  GUARDIAN_QUORUM,
  proofBundleHash,
  TXORACLE_PROGRAM_ID,
  validationInstructionHash,
} from "@proofline/protocol";
import { decodeVaa, vaaSigningDigest } from "@proofline/wormhole-sdk";
import { validateManifest, type RunManifest } from "@proofline/event-model";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const runId = argValue("--run-id");
  if (!runId) throw new Error("--run-id required");
  const runDir = argValue("--run-dir") ?? join(repoRoot, "evidence/runs", runId);
  const readJson = <T>(f: string): T => JSON.parse(readFileSync(join(runDir, f), "utf8")) as T;

  const finalRecord = readJson<any>("txline-final-record.json");
  const proofFile = readJson<any>("txline-proof.json");
  const level3 = readJson<any>("level3-report.json");
  const level4 = readJson<any>("level4-report.json");
  const manifest = readJson<RunManifest>("manifest.json");
  const instructionData = new Uint8Array(readFileSync(join(runDir, "validation-instruction.bin")));
  const vaaBytes = new Uint8Array(readFileSync(join(runDir, "vaa.bin")));
  const vector = JSON.parse(
    readFileSync(join(repoRoot, "packages/test-vectors/match-outcome-v1.json"), "utf8"),
  ) as {
    outcome: Record<string, any>;
    sourceEmitter: `0x${string}`;
    encodedPayload: `0x${string}`;
    attestationId: `0x${string}`;
  };

  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ---- 1. VAA decodes; payload equals the conformance vector byte-for-byte
  const vaa = decodeVaa(vaaBytes);
  const payloadHex = bytesToHex(vaa.payload);
  check(
    "vaa payload == conformance vector",
    payloadHex === vector.encodedPayload,
    payloadHex === vector.encodedPayload ? `${vaa.payload.length} bytes identical` : `payload bytes differ`,
  );
  const outcome = decodeMatchOutcomeV1(vaa.payload);

  // ---- 2. proofBundleHash recomputed from the raw evidence files ---------
  const rebuiltBundle = {
    finalRecord: {
      action: finalRecord.action,
      fixtureId: finalRecord.fixtureId,
      statusId: finalRecord.statusId,
      period: finalRecord.period,
      participant1: finalRecord.participant1,
      participant2: finalRecord.participant2,
      participant1Score: finalRecord.participant1Score,
      participant2Score: finalRecord.participant2Score,
      sequence: finalRecord.sequence,
    },
    proof: proofFile.proof,
    rootAccount: proofFile.rootAccount,
    strategy: proofFile.strategy,
  };
  const pbh = proofBundleHash(rebuiltBundle);
  check(
    "proofBundleHash recomputed",
    pbh === outcome.proofBundleHash && pbh === vector.outcome.proofBundleHash,
    `recomputed ${pbh}`,
  );

  // ---- 3. validation-instruction.bin is the canonical exact-equality
  // predicate for this final record, and hashes to the committed digest ----
  const text = new TextDecoder().decode(instructionData);
  const m = /^validate_stat_v2:fixture=(\d+):p1=(\d+):p2=(\d+):period=(\d+)$/.exec(text);
  const predicateOk =
    !!m &&
    m[1] === String(finalRecord.fixtureId) &&
    Number(m[2]) === finalRecord.participant1Score &&
    Number(m[3]) === finalRecord.participant2Score &&
    Number(m[4]) === finalRecord.period;
  check("instruction predicate matches final record", predicateOk, text);
  const vih = validationInstructionHash(
    base58ToHex32(TXORACLE_PROGRAM_ID),
    base58ToHex32(proofFile.rootAccount),
    instructionData,
  );
  check(
    "validationInstructionHash recomputed",
    vih === outcome.validationInstructionHash && vih === vector.outcome.validationInstructionHash,
    `recomputed ${vih}`,
  );

  // ---- 4. payload fields vs the evidence final record --------------------
  const fieldsOk =
    outcome.fixtureId === BigInt(finalRecord.fixtureId) &&
    outcome.scoreSequence === BigInt(finalRecord.sequence) &&
    outcome.proofTimestampMs === BigInt(finalRecord.timestampMs) &&
    outcome.period === finalRecord.period &&
    outcome.participant1Score === finalRecord.participant1Score &&
    outcome.participant2Score === finalRecord.participant2Score &&
    outcome.txlineProgramId === base58ToHex32(TXORACLE_PROGRAM_ID) &&
    outcome.dailyRootAccount === base58ToHex32(proofFile.rootAccount);
  check(
    "payload fields match final record",
    fieldsOk,
    `${finalRecord.participant1} ${finalRecord.participant1Score}-${finalRecord.participant2Score} ${finalRecord.participant2}, fixture ${finalRecord.fixtureId}`,
  );

  // ---- 5. guardian signatures: 13-of-19 dev set, strictly ascending,
  // every signature recovered over the real Wormhole double-keccak digest --
  const digest = vaaSigningDigest(vaa);
  let sigsOk = vaa.version === 1 && vaa.signatures.length >= GUARDIAN_QUORUM;
  let sigDetail = `version ${vaa.version}, ${vaa.signatures.length}/${GUARDIAN_QUORUM} signatures`;
  let last = -1;
  for (const sig of vaa.signatures) {
    if (sig.guardianIndex <= last) {
      sigsOk = false;
      sigDetail = `indices not strictly ascending at ${sig.guardianIndex}`;
      break;
    }
    last = sig.guardianIndex;
    const recovered = await recoverAddress({
      hash: digest,
      signature: `0x${sig.r.slice(2)}${sig.s.slice(2)}${(sig.v + 27).toString(16).padStart(2, "0")}` as `0x${string}`,
    });
    if (recovered.toLowerCase() !== devGuardianAddress(sig.guardianIndex).toLowerCase()) {
      sigsOk = false;
      sigDetail = `signature for guardian ${sig.guardianIndex} does not recover`;
      break;
    }
  }
  check("guardian signatures verified (dev set)", sigsOk, sigDetail);

  // ---- 6. dual-finality identity -----------------------------------------
  const attRecomputed = attestationId({
    sourceEmitter: vaa.emitterAddress,
    fixtureId: outcome.fixtureId,
    scoreSequence: outcome.scoreSequence,
    validationInstructionHash: vih,
    proofBundleHash: pbh,
  });
  const l3Att = level3.report?.attestationId;
  const l4Att = level4.attestationId;
  const attOk =
    attRecomputed === l3Att &&
    attRecomputed === l4Att &&
    attRecomputed === vector.attestationId &&
    attRecomputed === manifest.attestationId &&
    vaa.emitterAddress === vector.sourceEmitter;
  check(
    "attestationId L3 == L4 == vector",
    attOk,
    attOk ? attRecomputed : `recomputed=${attRecomputed} L3=${l3Att} L4=${l4Att} vector=${vector.attestationId}`,
  );

  // ---- 7. honest labeling of simulated legs ------------------------------
  const simLabelOk =
    (!level3.simulated || String(level3.txHash).startsWith("sim:")) &&
    (!level4.simulated || String(level4.txHash).startsWith("sim:")) &&
    (!level4.simulated || !level4.settleTxHash || String(level4.settleTxHash).startsWith("sim:"));
  check(
    "simulated receipts labeled + sim: hashes",
    simLabelOk,
    `level3.simulated=${level3.simulated} level4.simulated=${level4.simulated}`,
  );

  // ---- 8. manifest structural validity -----------------------------------
  const manifestErrs = validateManifest(manifest);
  check(
    "manifest valid",
    manifestErrs.length === 0,
    manifestErrs.length ? manifestErrs.join("; ") : `${manifest.events.length} events, monotonic seq/timestamps`,
  );

  // ---- table --------------------------------------------------------------
  const nameWidth = Math.max(...checks.map((c) => c.name.length));
  process.stdout.write(`\nverify-evidence — run ${runId}\n${"".padEnd(nameWidth + 50, "-")}\n`);
  for (const c of checks) {
    process.stdout.write(`${c.pass ? "PASS" : "FAIL"}  ${c.name.padEnd(nameWidth)}  ${c.detail}\n`);
  }
  const failed = checks.filter((c) => !c.pass);
  process.stdout.write(`${"".padEnd(nameWidth + 50, "-")}\n`);
  process.stdout.write(
    failed.length === 0
      ? `ALL ${checks.length} CHECKS PASSED\n`
      : `${failed.length}/${checks.length} CHECKS FAILED\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err: Error) => {
  process.stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
