/**
 * evidence/runs/<run-id>/manifest.json — the recorded array replay mode
 * consumes. Live mode produced these exact events; replay renders them with
 * their real timestamps.
 */
import type { RunEvent } from "./events";

export interface RunFixture {
  fixtureId: string;
  participant1: string;
  participant2: string;
  participant1Score: number;
  participant2Score: number;
  period: number;
  kickoffIso?: string;
  competition?: string;
  /** true = deterministic packaged fixture, not a live TxLINE feed read */
  synthetic: boolean;
}

export interface RunContracts {
  chainId: number;
  explorerBaseUrl: string;
  finalityRegistry: string;
  creLevel3Receiver: string;
  wormholeOutcomeReceiver: string;
  demoPredictionMarket: string;
  wormholeCore: string;
  /** honest labeling: which core is in play */
  wormholeCoreKind: "mainnet" | "testnet" | "dev-guardian-set-mock";
}

/**
 * Real protocol-math derivations for the run — every value here is produced
 * by the same code paths the pipeline uses (payload codec, keccak hashing,
 * dev-guardian secp256k1 signing, attestation-id derivation). The UI renders
 * these as REAL hex; simulation badges apply to network legs, not to these.
 */
export interface RunDerivation {
  /** 176-byte MatchOutcomeV1, hex */
  payloadHex: string;
  proofBundleHash: string;
  validationInstructionHash: string;
  attestationId: string;
  domainSeparator: string;
  /** 32-byte Solana emitter, hex (matches registeredEmitter on Base) */
  sourceEmitter: string;
  txlineProgramId: string;
  dailyRootAccount: string;
  /** full encoded VAA, hex */
  vaaHex?: string;
  /** keccak256 of the encoded VAA — Base replay-protection key */
  vaaHash?: string;
  /** guardian indices whose signatures are in the VAA */
  guardianIndices?: number[];
}

export interface RunManifest {
  runId: string;
  createdAtIso: string;
  description: string;
  fixture: RunFixture;
  contracts: RunContracts;
  attestationId: string;
  /** legs that are simulated in this run (UI badges) */
  simulatedLegs: string[];
  /** real cryptographic derivations for the proof-path visualization */
  derivation?: RunDerivation;
  events: RunEvent[];
  artifacts: Record<string, string>; // filename -> description
}

export function validateManifest(m: RunManifest): string[] {
  const errs: string[] = [];
  if (!m.runId) errs.push("runId missing");
  if (!Array.isArray(m.events) || m.events.length === 0) errs.push("events empty");
  let lastSeq = -1;
  let lastAt = -Infinity;
  for (const e of m.events) {
    if (e.seq <= lastSeq) errs.push(`seq not strictly increasing at ${e.seq}`);
    if (e.at < lastAt) errs.push(`timestamps not monotonic at seq ${e.seq}`);
    lastSeq = e.seq;
    lastAt = e.at;
  }
  return errs;
}
