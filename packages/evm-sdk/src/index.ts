/**
 * @proofline/evm-sdk — minimal viem clients for the five deployed Base
 * contracts (packages/config/deployments/base-sepolia.json).
 *
 * Boundary rules honored here:
 *  - NO private-key reading in this package — write helpers take a viem
 *    WalletClient the caller constructed (the caller controls key handling).
 *  - Addresses come from the caller (usually @proofline/config deployments);
 *    this package never reads deployment files itself.
 */
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

export * from "./registry";
export * from "./receivers";
export * from "./market";

/** Public (read) client for Base Sepolia (chain 84532). */
export function makeClients(rpcUrl: string) {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return { publicClient, chain: baseSepolia };
}
