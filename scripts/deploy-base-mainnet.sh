#!/usr/bin/env bash
# Deploy the Proofline Base-side stack to Base Sepolia and write
# packages/config/deployments/base-mainnet.json.
#
# Key handling: DEPLOYER_PRIVATE_KEY comes from the environment (optionally
# via a git-ignored .env next to the repo root) and is passed to forge ONLY
# via the environment (vm.envUint) — never on argv, never echoed, never
# written into the repo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORGE="${FORGE:-$HOME/.foundry/bin/forge}"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi
if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "DEPLOYER_PRIVATE_KEY not set (export it or put it in $ENV_FILE)" >&2
  exit 1
fi
export DEPLOYER_PRIVATE_KEY

cd "$REPO_ROOT/contracts/base"

"$FORGE" script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --slow

# Compose the deployments JSON from the broadcast artifact.
BROADCAST="$REPO_ROOT/contracts/base/broadcast/Deploy.s.sol/8453/run-latest.json"
OUT_DIR="$REPO_ROOT/packages/config/deployments"
mkdir -p "$OUT_DIR"

node - "$BROADCAST" "$OUT_DIR/base-mainnet.json" "$REPO_ROOT" <<'EOF'
const fs = require("fs");
const [broadcastPath, outPath, repoRoot] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(broadcastPath, "utf8"));

const byName = {};
for (const tx of run.transactions) {
  if (tx.transactionType === "CREATE" && tx.contractName) {
    byName[tx.contractName] = { address: tx.contractAddress, hash: tx.hash };
  }
}
const need = [
  "MockWormholeCore",
  "FinalityRegistry",
  "CRELevel3Receiver",
  "WormholeOutcomeReceiver",
  "DemoPredictionMarket",
];
for (const n of need) {
  if (!byName[n]) throw new Error(`missing CREATE for ${n} in broadcast`);
}

const receipts = run.receipts || [];
const blocks = receipts.map((r) => parseInt(r.blockNumber, 16)).filter(Number.isFinite);
const deployedAtBlock = blocks.length ? Math.min(...blocks) : null;

// Registered emitter comes from the conformance vector (single source of truth).
const vector = JSON.parse(
  fs.readFileSync(
    require("path").join(repoRoot, "packages", "test-vectors", "match-outcome-v1.json"),
    "utf8"
  )
);

// Deterministic dev guardian addresses are logged by the deploy script, but the
// authoritative list lives on-chain; we reproduce it from the MockWormholeCore
// constructor input recorded in the broadcast (first CREATE's arguments).
const coreTx = run.transactions.find((t) => t.contractName === "MockWormholeCore");
const guardianSet = (coreTx.arguments?.[0] || "")
  .replace(/[\[\]\s"]/g, "")
  .split(",")
  .filter(Boolean);
if (guardianSet.length !== 19) throw new Error(`expected 19 guardians, got ${guardianSet.length}`);

// forwarder/owner = deployer EOA (sender of the CREATE transactions).
const forwarder = coreTx.transaction?.from;

const out = {
  chainId: 8453,
  explorerBaseUrl: "https://basescan.org",
  deployedAtBlock,
  contracts: {
    wormholeCore: byName.MockWormholeCore.address,
    finalityRegistry: byName.FinalityRegistry.address,
    creLevel3Receiver: byName.CRELevel3Receiver.address,
    wormholeOutcomeReceiver: byName.WormholeOutcomeReceiver.address,
    demoPredictionMarket: byName.DemoPredictionMarket.address,
  },
  guardianSet,
  quorum: 13,
  registeredEmitter: vector.sourceEmitter,
  forwarder,
  deployTxHashes: {
    wormholeCore: byName.MockWormholeCore.hash,
    finalityRegistry: byName.FinalityRegistry.hash,
    creLevel3Receiver: byName.CRELevel3Receiver.hash,
    wormholeOutcomeReceiver: byName.WormholeOutcomeReceiver.hash,
    demoPredictionMarket: byName.DemoPredictionMarket.hash,
  },
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${outPath}`);
EOF

echo "Deployment complete."
