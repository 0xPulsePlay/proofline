/**
 * DemoPredictionMarket client — settlement is PERMISSIONLESS by design
 * (contracts/base/src/DemoPredictionMarket.sol): anyone may call settle()
 * once the FinalityRegistry shows DualFinalized.
 */
import { readContract, writeContract } from "viem/actions";
import type { Address } from "viem";
import type { ReadClient } from "./registry";
import type { BoundWalletClient } from "./receivers";

export const demoPredictionMarketAbi = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "settled",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "winningOutcome",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "provisionalWinner",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "available", type: "bool" },
      { name: "result", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "outcome", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPositions",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "fixtureId", type: "int64", indexed: true },
      { name: "winningOutcome", type: "uint8", indexed: true },
      { name: "source", type: "string", indexed: false },
    ],
  },
  { type: "error", name: "NotDualFinalized", inputs: [] },
  { type: "error", name: "AlreadySettled", inputs: [] },
] as const;

export interface MarketState {
  settled: boolean;
  winningOutcome: number;
  provisional: { available: boolean; result: number };
  positions: { home: bigint; draw: bigint; away: bigint };
  totalPositions: bigint;
}

export async function readMarketState(
  client: ReadClient,
  market: Address,
): Promise<MarketState> {
  const abi = demoPredictionMarketAbi;
  const [settled, winningOutcome, totalPositions, provisional, home, draw, away] =
    await Promise.all([
      readContract(client, { address: market, abi, functionName: "settled" }),
      readContract(client, { address: market, abi, functionName: "winningOutcome" }),
      readContract(client, { address: market, abi, functionName: "totalPositions" }),
      readContract(client, { address: market, abi, functionName: "provisionalWinner" }),
      readContract(client, { address: market, abi, functionName: "positions", args: [1] }),
      readContract(client, { address: market, abi, functionName: "positions", args: [2] }),
      readContract(client, { address: market, abi, functionName: "positions", args: [3] }),
    ]);
  return {
    settled,
    winningOutcome,
    totalPositions,
    provisional: { available: provisional[0], result: provisional[1] },
    positions: { home, draw, away },
  };
}

/** Live mode: permissionless settle() call. Returns the tx hash. */
export async function sendSettle(
  wallet: BoundWalletClient,
  market: Address,
): Promise<`0x${string}`> {
  return writeContract(wallet, {
    address: market,
    abi: demoPredictionMarketAbi,
    functionName: "settle",
    args: [],
    chain: wallet.chain,
    account: wallet.account,
  });
}
