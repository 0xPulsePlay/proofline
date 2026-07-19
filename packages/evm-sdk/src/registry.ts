/**
 * FinalityRegistry client — minimal hand-written ABI covering exactly what the
 * workflows and relay CLI need (contracts/base/src/FinalityRegistry.sol).
 * No private keys are ever read in this package; write helpers take a caller-
 * provided viem WalletClient so the caller controls key handling.
 */
import { readContract } from "viem/actions";
import type { Address, Chain, Client, Transport } from "viem";

/** Any viem client capable of reads (public client from makeClients, etc.). */
export type ReadClient = Client<Transport, Chain | undefined>;

/** enum FinalityStatus — index order matches the Solidity enum. */
export const FINALITY_STATUS = [
  "Unknown",
  "CREAttested",
  "WormholeVerified",
  "DualFinalized",
  "Conflict",
] as const;
export type FinalityStatusName = (typeof FINALITY_STATUS)[number];

export const finalityRegistryAbi = [
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "level3Attestation",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "attestationId", type: "bytes32" },
          { name: "participant1Score", type: "int32" },
          { name: "participant2Score", type: "int32" },
          { name: "result", type: "uint8" },
          { name: "receivedAt", type: "uint64" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "level4Attestation",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "attestationId", type: "bytes32" },
          { name: "participant1Score", type: "int32" },
          { name: "participant2Score", type: "int32" },
          { name: "result", type: "uint8" },
          { name: "receivedAt", type: "uint64" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "finalOutcome",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [
      { name: "finalized", type: "bool" },
      { name: "result", type: "uint8" },
      { name: "p1", type: "int32" },
      { name: "p2", type: "int32" },
    ],
  },
  {
    type: "function",
    name: "finalResults",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "uint256" }],
    outputs: [
      { name: "participant1Score", type: "uint16" },
      { name: "participant2Score", type: "uint16" },
      { name: "verified", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "Level3Reported",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "result", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Level4Reported",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "result", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StatusChanged",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "status", type: "uint8", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DualFinalized",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "attestationId", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ConflictDetected",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "existingAttestationId", type: "bytes32", indexed: false },
      { name: "incomingAttestationId", type: "bytes32", indexed: false },
    ],
  },
  { type: "error", name: "NotReporter", inputs: [] },
  { type: "error", name: "FixtureFrozen", inputs: [{ name: "fixtureId", type: "int64" }] },
  { type: "error", name: "FixtureFinalized", inputs: [{ name: "fixtureId", type: "int64" }] },
  { type: "error", name: "DuplicateReport", inputs: [{ name: "fixtureId", type: "int64" }] },
] as const;

export interface RegistryAttestationRecord {
  attestationId: `0x${string}`;
  participant1Score: number;
  participant2Score: number;
  result: number;
  receivedAt: bigint;
  exists: boolean;
}

export async function readFinalityStatus(
  client: ReadClient,
  registry: Address,
  fixtureId: bigint,
): Promise<{ code: number; name: FinalityStatusName }> {
  const code = await readContract(client, {
    address: registry,
    abi: finalityRegistryAbi,
    functionName: "status",
    args: [fixtureId],
  });
  return { code, name: FINALITY_STATUS[code] ?? "Unknown" };
}

export async function readLevel3Attestation(
  client: ReadClient,
  registry: Address,
  fixtureId: bigint,
): Promise<RegistryAttestationRecord> {
  return readContract(client, {
    address: registry,
    abi: finalityRegistryAbi,
    functionName: "level3Attestation",
    args: [fixtureId],
  });
}

export async function readLevel4Attestation(
  client: ReadClient,
  registry: Address,
  fixtureId: bigint,
): Promise<RegistryAttestationRecord> {
  return readContract(client, {
    address: registry,
    abi: finalityRegistryAbi,
    functionName: "level4Attestation",
    args: [fixtureId],
  });
}

export async function readFinalOutcome(
  client: ReadClient,
  registry: Address,
  fixtureId: bigint,
): Promise<{ finalized: boolean; result: number; p1: number; p2: number }> {
  const [finalized, result, p1, p2] = await readContract(client, {
    address: registry,
    abi: finalityRegistryAbi,
    functionName: "finalOutcome",
    args: [fixtureId],
  });
  return { finalized, result, p1, p2 };
}
