/**
 * CRELevel3Receiver + WormholeOutcomeReceiver clients — minimal hand-written
 * ABIs for exactly the entrypoints the workflows and relay CLI use
 * (contracts/base/src/CRELevel3Receiver.sol, WormholeOutcomeReceiver.sol).
 *
 * Key handling stays with the caller: write helpers take a viem WalletClient
 * that already carries its account. This package never reads a private key.
 */
import { encodeFunctionData } from "viem";
import { readContract, writeContract } from "viem/actions";
import type { Account, Address, Chain, Client, Transport } from "viem";
import type { ReadClient } from "./registry";

/** Wallet client with chain + account bound — what the write helpers require. */
export type BoundWalletClient = Client<Transport, Chain, Account>;

export const creLevel3ReceiverAbi = [
  {
    type: "function",
    name: "onReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestation",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "attestationId", type: "bytes32" },
          { name: "fixtureId", type: "int64" },
          { name: "participant1Score", type: "int32" },
          { name: "participant2Score", type: "int32" },
          { name: "proofBundleHash", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "receivedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "consumedAttestations",
    stateMutability: "view",
    inputs: [{ name: "attestationId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "forwarder",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Level3AttestationReceived",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "result", type: "uint8", indexed: false },
    ],
  },
  { type: "error", name: "NotForwarder", inputs: [] },
  { type: "error", name: "AlreadyConsumed", inputs: [{ name: "attestationId", type: "bytes32" }] },
] as const;

export const wormholeOutcomeReceiverAbi = [
  {
    type: "function",
    name: "submitVaa",
    stateMutability: "nonpayable",
    inputs: [{ name: "encodedVaa", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "onReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestation",
    stateMutability: "view",
    inputs: [{ name: "fixtureId", type: "int64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "attestationId", type: "bytes32" },
          { name: "fixtureId", type: "int64" },
          { name: "participant1Score", type: "int32" },
          { name: "participant2Score", type: "int32" },
          { name: "proofBundleHash", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "wormholeSequence", type: "uint64" },
          { name: "vaaHash", type: "bytes32" },
          { name: "receivedAt", type: "uint64" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "consumedVaaHashes",
    stateMutability: "view",
    inputs: [{ name: "vaaHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "consumedSequences",
    stateMutability: "view",
    inputs: [{ name: "sequence", type: "uint64" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "OutcomeImported",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "attestationId", type: "bytes32", indexed: true },
      { name: "wormholeSequence", type: "uint64", indexed: false },
      { name: "vaaHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ConflictingVaaRejected",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "storedAttestationId", type: "bytes32", indexed: false },
      { name: "incomingAttestationId", type: "bytes32", indexed: false },
    ],
  },
  { type: "error", name: "NotForwarder", inputs: [] },
  { type: "error", name: "InvalidVaa", inputs: [{ name: "reason", type: "string" }] },
  { type: "error", name: "WrongEmitterChain", inputs: [{ name: "got", type: "uint16" }] },
  { type: "error", name: "WrongEmitter", inputs: [{ name: "got", type: "bytes32" }] },
  { type: "error", name: "WrongDestinationChain", inputs: [{ name: "got", type: "uint16" }] },
  { type: "error", name: "VaaAlreadyConsumed", inputs: [{ name: "vaaHash", type: "bytes32" }] },
  { type: "error", name: "SequenceAlreadyConsumed", inputs: [{ name: "sequence", type: "uint64" }] },
  { type: "error", name: "DuplicateOutcome", inputs: [{ name: "fixtureId", type: "int64" }] },
] as const;

/** Calldata for CRELevel3Receiver.onReport (metadata intentionally empty). */
export function encodeLevel3OnReportCalldata(reportHex: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: creLevel3ReceiverAbi,
    functionName: "onReport",
    args: ["0x", reportHex],
  });
}

/** Calldata for WormholeOutcomeReceiver.submitVaa (permissionless path). */
export function encodeSubmitVaaCalldata(vaaHex: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: wormholeOutcomeReceiverAbi,
    functionName: "submitVaa",
    args: [vaaHex],
  });
}

/** Calldata for WormholeOutcomeReceiver.onReport — report bytes are the exact VAA bytes. */
export function encodeLevel4OnReportCalldata(vaaHex: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: wormholeOutcomeReceiverAbi,
    functionName: "onReport",
    args: ["0x", vaaHex],
  });
}

/** Live mode: deliver a Level 3 report via the forwarder wallet. Returns the tx hash. */
export async function sendLevel3Report(
  wallet: BoundWalletClient,
  receiver: Address,
  reportHex: `0x${string}`,
): Promise<`0x${string}`> {
  return writeContract(wallet, {
    address: receiver,
    abi: creLevel3ReceiverAbi,
    functionName: "onReport",
    args: ["0x", reportHex],
    chain: wallet.chain,
    account: wallet.account,
  });
}

/** Live mode: permissionless VAA delivery. Returns the tx hash. */
export async function sendSubmitVaa(
  wallet: BoundWalletClient,
  receiver: Address,
  vaaHex: `0x${string}`,
): Promise<`0x${string}`> {
  return writeContract(wallet, {
    address: receiver,
    abi: wormholeOutcomeReceiverAbi,
    functionName: "submitVaa",
    args: [vaaHex],
    chain: wallet.chain,
    account: wallet.account,
  });
}

export async function readConsumedAttestation(
  client: ReadClient,
  receiver: Address,
  attestationId: `0x${string}`,
): Promise<boolean> {
  return readContract(client, {
    address: receiver,
    abi: creLevel3ReceiverAbi,
    functionName: "consumedAttestations",
    args: [attestationId],
  });
}

export async function readConsumedVaaHash(
  client: ReadClient,
  receiver: Address,
  vaaHash: `0x${string}`,
): Promise<boolean> {
  return readContract(client, {
    address: receiver,
    abi: wormholeOutcomeReceiverAbi,
    functionName: "consumedVaaHashes",
    args: [vaaHash],
  });
}
