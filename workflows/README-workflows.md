# Proofline CRE workflows

Three workflows, not one (design §3.6), sharing zero copy-pasted business
logic — canonical payloads, hashing and IDs live in `packages/protocol`, the
shared runtime shims in `packages/config/src/cre-runtime.ts`.

| Workflow | Lane | Job |
| --- | --- | --- |
| `cre-source-dispatch` | shared | heartbeat → detect `game_finalised` → wait for proof → canonicalize + hash → stage sealed ProofBuffer → write verify command → write `handoff.json` |
| `cre-level3-attestor` | Level 3 (fast) | canonical `validate_stat_v2` simulation tx → identical bytes to 3 RPC providers → 2-of-3 quorum on **stable outputs only** → anti-spoofing asserts → ABI-encoded Level 3 report for `CRELevel3Receiver` |
| `cre-vaa-executor` | Level 4 (proof) | build `MatchOutcomeV1` (byte-for-byte vs the conformance vector) → poll VAA source → validate 13-of-19 header locally → CRE report = **exact VAA bytes** for `WormholeOutcomeReceiver` → dual-finality check → optional market settle |

## Honesty note — CRE programming model vs local simulation runner

Each workflow is written to the CRE shape (`workflow.yaml` + `config/
config.<env>.yaml` + a `main.ts` following the runtime/report pattern), but in
THIS BUILD **no DON is deployed**: `pnpm tsx main.ts --config …` runs a local
heartbeat loop (`cronHeartbeat`), secrets resolve from env by name, and
`creReport()` packages the payload without a DON threshold signature.

Simulated legs are labeled everywhere: the Solana leg is a file-backed
ProofBuffer, the Level 3 "providers" (`sim://recorded/*`) are deterministic
recorded responders (whose slots/compute-units differ per provider on purpose
— agreement is judged on stable outputs only), the Wormhole "guardians" are
the public-string-derived dev set (real secp256k1 math, simulated
observation), and sim-mode Base delivery writes exact calldata with
`sim:`-prefixed tx hashes that can never pass as real. Events carry
`simulated: true` for those legs. Everything else — hashes, payload bytes,
signature verification, ABI encodings — is real and re-checkable with
`verify-evidence`.

## Run the full sim pipeline

```sh
pnpm install

# 1. all three workflows, sequentially, into evidence/runs/<run-id>
pnpm --filter @proofline/relay-cli relay-fixture -- --run-id demo-1

# 2. assemble the §3.7 evidence layout + manifest.json
pnpm --filter @proofline/relay-cli capture-run -- --run-id demo-1

# 3. independently recompute every digest + verify the VAA signatures
pnpm --filter @proofline/relay-cli verify-evidence -- --run-id demo-1

# optional: stream the captured run for UI replay (stdout or coordinator)
pnpm --filter @proofline/relay-cli replay-run -- --run-id demo-1
```

Individual workflows also run standalone against the shared
`evidence/runs/local-dev` dir: `pnpm --filter @proofline/cre-source-dispatch
sim`, then `…cre-level3-attestor sim`, then `…cre-vaa-executor sim`.

Live mode (not run by default; needs Liam's go): set `mode: live` in a
config plus `BASE_RPC_URL` and `FORWARDER_PRIVATE_KEY` env — delivery then
goes through `@proofline/evm-sdk` (the key is read from env only, never from
configs, argv or logs).
