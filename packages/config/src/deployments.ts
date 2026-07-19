/**
 * Deployments loader — reads packages/config/deployments/*.json when present.
 * Each file is one deployment environment, e.g. deployments/base-sepolia.json:
 *   {
 *     "chainId": 84532,
 *     "rpcUrlEnv": "BASE_RPC_URL",
 *     "contracts": {
 *       "creLevel3Receiver": "0x…",
 *       "wormholeOutcomeReceiver": "0x…",
 *       "finalityRegistry": "0x…",
 *       "demoPredictionMarket": "0x…"
 *     }
 *   }
 * No deployments directory (this build's default — nothing is deployed live
 * without an explicit go) simply yields an empty map.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DeploymentRecord {
  chainId?: number;
  /** Name of the env var holding the RPC URL — never the URL's secrets inline. */
  rpcUrlEnv?: string;
  contracts?: Record<string, string>;
  [key: string]: unknown;
}

const DEPLOYMENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "deployments");

/** All deployment records keyed by file basename (e.g. "base-sepolia"). */
export function loadDeployments(): Record<string, DeploymentRecord> {
  if (!existsSync(DEPLOYMENTS_DIR)) return {};
  const out: Record<string, DeploymentRecord> = {};
  for (const file of readdirSync(DEPLOYMENTS_DIR)) {
    if (!file.endsWith(".json")) continue;
    out[file.replace(/\.json$/, "")] = JSON.parse(
      readFileSync(join(DEPLOYMENTS_DIR, file), "utf8"),
    ) as DeploymentRecord;
  }
  return out;
}

export function findDeployment(name: string): DeploymentRecord | undefined {
  return loadDeployments()[name];
}

/** Resolve one contract address from a named deployment, if that deployment exists. */
export function deployedContract(deployment: string, contract: string): string | undefined {
  return findDeployment(deployment)?.contracts?.[contract];
}
