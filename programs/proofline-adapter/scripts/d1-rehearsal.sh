#!/usr/bin/env bash
set -euo pipefail

ADAPTER_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$ADAPTER_ROOT/../.." && pwd)
ADAPTER_ID=PRF5wS3RSArKNCC2pYtDvBciM9KxtDw6tqAUzimKqbN
TXLINE_ID=9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
TXLINE_PROGRAM_DATA=8DCh33bPSZrJojZTLoZ7Briaw21tY2m15xNpTxudjxgS
DAILY_ROOT=CdrFdcGqLpGxq3qDxcj4aNQT8jsUU2vBHd3JEEAQ55jd
MAINNET_RPC=${D1_MAINNET_RPC:-https://api.mainnet-beta.solana.com}

# No port-registry file in this repository; fall back to
# an overridable 38xxx range and fail loudly on collisions.
RPC_PORT=${D1_RPC_PORT:-38990}
WEBSOCKET_PORT=$((RPC_PORT + 1))
FAUCET_PORT=${D1_FAUCET_PORT:-39021}
GOSSIP_PORT=${D1_GOSSIP_PORT:-38992}
DYNAMIC_PORT_RANGE=${D1_DYNAMIC_PORT_RANGE:-38993-39020}
RPC_URL=http://127.0.0.1:${RPC_PORT}

TRANSCRIPT=${D1_TRANSCRIPT:-$ADAPTER_ROOT/target/d1-rehearsal-transcript.log}
VALIDATOR_LOG=${D1_VALIDATOR_LOG:-$ADAPTER_ROOT/target/d1-validator.log}
mkdir -p "$ADAPTER_ROOT/target"
exec > >(tee "$TRANSCRIPT") 2>&1

TEMP_ROOT=$(mktemp -d /tmp/proofline-d1.XXXXXX)
VALIDATOR_PID=
cleanup() {
  if [[ -n "$VALIDATOR_PID" ]] && kill -0 "$VALIDATOR_PID" 2>/dev/null; then
    kill "$VALIDATOR_PID"
    wait "$VALIDATOR_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

for port in "$RPC_PORT" "$WEBSOCKET_PORT" "$FAUCET_PORT" "$GOSSIP_PORT"; do
  if ss -ltnH "sport = :$port" | grep -q . || ss -lunH "sport = :$port" | grep -q .; then
    echo "D1 ERROR port $port is already in use"
    exit 1
  fi
done

echo "D1 phase=build wormhole_feature=off"
(cd "$ADAPTER_ROOT" && ~/.cargo/bin/anchor build)
SO_PATH=$ADAPTER_ROOT/target/deploy/proofline_adapter.so
SO_SIZE=$(stat -c %s "$SO_PATH")
MAX_SIZE=$((470 * 1024))
echo "D1 so_path=$SO_PATH so_size_bytes=$SO_SIZE gate_bytes=$MAX_SIZE"
if (( SO_SIZE > MAX_SIZE )); then
  echo "D1 ERROR binary exceeds 470 KiB"
  exit 1
fi

PAYER_KEYPAIR=$TEMP_ROOT/payer.json
AUTHORITY_KEYPAIR=$TEMP_ROOT/upgrade-authority.json
solana-keygen new --no-bip39-passphrase --silent --force --outfile "$PAYER_KEYPAIR"
solana-keygen new --no-bip39-passphrase --silent --force --outfile "$AUTHORITY_KEYPAIR"
PAYER_PUBKEY=$(solana-keygen pubkey "$PAYER_KEYPAIR")
AUTHORITY_PUBKEY=$(solana-keygen pubkey "$AUTHORITY_KEYPAIR")
echo "D1 throwaway_payer=$PAYER_PUBKEY throwaway_upgrade_authority=$AUTHORITY_PUBKEY"

echo "D1 validator=starting rpc=$RPC_URL clone_txline=$TXLINE_ID clone_program_data=$TXLINE_PROGRAM_DATA clone_daily_root=$DAILY_ROOT"
solana-test-validator \
  --ledger "$TEMP_ROOT/ledger" \
  --url "$MAINNET_RPC" \
  --clone "$TXLINE_ID" \
  --clone "$TXLINE_PROGRAM_DATA" \
  --clone "$DAILY_ROOT" \
  --upgradeable-program "$ADAPTER_ID" "$SO_PATH" "$AUTHORITY_PUBKEY" \
  --rpc-port "$RPC_PORT" \
  --faucet-port "$FAUCET_PORT" \
  --gossip-port "$GOSSIP_PORT" \
  --dynamic-port-range "$DYNAMIC_PORT_RANGE" \
  --reset >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

for _ in $(seq 1 90); do
  if solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$VALIDATOR_PID" 2>/dev/null; then
    echo "D1 ERROR validator exited during clone/startup"
    tail -80 "$VALIDATOR_LOG"
    if [[ -f "$TEMP_ROOT/ledger/validator.log" ]]; then
      tail -120 "$TEMP_ROOT/ledger/validator.log"
    fi
    exit 1
  fi
  sleep 1
done
solana cluster-version --url "$RPC_URL"
echo "D1 validator=healthy"

solana airdrop 100 "$PAYER_PUBKEY" --url "$RPC_URL" >/dev/null
echo "D1 payer_balance=$(solana balance "$PAYER_PUBKEY" --url "$RPC_URL")"

# The persistent PRF5 program keypair is intentionally untouched. Genesis
# preloading establishes that address, then this performs a real local
# upgrade/deploy transaction signed only by throwaway local keys.
DEPLOY_JSON=$(
  solana program deploy "$SO_PATH" \
    --program-id "$ADAPTER_ID" \
    --upgrade-authority "$AUTHORITY_KEYPAIR" \
    --keypair "$PAYER_KEYPAIR" \
    --fee-payer "$PAYER_KEYPAIR" \
    --url "$RPC_URL" \
    --use-rpc \
    --max-len "$SO_SIZE" \
    --output json-compact
)
echo "D1 local_deploy=$DEPLOY_JSON"

rent_lamports() {
  solana rent "$1" --lamports --url "$RPC_URL" --output json-compact \
    | jq -r .rentExemptMinimumLamports
}
PROGRAM_ACCOUNT_RENT=$(rent_lamports 36)
PROGRAM_DATA_RENT=$(rent_lamports $((SO_SIZE + 45)))
BUFFER_RENT=$(rent_lamports $((SO_SIZE + 37)))
CONFIG_RENT=$(rent_lamports 140)
OUTCOME_RENT=$(rent_lamports 250)
FINAL_RENT=$((PROGRAM_ACCOUNT_RENT + PROGRAM_DATA_RENT + CONFIG_RENT + OUTCOME_RENT))
PEAK_RENT=$((FINAL_RENT + BUFFER_RENT))
echo "D1 rent_lamports program=$PROGRAM_ACCOUNT_RENT program_data=$PROGRAM_DATA_RENT config=$CONFIG_RENT verified_outcome=$OUTCOME_RENT final_total=$FINAL_RENT temporary_buffer=$BUFFER_RENT peak_total=$PEAK_RENT"

echo "D1 client=initialize_config+verify_outcome+readback"
D1_RPC_URL=$RPC_URL D1_PAYER_KEYPAIR=$PAYER_KEYPAIR \
  pnpm --dir "$REPO_ROOT/apps/mainnet-attestor" exec tsx "$ADAPTER_ROOT/scripts/d1-client.ts"
