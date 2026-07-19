/**
 * Static, real, checkable evidence for the /story submission page.
 *
 * Every value here is copied verbatim from the repo's evidence bundles
 * (evidence/mainnet/full-deploy/d2-mainnet.json, evidence/runs/live-base-mainnet-1/,
 * README.md's honesty table) or from packages/config/deployments/*.json.
 * NOTHING here is invented. If a number can't be traced to one of those
 * files, it doesn't belong on this page.
 */

export const attestationFormula =
  "keccak256(domain ‖ emitter ‖ fixtureId ‖ scoreSequence ‖ validationInstructionHash ‖ proofBundleHash)";

// ---- Solana mainnet: deployed program + real on-chain verification ----
// Source: evidence/mainnet/full-deploy/d2-mainnet.json
export const solanaOnChain = {
  programId: "PRF5wS3RSArKNCC2pYtDvBciM9KxtDw6tqAUzimKqbN",
  verifyOutcomeTx: "39WXYxtkwURZ4vhL6ZiCtNJiqGrnjQFi78SohuwPqLS8RK9sD39vieCeHuQ94pSjjwBAXt4g91MQkwVNxDo6eh1K",
  verifiedSlot: 433929535,
  computeUnitsConsumed: 264323,
  soBytes: 339128,
  verifiedOutcomePda: "7Lx6G4d7stCQxHQZ796STyTRCpZ4Yfq9852K23FatamV",
  fixtureId: "18175918",
  participant1Score: 3,
  participant2Score: 2,
  resultCode: 1,
  resultLabel: "H",
  explorer: {
    program: "https://explorer.solana.com/address/PRF5wS3RSArKNCC2pYtDvBciM9KxtDw6tqAUzimKqbN",
    verifyOutcome:
      "https://explorer.solana.com/tx/39WXYxtkwURZ4vhL6ZiCtNJiqGrnjQFi78SohuwPqLS8RK9sD39vieCeHuQ94pSjjwBAXt4g91MQkwVNxDo6eh1K",
    verifiedOutcome: "https://explorer.solana.com/address/7Lx6G4d7stCQxHQZ796STyTRCpZ4Yfq9852K23FatamV",
  },
};

// ---- Solana mainnet: Memo attestation (client-verified + memo-anchored) ----
// Source: README.md honesty table + evidence/mainnet/rehearsal-18175918/memo-broadcast.json
// CLAIM WORDING IS FIXED — do not paraphrase.
export const solanaMemoAttestation = {
  signature:
    "5PTAqE8dveY8opG8PAE7iFbkj9BrQJt4yDKEjXqFkDixeu5TGAHm45cXx1vXPGAWkobdNaQpL7JkJ1bUqwjWcp7E",
  explorer:
    "https://explorer.solana.com/tx/5PTAqE8dveY8opG8PAE7iFbkj9BrQJt4yDKEjXqFkDixeu5TGAHm45cXx1vXPGAWkobdNaQpL7JkJ1bUqwjWcp7E",
  claimWording:
    "real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet",
};

// ---- Base MAINNET: full dual-finality exercised ----
// Source: evidence/runs/live-base-mainnet-1/base-mainnet-receipts.json
export const baseMainnet = {
  chainId: 8453,
  explorerBaseUrl: "https://basescan.org",
  l3ReportTx: "0x85cbc2740836b13c8a372377c786c34a4d14cbd2bbe5ff978442af726d098581",
  vaaImportTx: "0xbe0944a86a9c74b5ec1919a7813a344a0257aca9d18cf33e6326a63065c6284e",
  settleTx: "0x5b9c16cd139e9ea6250b44525bfe681f2f42d201c6e432899e26d2a81ed8f03d",
  attestationId: "0x062f6f5c62639f0267c364f320c828e2967022fcde4e1df4f3f1f8ce53061d6d",
  registryStatusAfter: "DualFinalized (3)",
  demoPredictionMarket: "0x421aAeDA48899FA16Fb32B189532f47a3190ACd4",
};

// ---- Base Sepolia: original trio ----
// Source: README.md honesty table / deployed contracts table
export const baseSepolia = {
  chainId: 84532,
  explorerBaseUrl: "https://sepolia.basescan.org",
  l3ReportTx: "0x64a90fab39f431750cc973468715ac8227f3790a93cc53b96c1b3a491e6cab69",
  vaaImportTx: "0x5fee92ce5329b1cf83a21af59831ed14c47c24e8910cada094939c2baaa7d7e4",
  settleTx: "0x4fca3d34ab7f0b0e50290deedb2d529ad301ccdd694aac519538bf7c4bc3fc93",
  contracts: {
    finalityRegistry: "0xac0b2f8250f16e076e2cfcf5e79243be0198c64f",
    creLevel3Receiver: "0xa2166ea27f2ce4029e3426f2d3c84fd7151cb05f",
    wormholeOutcomeReceiver: "0x58512d54b8fc32bc6f03800416c93ab08a336f60",
  },
};

// ---- Honesty taxonomy — mirrors README's "Real vs simulated" table ----
export type LegRow = { leg: string; status: "real" | "simulated"; detail: string; level?: string };

export const honestyTaxonomy: LegRow[] = [
  {
    leg: "Solana mainnet adapter program",
    status: "real",
    level: "L4 on-chain",
    detail:
      "DEPLOYED + on-chain verification proven: CPI into deployed TxLINE, Merkle proof verified against the real mainnet daily root, exact one-byte true return.",
  },
  {
    leg: "Solana mainnet Memo attestation",
    status: "real",
    level: "client-verified + anchored",
    detail: "Compact digest-bound attestation, second-RPC byte-exact readback — labeled distinctly from the on-chain path above.",
  },
  {
    leg: "Base mainnet contracts (all 5)",
    status: "real",
    level: "L3 + L4",
    detail: "Deployed + exercised: L3 report → VAA import → on-chain DualFinalized → settle().",
  },
  {
    leg: "Base Sepolia contracts (all 5)",
    status: "real",
    level: "L3 + L4",
    detail: "Deployed + exercised live, full receipts below.",
  },
  {
    leg: "All hashing / payload / attestation-id math",
    status: "real",
    detail: "Conformance vector reproduced byte-for-byte at runtime; verify-evidence re-checks independently.",
  },
  {
    leg: "Guardian signatures",
    status: "real",
    detail:
      "Real secp256k1 signatures over the real Wormhole double-keccak digest — from a dev guardian set (19 keys derived from public strings, labeled everywhere).",
  },
  {
    leg: "Live TxLINE ingestion",
    status: "real",
    detail: "Free-tier API (guest JWT + X-Api-Token), verified against World Cup Final fixture 18257739 — same code path as the recorded fixture.",
  },
  {
    leg: "Solana adapter leg (TxOracle CPI, ProofBuffer)",
    status: "simulated",
    detail:
      "File-backed ProofBuffer mock, sim:-prefixed signatures that can never pass as real. The Anchor program is real code that builds + passes its conformance tests, not deployed in this build.",
  },
  {
    leg: "Level 3 RPC providers",
    status: "simulated",
    detail: "Deterministic recorded responders (per-provider differing slots/units prove the stable-outputs-only comparison).",
  },
  {
    leg: "CRE DON",
    status: "simulated",
    detail: "Workflows written to the CRE programming model, executed by a local simulation runner standing in for a deployed DON.",
  },
];

export const links = {
  repo: "https://github.com/0xPulsePlay/proofline",
  liveApp: "https://proofline-app.vercel.app",
  mainnetEvidence: "/mainnet",
  controlRoom: "/control-room",
  video: "https://shared.claude.do/public/proofline-demo-player",
};

export const shortHex = (h: string, head = 10, tail = 6) =>
  h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h;
