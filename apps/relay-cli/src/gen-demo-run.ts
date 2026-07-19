/**
 * Generates the CANONICAL bundled demo run for the web app (replay mode).
 *
 * Honesty model of this recording:
 *  - REAL: every hash and signature — the MatchOutcomeV1 payload bytes, the
 *    proof-bundle / validation-instruction hashes, the dev-guardian
 *    secp256k1 VAA signatures over the real Wormhole double-keccak digest,
 *    the VAA hash, and the attestationId (asserted byte-for-byte against
 *    packages/test-vectors/match-outcome-v1.json).
 *  - REAL: the Base Sepolia contract addresses (packages/config/deployments).
 *  - SIMULATED (marked per-event `simulated: true`): the network legs — no
 *    Solana broadcast, no live guardian network, and the Base transaction
 *    hashes in this recording are placeholders (a capture-run against the
 *    deployed contracts replaces them). Simulated events never get explorer
 *    links in the UI.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunEvent, RunManifest } from "@proofline/event-model";
import { keccak256, stringToBytes } from "viem";
import {
  attestationId as deriveAttestationId,
  bytesToHex,
  encodeMatchOutcomeV1,
  DOMAIN_SEPARATOR,
  WORMHOLE_CHAIN_SOLANA,
  type MatchOutcomeV1,
  type ResultCode,
} from "@proofline/protocol";
import {
  encodeVaa,
  signVaaWithDevGuardians,
  vaaHash as computeVaaHash,
  defaultQuorumIndices,
  DEMO_EMITTER,
  DEMO_EMITTER_BASE58,
  type VaaBody,
} from "@proofline/wormhole-sdk";
import { DEMO_FIXTURE } from "./fixture";

const here = dirname(fileURLToPath(import.meta.url));
const webRuns = join(here, "../../web/public/runs");
const vectorPath = join(here, "../../../packages/test-vectors/match-outcome-v1.json");
const deploymentPath = join(here, "../../../packages/config/deployments/base-sepolia.json");

interface Vector {
  domainSeparator: string;
  outcome: {
    flags: number;
    destinationChain: number;
    sourceValidationVersion: number;
    result: number;
    fixtureId: string;
    scoreSequence: string;
    proofTimestampMs: string;
    period: number;
    participant1Score: number;
    participant2Score: number;
    txlineProgramId: `0x${string}`;
    dailyRootAccount: `0x${string}`;
    validationInstructionHash: `0x${string}`;
    proofBundleHash: `0x${string}`;
  };
  sourceEmitter: `0x${string}`;
  encodedPayload: `0x${string}`;
  attestationId: `0x${string}`;
}

interface Deployment {
  chainId: number;
  explorerBaseUrl: string;
  contracts: Record<string, string>;
  registeredEmitter: string;
  quorum: number;
}

async function main() {
  const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as Vector;
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as Deployment;

  // ---- REAL derivations, conformance-asserted against the vector ----------
  const outcome: MatchOutcomeV1 = {
    flags: vector.outcome.flags,
    destinationChain: vector.outcome.destinationChain,
    sourceValidationVersion: vector.outcome.sourceValidationVersion,
    result: vector.outcome.result as ResultCode,
    fixtureId: BigInt(vector.outcome.fixtureId),
    scoreSequence: BigInt(vector.outcome.scoreSequence),
    proofTimestampMs: BigInt(vector.outcome.proofTimestampMs),
    period: vector.outcome.period,
    participant1Score: vector.outcome.participant1Score,
    participant2Score: vector.outcome.participant2Score,
    txlineProgramId: vector.outcome.txlineProgramId,
    dailyRootAccount: vector.outcome.dailyRootAccount,
    validationInstructionHash: vector.outcome.validationInstructionHash,
    proofBundleHash: vector.outcome.proofBundleHash,
  };

  const payload = encodeMatchOutcomeV1(outcome);
  const payloadHex = bytesToHex(payload);
  if (payloadHex !== vector.encodedPayload)
    throw new Error("payload encoding drifted from conformance vector");
  if (DOMAIN_SEPARATOR !== vector.domainSeparator)
    throw new Error("domain separator drifted from conformance vector");
  if (DEMO_EMITTER !== vector.sourceEmitter)
    throw new Error("demo emitter drifted from conformance vector");
  if (deployment.registeredEmitter !== vector.sourceEmitter)
    throw new Error("deployed registeredEmitter does not match conformance vector");

  const attId = deriveAttestationId({
    sourceEmitter: vector.sourceEmitter,
    fixtureId: outcome.fixtureId,
    scoreSequence: outcome.scoreSequence,
    validationInstructionHash: outcome.validationInstructionHash,
    proofBundleHash: outcome.proofBundleHash,
  });
  if (attId !== vector.attestationId)
    throw new Error("attestationId derivation drifted from conformance vector");

  // Real VAA: real wire format, real secp256k1 signatures by the (public,
  // re-derivable) dev guardian set over the real double-keccak digest.
  const body: VaaBody = {
    timestamp: Math.floor(Number(outcome.proofTimestampMs) / 1000),
    nonce: 0,
    emitterChainId: WORMHOLE_CHAIN_SOLANA,
    emitterAddress: vector.sourceEmitter,
    sequence: outcome.scoreSequence,
    consistencyLevel: 1,
    payload,
  };
  const guardianIndices = defaultQuorumIndices();
  const vaa = await signVaaWithDevGuardians(body, guardianIndices);
  const vaaBytes = encodeVaa(vaa);
  const vaaHex = bytesToHex(vaaBytes);
  const vaaHash = computeVaaHash(vaaBytes);

  // ---- Event stream (network legs simulated, marked as such) --------------
  const t0 = Date.parse("2026-07-19T18:55:00Z");
  let seq = 0;
  let t = t0;
  const mk = (event: RunEvent["event"], gapMs: number, simulated = true): RunEvent => {
    t += gapMs;
    return { seq: seq++, at: t, simulated, event };
  };
  const simTx = (s: string) => keccak256(stringToBytes(`proofline.demo.simulated-tx.${s}`));
  const simDigest = (provider: string) =>
    keccak256(stringToBytes(`proofline.demo.sim.${provider}.${outcome.validationInstructionHash}`));

  const events: RunEvent[] = [
    mk({ type: "HEARTBEAT", at: t0, nextAt: t0 + 30000 }, 0),
    mk({ type: "FINAL_RECORD_OBSERVED", fixtureId: vector.outcome.fixtureId, sequence: vector.outcome.scoreSequence }, 1200),
    mk({ type: "PROOF_AVAILABLE", proofHash: outcome.proofBundleHash, rootPda: DEMO_FIXTURE_ROOT }, 5200, false),
    mk({ type: "LEVEL3_RPC_RESULT", provider: "RPC A", agreed: true, simulationDigest: simDigest("a") }, 2100),
    mk({ type: "LEVEL3_RPC_RESULT", provider: "RPC B", agreed: true, simulationDigest: simDigest("b") }, 900),
    mk({ type: "LEVEL3_RPC_RESULT", provider: "RPC C", agreed: true, simulationDigest: simDigest("c") }, 700),
    mk({ type: "LEVEL3_BASE_FINALIZED", txHash: simTx("level3") }, 3500),
    mk({ type: "PROOF_STAGED", solanaSignature: "SIMStageDemoNotBroadcast" }, 1500),
    mk({ type: "SOLANA_VERIFY_SUBMITTED", signature: "SIMVerifyDemoNotBroadcast" }, 1900),
    mk({ type: "TXLINE_CPI_VERIFIED", slot: 1234567 }, 2400),
    mk({ type: "WORMHOLE_MESSAGE_PUBLISHED", emitter: DEMO_EMITTER_BASE58, sequence: vector.outcome.scoreSequence }, 2100),
    // VAA hash + signer indices are REAL (decoded from the dev-guardian-signed
    // VAA above); the guardian OBSERVATION step is what's simulated.
    mk({ type: "VAA_READY", vaaHash, signatures: vaa.signatures.map((s) => s.guardianIndex) }, 6800),
    mk({ type: "LEVEL4_BASE_SUBMITTED", txHash: simTx("level4") }, 2600),
    mk({ type: "BASE_VAA_VERIFIED", blockNumber: 44339771 }, 2900),
    mk({ type: "DUAL_FINALITY_REACHED", attestationId: attId }, 800, false),
    mk({ type: "CONSUMER_SETTLED", txHash: simTx("settle") }, 3400),
  ];

  const manifest: RunManifest = {
    runId: "demo-canonical",
    createdAtIso: new Date().toISOString(),
    description:
      "Canonical bundled demo run — Canada 2–1 France, fixture 982341. All hashes, payload bytes, dev-guardian VAA signatures and attestation ids are REAL protocol math (asserted against the conformance vector). Network legs (Solana broadcast, guardian observation, Base transactions) are simulated in this recording and marked per-event.",
    fixture: DEMO_FIXTURE,
    contracts: {
      chainId: deployment.chainId,
      explorerBaseUrl: deployment.explorerBaseUrl,
      finalityRegistry: deployment.contracts.finalityRegistry,
      creLevel3Receiver: deployment.contracts.creLevel3Receiver,
      wormholeOutcomeReceiver: deployment.contracts.wormholeOutcomeReceiver,
      demoPredictionMarket: deployment.contracts.demoPredictionMarket,
      wormholeCore: deployment.contracts.wormholeCore,
      wormholeCoreKind: "dev-guardian-set-mock",
    },
    attestationId: attId,
    simulatedLegs: [
      "txline-feed",
      "level3-rpc",
      "solana-adapter",
      "wormhole-guardians",
      "base-transactions",
    ],
    derivation: {
      payloadHex,
      proofBundleHash: outcome.proofBundleHash,
      validationInstructionHash: outcome.validationInstructionHash,
      attestationId: attId,
      domainSeparator: DOMAIN_SEPARATOR,
      sourceEmitter: vector.sourceEmitter,
      txlineProgramId: outcome.txlineProgramId,
      dailyRootAccount: outcome.dailyRootAccount,
      vaaHex,
      vaaHash,
      guardianIndices,
    },
    events,
    artifacts: {
      "manifest.json": "this recorded event stream + derivations",
      "payload.hex": `MatchOutcomeV1 (176 bytes) — keccak-committed fields, conformance-asserted`,
      "vaa.hex": `signed VAA (${vaa.signatures.length} dev-guardian signatures, quorum ${deployment.quorum})`,
      "match-outcome-v1.json": "conformance vector this run reproduces byte-for-byte",
      "fixture-982341.json": "deterministic TxLINE-style fixture recording",
    },
  };

  const dir = join(webRuns, manifest.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "payload.hex"), payloadHex + "\n");
  writeFileSync(join(dir, "vaa.hex"), vaaHex + "\n");
  writeFileSync(
    join(webRuns, "index.json"),
    JSON.stringify({ runs: [manifest.runId], default: manifest.runId }, null, 2),
  );
  console.log(`wrote ${dir}/manifest.json (attestationId ${attId})`);
}

const DEMO_FIXTURE_ROOT = "7dai1yRoots1111111111111111111111111111111";

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
