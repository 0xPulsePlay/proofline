/**
 * Tamper Lab engine — forgery scenarios verified IN THE BROWSER with the same
 * math the Base contract runs (contracts/base/src/WormholeOutcomeReceiver.sol
 * §3.5 check order + MockWormholeCore signature verification). The contract's
 * ACTUAL error names are shown for each failure.
 *
 * The dev guardian set is derived from public strings (a transparency device,
 * not a secret) — which is exactly why "forging" is demonstrable here: the
 * checks fail for structural/cryptographic reasons an attacker cannot avoid
 * even knowing the keys they DON'T control (score tamper breaks signatures;
 * quorum needs 13; the emitter and replay checks live on Base).
 */
import { keccak256, recoverAddress, stringToBytes } from "viem";
// Subpath imports: the package barrel re-exports the node-only vaa-fetcher,
// which cannot bundle for the browser.
import {
  decodeVaa,
  encodeVaa,
  vaaHash as computeVaaHash,
  vaaSigningDigest,
  type VaaBody,
} from "@proofline/wormhole-sdk/vaa-decoder";
import {
  signVaaWithDevGuardians,
  defaultQuorumIndices,
} from "@proofline/wormhole-sdk/signatures";
import {
  attestationId as deriveAttestationId,
  decodeMatchOutcomeV1,
  devGuardianAddresses,
  bytesToHex,
  GUARDIAN_QUORUM,
  GUARDIAN_SET_SIZE,
  WORMHOLE_CHAIN_SOLANA,
  WORMHOLE_CHAIN_BASE_SEPOLIA,
} from "@proofline/protocol";
import { demoManifest, deployment } from "./demo-data";

export type CheckStatus = "pass" | "fail" | "skipped";

export interface CheckResult {
  /** contract check label, in _consumeVaa order */
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface Verdict {
  checks: CheckResult[];
  accepted: boolean;
  /** ACTUAL Solidity error, e.g. `InvalidVaa("no quorum")` */
  contractError?: string;
  attestationId?: string;
}

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  /** what was changed relative to the canonical VAA */
  mutation: string;
  vaaBytes: Uint8Array;
  /** simulate Base state where the canonical VAA was already consumed */
  consumedVaaHashes: Set<string>;
  expectedError: string;
  happy?: boolean;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Canonical VAA straight from the bundled run's derivation block. */
export function canonicalVaaBytes(): Uint8Array {
  const d = demoManifest.derivation;
  if (!d?.vaaHex) throw new Error("bundled run has no VAA derivation");
  return hexToBytes(d.vaaHex);
}

function canonicalBody(): VaaBody {
  const vaa = decodeVaa(canonicalVaaBytes());
  return {
    timestamp: vaa.timestamp,
    nonce: vaa.nonce,
    emitterChainId: vaa.emitterChainId,
    emitterAddress: vaa.emitterAddress,
    sequence: vaa.sequence,
    consistencyLevel: vaa.consistencyLevel,
    payload: vaa.payload,
  };
}

/** Build all scenarios. Async: dev-guardian signing is real secp256k1. */
export async function buildScenarios(): Promise<Scenario[]> {
  const canonical = canonicalVaaBytes();
  const canonicalHash = computeVaaHash(canonical);
  const body = canonicalBody();
  const none = new Set<string>();

  // 1 — flipped score byte: participant1Score int32 sits at payload offset
  // 40..43; body starts after the 6 + n*66 header, payload 51 bytes in.
  const numSigs = canonical[5];
  const payloadOffset = 6 + numSigs * 66 + 51;
  const tampered = canonical.slice();
  tampered[payloadOffset + 43] = 3; // Canada 2 → "3"
  // 2 — quorum of only 12 guardians
  const twelve = await signVaaWithDevGuardians(body, defaultQuorumIndices().slice(0, 12));
  // 3 — wrong emitter, properly guardian-signed (guardians attest transport,
  // not app identity — the emitter check on Base is what stops this)
  const wrongEmitter = await signVaaWithDevGuardians(
    { ...body, emitterAddress: keccak256(stringToBytes("proofline.tamper-lab.attacker-emitter")) },
    defaultQuorumIndices(),
  );

  return [
    {
      id: "happy",
      title: "Original VAA — Canada 2–1",
      summary: "The genuine dev-guardian-signed VAA from the bundled run.",
      mutation: "no mutation",
      vaaBytes: canonical,
      consumedVaaHashes: none,
      expectedError: "",
      happy: true,
    },
    {
      id: "tampered-score",
      title: "Tampered score 3–1",
      summary: "One payload byte flipped after signing: home score 2 → 3.",
      mutation: `payload byte @${payloadOffset + 43} (participant1Score) set to 0x03`,
      vaaBytes: tampered,
      consumedVaaHashes: none,
      expectedError: 'InvalidVaa("VM signature invalid")',
    },
    {
      id: "no-quorum",
      title: "Only 12 guardian signatures",
      summary: `Valid signatures, but one short of the ${GUARDIAN_QUORUM}-of-${GUARDIAN_SET_SIZE} quorum.`,
      mutation: "signature set truncated to 12 guardians",
      vaaBytes: encodeVaa(twelve),
      consumedVaaHashes: none,
      expectedError: 'InvalidVaa("no quorum")',
    },
    {
      id: "wrong-emitter",
      title: "Wrong source emitter",
      summary: "Fully valid 13-signature VAA — from an unregistered Solana emitter.",
      mutation: "emitterAddress replaced with an attacker-controlled 32-byte address",
      vaaBytes: encodeVaa(wrongEmitter),
      consumedVaaHashes: none,
      expectedError: "WrongEmitter(bytes32)",
    },
    {
      id: "replay",
      title: "Replayed valid VAA",
      summary: "The genuine VAA, submitted a second time after Base already consumed it.",
      mutation: "no mutation — resubmission of an already-consumed VAA",
      vaaBytes: canonical,
      consumedVaaHashes: new Set([canonicalHash]),
      expectedError: "VaaAlreadyConsumed(bytes32)",
    },
  ];
}

/**
 * Mirror of WormholeOutcomeReceiver._consumeVaa + MockWormholeCore
 * parseAndVerifyVM, check-for-check, same order, same error names.
 */
export async function verifyLikeBase(
  vaaBytes: Uint8Array,
  consumedVaaHashes: Set<string>,
): Promise<Verdict> {
  const checks: CheckResult[] = [];
  const guardians = devGuardianAddresses();
  const registeredEmitter = deployment.registeredEmitter.toLowerCase();
  const fail = (label: string, contractError: string, detail?: string): Verdict => {
    checks.push({ label, status: "fail", detail });
    const remaining = ALL_CHECKS.slice(ALL_CHECKS.indexOf(label) + 1);
    for (const r of remaining) checks.push({ label: r, status: "skipped" });
    return { checks, accepted: false, contractError };
  };

  // (1) parseAndVerifyVM — structure, quorum, ascending indices, ecrecover
  let vaa;
  try {
    vaa = decodeVaa(vaaBytes);
  } catch (e) {
    return fail(ALL_CHECKS[0], `InvalidVaa("${(e as Error).message}")`);
  }
  if (vaa.signatures.length < GUARDIAN_QUORUM)
    return fail(
      ALL_CHECKS[0],
      'InvalidVaa("no quorum")',
      `${vaa.signatures.length} signatures < quorum ${GUARDIAN_QUORUM}`,
    );
  const digest = vaaSigningDigest(vaa);
  let lastIndex = -1;
  for (const sig of vaa.signatures) {
    if (sig.guardianIndex <= lastIndex)
      return fail(ALL_CHECKS[0], 'InvalidVaa("signature indices out of order")');
    lastIndex = sig.guardianIndex;
    if (sig.guardianIndex >= GUARDIAN_SET_SIZE)
      return fail(ALL_CHECKS[0], 'InvalidVaa("guardian index out of bounds")');
    let signer: string;
    try {
      signer = await recoverAddress({
        hash: digest,
        signature: { r: sig.r, s: sig.s, v: BigInt(sig.v + 27) },
      });
    } catch {
      return fail(ALL_CHECKS[0], 'InvalidVaa("VM signature invalid")', "ecrecover failed");
    }
    if (signer.toLowerCase() !== guardians[sig.guardianIndex].toLowerCase())
      return fail(
        ALL_CHECKS[0],
        'InvalidVaa("VM signature invalid")',
        `guardian ${sig.guardianIndex}: recovered ${signer.slice(0, 10)}… ≠ ${guardians[sig.guardianIndex].slice(0, 10)}…`,
      );
  }
  checks.push({
    label: ALL_CHECKS[0],
    status: "pass",
    detail: `${vaa.signatures.length}/${GUARDIAN_SET_SIZE} valid signatures (quorum ${GUARDIAN_QUORUM})`,
  });

  // (3) source chain must be Solana
  if (vaa.emitterChainId !== WORMHOLE_CHAIN_SOLANA)
    return fail(ALL_CHECKS[1], `WrongEmitterChain(${vaa.emitterChainId})`);
  checks.push({ label: ALL_CHECKS[1], status: "pass", detail: "emitterChainId = 1 (Solana)" });

  // (4) the ONE registered emitter
  if (vaa.emitterAddress.toLowerCase() !== registeredEmitter)
    return fail(
      ALL_CHECKS[2],
      "WrongEmitter(bytes32)",
      `got ${vaa.emitterAddress.slice(0, 14)}…, registered ${registeredEmitter.slice(0, 14)}…`,
    );
  checks.push({ label: ALL_CHECKS[2], status: "pass", detail: "matches registered emitter" });

  // (5)(6)(9) payload codec — magic, version, type, result
  let outcome;
  try {
    outcome = decodeMatchOutcomeV1(vaa.payload);
  } catch (e) {
    const m = (e as Error).message;
    const solidity = m.includes("magic")
      ? "BadMagic(bytes4)"
      : m.includes("version")
        ? "UnsupportedVersion(uint8)"
        : m.includes("message type")
          ? "UnsupportedMessageType(uint8)"
          : m.includes("result")
            ? "InvalidResult(uint8)"
            : "BadPayloadLength(uint256)";
    return fail(ALL_CHECKS[3], solidity, m);
  }
  checks.push({
    label: ALL_CHECKS[3],
    status: "pass",
    detail: `PRFL v1 · fixture ${outcome.fixtureId} · ${outcome.participant1Score}–${outcome.participant2Score}`,
  });

  // (7) destination chain (Wormhole numbering: 10004 = Base Sepolia)
  if (outcome.destinationChain !== WORMHOLE_CHAIN_BASE_SEPOLIA)
    return fail(ALL_CHECKS[4], `WrongDestinationChain(${outcome.destinationChain})`);
  checks.push({ label: ALL_CHECKS[4], status: "pass", detail: "destination 10004 (Base Sepolia)" });

  // (8) replay protection — VAA digest + emitter sequence
  const hash = computeVaaHash(vaaBytes);
  if (consumedVaaHashes.has(hash))
    return fail(ALL_CHECKS[5], "VaaAlreadyConsumed(bytes32)", `vaaHash ${hash.slice(0, 14)}… already consumed`);
  checks.push({ label: ALL_CHECKS[5], status: "pass", detail: `vaaHash ${hash.slice(0, 14)}… unseen` });

  // (9)+(11) independent on-chain derivation of the attestation id
  const attId = deriveAttestationId({
    sourceEmitter: vaa.emitterAddress,
    fixtureId: outcome.fixtureId,
    scoreSequence: outcome.scoreSequence,
    validationInstructionHash: outcome.validationInstructionHash,
    proofBundleHash: outcome.proofBundleHash,
  });
  checks.push({ label: ALL_CHECKS[6], status: "pass", detail: attId });

  return { checks, accepted: true, attestationId: attId };
}

export const ALL_CHECKS = [
  "Wormhole Core parseAndVerifyVM — guardian signatures & quorum",
  "Source chain is Solana",
  "Emitter is the ONE registered Proofline emitter",
  "Payload decodes: PRFL magic, version, message type, result",
  "Destination chain is this chain (10004)",
  "Replay protection — VAA hash & emitter sequence unseen",
  "Store outcome + derive attestationId on-chain",
];

export { bytesToHex };
