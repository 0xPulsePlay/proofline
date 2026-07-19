#!/usr/bin/env bash
set -euo pipefail

ADAPTER_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$ADAPTER_ROOT/../.." && pwd)
ADAPTER_ID=PRF5wS3RSArKNCC2pYtDvBciM9KxtDw6tqAUzimKqbN
PRIMARY_RPC=${D2_PRIMARY_RPC_OVERRIDE:-https://api.mainnet-beta.solana.com}
SECONDARY_RPC=${D2_SECONDARY_RPC_OVERRIDE:-https://solana-rpc.publicnode.com}
EXPECTED_GENESIS=5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
EXPECTED_SO_SIZE=339128
PROGRAM_DATA_LENGTH=339173
MINIMUM_BALANCE_LAMPORTS=3200000000
FEE_ALLOWANCE_LAMPORTS=10000000
MEMO_RESERVE_LAMPORTS=50000000
PRIORITY_FEE_MICROLAMPORTS=10000
SO_PATH=$ADAPTER_ROOT/target/deploy/proofline_adapter.so
D2_PROGRAM_KEYPAIR=${D2_PROGRAM_KEYPAIR:-$ADAPTER_ROOT/target/deploy/proofline_adapter-keypair.json}
TRANSCRIPT=${D2_TRANSCRIPT:-$ADAPTER_ROOT/target/d2-mainnet-transcript.log}
EVIDENCE=$REPO_ROOT/evidence/mainnet/full-deploy/d2-mainnet.json

if [[ -z "${PROOFLINE_SIGNER_KEYPAIR:-}" ]]; then
  echo "D2 ERROR PROOFLINE_SIGNER_KEYPAIR is not exported"
  exit 1
fi

# Never allow either authorized keypair path to enter terminal output or the
# retained transcript, including through third-party CLI error messages.
export D2_PROGRAM_KEYPAIR
mkdir -p "$ADAPTER_ROOT/target"
exec > >(
  perl -pe '
    BEGIN {
      $| = 1;
      $signer = $ENV{"PROOFLINE_SIGNER_KEYPAIR"} // "";
      $program = $ENV{"D2_PROGRAM_KEYPAIR"} // "";
    }
    s/\Q$signer\E/<redacted-signer-keypair>/g if length($signer);
    s/\Q$program\E/<redacted-program-keypair>/g if length($program);
  ' | tee "$TRANSCRIPT"
) 2>&1

TEMP_ROOT=$(mktemp -d /tmp/proofline-d2.XXXXXX)
cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

abort() {
  echo "D2 ABORT $*"
  exit 1
}

[[ -f "$PROOFLINE_SIGNER_KEYPAIR" ]] || abort "signer keypair path is not a file"
[[ -r "$PROOFLINE_SIGNER_KEYPAIR" ]] || abort "signer keypair is not readable"
[[ -f "$D2_PROGRAM_KEYPAIR" ]] || abort "program identity keypair is missing"
[[ -r "$D2_PROGRAM_KEYPAIR" ]] || abort "program identity keypair is not readable"
[[ -f "$SO_PATH" ]] || abort "deployable .so is missing"

SO_SIZE=$(stat -c %s "$SO_PATH")
[[ "$SO_SIZE" == "$EXPECTED_SO_SIZE" ]] \
  || abort "binary size changed: expected=$EXPECTED_SO_SIZE actual=$SO_SIZE"
SO_SHA256=$(sha256sum "$SO_PATH" | awk '{print $1}')

PROGRAM_KEYPAIR_PUBKEY=$(solana-keygen pubkey "$D2_PROGRAM_KEYPAIR")
[[ "$PROGRAM_KEYPAIR_PUBKEY" == "$ADAPTER_ID" ]] \
  || abort "program identity keypair does not match declared adapter id"
BURNER_PUBKEY=$(solana-keygen pubkey "$PROOFLINE_SIGNER_KEYPAIR")

echo "D2 phase=preflight cluster=mainnet-beta"
echo "D2 binary_bytes=$SO_SIZE program_data_bytes=$PROGRAM_DATA_LENGTH sha256=$SO_SHA256"
echo "D2 program_id=$ADAPTER_ID burner_pubkey=$BURNER_PUBKEY"

GENESIS_HASH=$(solana genesis-hash --url "$PRIMARY_RPC")
[[ "$GENESIS_HASH" == "$EXPECTED_GENESIS" ]] \
  || abort "genesis mismatch expected=$EXPECTED_GENESIS actual=$GENESIS_HASH"
echo "D2 genesis_hash=$GENESIS_HASH"

BALANCE_JSON=$(solana balance "$BURNER_PUBKEY" \
  --url "$PRIMARY_RPC" \
  --commitment finalized \
  --lamports \
  --output json-compact)
PREDEPLOY_BALANCE_LAMPORTS=$(jq -er '.lamports' <<<"$BALANCE_JSON")
(( PREDEPLOY_BALANCE_LAMPORTS >= MINIMUM_BALANCE_LAMPORTS )) \
  || abort "burner balance below 3.2 SOL: lamports=$PREDEPLOY_BALANCE_LAMPORTS"
echo "D2 predeploy_balance_lamports=$PREDEPLOY_BALANCE_LAMPORTS"

RENT_JSON=$(solana rent "$PROGRAM_DATA_LENGTH" \
  --url "$PRIMARY_RPC" \
  --commitment finalized \
  --lamports \
  --output json-compact)
PROGRAMDATA_RENT_LAMPORTS=$(jq -er '.rentExemptMinimumLamports' <<<"$RENT_JSON")
PROJECTED_RESERVE_LAMPORTS=$((
  PREDEPLOY_BALANCE_LAMPORTS - PROGRAMDATA_RENT_LAMPORTS - FEE_ALLOWANCE_LAMPORTS
))
(( PROJECTED_RESERVE_LAMPORTS >= MEMO_RESERVE_LAMPORTS )) \
  || abort "rent gate failed: projected reserve=$PROJECTED_RESERVE_LAMPORTS"
echo "D2 rent_query_bytes=$PROGRAM_DATA_LENGTH rent_lamports=$PROGRAMDATA_RENT_LAMPORTS fee_allowance_lamports=$FEE_ALLOWANCE_LAMPORTS projected_reserve_lamports=$PROJECTED_RESERVE_LAMPORTS"

if solana account "$ADAPTER_ID" \
  --url "$PRIMARY_RPC" \
  --commitment finalized \
  --output json-compact >"$TEMP_ROOT/preexisting-program.json" 2>/dev/null; then
  abort "adapter program account already exists; refusing initial-deploy script"
fi
echo "D2 program_preexistence=absent"

echo "D2 phase=deploy use_rpc=true max_len=$SO_SIZE priority_micro_lamports=$PRIORITY_FEE_MICROLAMPORTS"
set +e
solana program deploy "$SO_PATH" \
  --program-id "$D2_PROGRAM_KEYPAIR" \
  --upgrade-authority "$PROOFLINE_SIGNER_KEYPAIR" \
  --keypair "$PROOFLINE_SIGNER_KEYPAIR" \
  --fee-payer "$PROOFLINE_SIGNER_KEYPAIR" \
  --url "$PRIMARY_RPC" \
  --commitment finalized \
  $( [[ "${D2_USE_RPC:-1}" == "1" ]] && echo --use-rpc ) \
  --max-len "$SO_SIZE" \
  --with-compute-unit-price "$PRIORITY_FEE_MICROLAMPORTS" \
  --output json-compact >"$TEMP_ROOT/deploy.log" 2>&1
DEPLOY_STATUS=$?
set -e

sed -n '1,240p' "$TEMP_ROOT/deploy.log"
if (( DEPLOY_STATUS != 0 )); then
  echo "D2 deploy_status=failed exit_code=$DEPLOY_STATUS buffer_recovery=starting"
  set +e
  solana program close --buffers \
    --authority "$PROOFLINE_SIGNER_KEYPAIR" \
    --keypair "$PROOFLINE_SIGNER_KEYPAIR" \
    --recipient "$BURNER_PUBKEY" \
    --url "$PRIMARY_RPC" \
    --commitment finalized \
    --output json-compact >"$TEMP_ROOT/buffer-close.log" 2>&1
  CLOSE_STATUS=$?
  set -e
  sed -n '1,240p' "$TEMP_ROOT/buffer-close.log"
  echo "D2 buffer_recovery_exit_code=$CLOSE_STATUS"
  abort "program deploy failed; stopped after buffer recovery attempt"
fi

DEPLOY_JSON=$(grep -E '^\{.*\}$' "$TEMP_ROOT/deploy.log" | tail -1)
[[ -n "$DEPLOY_JSON" ]] || abort "deploy succeeded without machine-readable result"
DEPLOY_PROGRAM_ID=$(jq -er '.programId' <<<"$DEPLOY_JSON")
DEPLOY_SIGNATURE=$(jq -er '.signature' <<<"$DEPLOY_JSON")
[[ "$DEPLOY_PROGRAM_ID" == "$ADAPTER_ID" ]] || abort "deployed unexpected program id"
echo "D2 deploy_status=success program_id=$DEPLOY_PROGRAM_ID signature=$DEPLOY_SIGNATURE"

POSTDEPLOY_BALANCE_JSON=$(solana balance "$BURNER_PUBKEY" \
  --url "$PRIMARY_RPC" \
  --commitment finalized \
  --lamports \
  --output json-compact)
POSTDEPLOY_BALANCE_LAMPORTS=$(jq -er '.lamports' <<<"$POSTDEPLOY_BALANCE_JSON")
echo "D2 postdeploy_balance_lamports=$POSTDEPLOY_BALANCE_LAMPORTS deploy_spend_lamports=$((PREDEPLOY_BALANCE_LAMPORTS - POSTDEPLOY_BALANCE_LAMPORTS))"

echo "D2 phase=initialize_config+verify_outcome+secondary_readback"
D2_PRIMARY_RPC="$PRIMARY_RPC" \
D2_SECONDARY_RPC="$SECONDARY_RPC" \
D2_DEPLOY_SIGNATURE="$DEPLOY_SIGNATURE" \
D2_PREDEPLOY_BALANCE_LAMPORTS="$PREDEPLOY_BALANCE_LAMPORTS" \
D2_PROGRAMDATA_RENT_LAMPORTS="$PROGRAMDATA_RENT_LAMPORTS" \
PROOFLINE_SIGNER_KEYPAIR="$PROOFLINE_SIGNER_KEYPAIR" \
  pnpm --dir "$REPO_ROOT/apps/mainnet-attestor" exec tsx "$ADAPTER_ROOT/scripts/d2-client.ts"

[[ -f "$EVIDENCE" ]] || abort "D2 client passed without writing evidence"
jq -e \
  --arg program "$ADAPTER_ID" \
  --arg deploy "$DEPLOY_SIGNATURE" \
  '.program.id == $program and .transactions.deploy.signature == $deploy and .transactions.verifyOutcome.txlineReturnBase64 == "AQ=="' \
  "$EVIDENCE" >/dev/null
echo "D2 evidence_validation=passed"
echo "D2 STOP phase_d2_complete=true"
