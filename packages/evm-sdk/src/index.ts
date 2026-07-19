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
import { base, baseSepolia } from "viem/chains";

export * from "./registry";
export * from "./receivers";
export * from "./market";

/**
 * Public (read) client for a Base chain. Defaults to Base Sepolia (84532);
 * pass chainId 8453 for Base mainnet. Any other id is refused — these are
 * the only two chains this stack deploys to.
 */
export function makeClients(rpcUrl: string, chainId: number = baseSepolia.id) {
  const chain = chainId === base.id ? base : chainId === baseSepolia.id ? baseSepolia : undefined;
  if (!chain) throw new Error(`unsupported chainId ${chainId} (expected 8453 or 84532)`);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  return { publicClient, chain };
}
