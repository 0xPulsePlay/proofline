# Proofline

**Sports results, proven once. Settled everywhere.**

Proofline turns a TxLINE match result committed on Solana into a reusable,
cross-chain **sports-finality primitive** that any EVM contract can consume.
Two independent verification lanes race the same outcome to Base:

- **Level 3 — the fast lane.** The exact TxOracle `validate_stat_v2`
  simulation transaction is submitted, byte-identical, to three independent
  Solana RPC providers. Agreement is judged on **stable outputs only**
  (err == null, return-data program, boolean return; slots and compute units
  legitimately differ). On a 2-of-3 quorum, a Chainlink CRE workflow delivers
  an ABI-encoded attestation to `CRELevel3Receiver` on Base.
- **Level 4 — the proof lane.** A Wormhole VAA carries the fixed-width
  `MatchOutcomeV1` payload (13-of-19 guardian quorum, verified on-chain via
  ecrecover) into `WormholeOutcomeReceiver`, which re-derives the attestation
  identity **on-chain** from the payload + emitter.

Each lane **independently derives the same `attestationId`**
(`keccak256(domain ‖ emitter ‖ fixtureId ‖ scoreSequence ‖
validationInstructionHash ‖ proofBundleHash)`). When the two digests meet in
the `FinalityRegistry`, the fixture reaches **DUAL FINALIZED** — and an
independent `DemoPredictionMarket` settles from it permissionlessly. A digest
mismatch freezes the fixture in `Conflict`, never silently overwritten.

The verification-level taxonomy (L1–L4) is exposed as a legible feature, not
hidden: trust assumptions are the product's UI, not its fine print.

## The Finality Control Room

An event-sourced cinematic dashboard: a typed `RelayEvent` union drives BOTH
live mode (SSE) and replay — **no fake animation; every animation is caused
by an event tied to an action that actually happened**. Includes the 19-node
Guardian ring (real signer indices light up), the two lanes racing, the
DUAL FINALIZED digest-match moment, a proof-path panel (real hex, every stage
event-driven), and the **Tamper Lab**, where forged relays — tampered score,
12-signature quorum, wrong emitter, VAA replay — fail live with the
receiver's actual Solidity error names, verified in your browser with the
same math the Base contract runs.

## Real vs simulated (the honesty table)

| Leg | Status |
| --- | --- |
| Base Sepolia contracts (all 5) | **REAL — deployed + exercised live** (receipts below) |
| Level 3 report delivery (`onReport`) | **REAL tx** [`0x64a90f…6cab69`](https://sepolia.basescan.org/tx/0x64a90fab39f431750cc973468715ac8227f3790a93cc53b96c1b3a491e6cab69) |
| Level 4 VAA delivery (`submitVaa`) | **REAL tx** [`0x5fee92…a7d7e4`](https://sepolia.basescan.org/tx/0x5fee92ce5329b1cf83a21af59831ed14c47c24e8910cada094939c2baaa7d7e4) → on-chain **DualFinalized** |
| Market settlement (`settle()`) | **REAL tx** [`0x4fca3d…c3fc93`](https://sepolia.basescan.org/tx/0x4fca3d34ab7f0b0e50290deedb2d529ad301ccdd694aac519538bf7c4bc3fc93) |
| All hashing / payload / attestation-id math | **REAL** (conformance vector reproduced byte-for-byte at runtime; `verify-evidence` re-checks independently) |
| Guardian signatures | **REAL secp256k1** over the real Wormhole double-keccak digest — but from a **dev guardian set** (19 keys derived from public strings; labeled everywhere). Wormhole's real Guardians can only observe real Solana emissions. |
| Live TxLINE ingestion | **REAL** — free-tier API (guest JWT + `X-Api-Token`), verified against World Cup Final fixture `18257739`; same code path as the recorded fixture |
| Solana adapter leg (TxOracle CPI, ProofBuffer) | **SIMULATED** — file-backed ProofBuffer mock, `sim:`-prefixed signatures that can never pass as real. The Anchor program is real code that **builds + passes its conformance tests** (`programs/proofline-adapter`), not deployed in this build |
| Level 3 RPC providers | **SIMULATED** — deterministic recorded responders (per-provider differing slots/units prove the stable-outputs-only comparison) |
| CRE DON | **SIMULATED** — workflows written to the CRE programming model, executed by a local simulation runner |

The demo default is a deterministic recorded fixture (982341, Canada 2–1
France) so judges see a complete run regardless of kickoff schedules; the
bundled Control Room replay is the **real** `live-base-1` run above.

## Deployed contracts (Base Sepolia, chain 84532)

| Contract | Address |
| --- | --- |
| FinalityRegistry | [`0xac0b2f8250f16e076e2cfcf5e79243be0198c64f`](https://sepolia.basescan.org/address/0xac0b2f8250f16e076e2cfcf5e79243be0198c64f) |
| CRELevel3Receiver | [`0xa2166ea27f2ce4029e3426f2d3c84fd7151cb05f`](https://sepolia.basescan.org/address/0xa2166ea27f2ce4029e3426f2d3c84fd7151cb05f) |
| WormholeOutcomeReceiver | [`0x58512d54b8fc32bc6f03800416c93ab08a336f60`](https://sepolia.basescan.org/address/0x58512d54b8fc32bc6f03800416c93ab08a336f60) |
| MockWormholeCore (dev guardian set) | [`0xaac43563eca9a2a5ca989935f909588b08655ab4`](https://sepolia.basescan.org/address/0xaac43563eca9a2a5ca989935f909588b08655ab4) |
| DemoPredictionMarket | [`0x84edaa2144931606db5240993771738f3ad97bba`](https://sepolia.basescan.org/address/0x84edaa2144931606db5240993771738f3ad97bba) |

Consume finality from any Base contract:

```solidity
(bool finalized, uint8 result) = proofline.finalOutcome(fixtureId);
require(finalized, "Outcome not finalized");
```

## Quickstart

```bash
pnpm install

# Full simulated pipeline over the recorded fixture → evidence run
pnpm --filter @proofline/relay-cli relay-fixture -- --run-id my-run
pnpm --filter @proofline/relay-cli capture-run -- --run-id my-run

# Independently verify EVERYTHING (hashes, signatures, attestation ids,
# byte-for-byte conformance against the frozen vector):
pnpm --filter @proofline/relay-cli verify-evidence -- --run-id my-run

# Control Room
pnpm --filter @proofline/web dev
```

Verification gates: `pnpm typecheck` (16 workspaces) · `pnpm test`
(protocol / event-model / wormhole-sdk) · `cargo test` in
`programs/proofline-adapter` (20 tests incl. payload conformance) ·
`forge test` in `contracts/base`.

### Live TxLINE mode

```bash
export TXLINE_API_TOKEN=…   # free tier
cd workflows/cre-source-dispatch
pnpm exec tsx main.ts --config config/config.live.yaml
```

Real score events for the configured fixture flow through the exact same
code path as the recorded fixture (the recorded file doubles as the
proof-leg template — fields the free tier does not expose, labeled
synthetic). Pre-match, the state machine correctly holds in
`IN_PLAY → no action, no writes` (§ design: writes happen only on meaningful
state transitions, never per heartbeat).

### Live Base Sepolia delivery

```bash
export BASE_RPC_URL=https://sepolia.base.org
export FORWARDER_PRIVATE_KEY=…   # demo forwarder EOA; env-only, never logged
pnpm --filter @proofline/relay-cli relay-fixture -- \
  --run-id live-run --config-name config.live-base.yaml
```

## Monorepo layout

```
apps/          web (Control Room) · coordinator (event store + SSE + replay)
               · proof-uploader (untrusted transport) · relay-cli
workflows/     cre-source-dispatch · cre-level3-attestor · cre-vaa-executor
programs/      proofline-adapter (Anchor; builds + tested, not deployed)
contracts/     base (Foundry: 5 contracts + libraries + tests)
packages/      protocol (single source of truth for payload/hashing/ids)
               · event-model · txline-sdk · solana-sdk · wormhole-sdk
               · evm-sdk · ui · config · observability · test-vectors
evidence/      runs/<run-id>/ — the §3.7 evidence layout, verifiable offline
```

Boundary rules: `packages/protocol` is the single source of truth for the
payload schema and hash definitions (no hand-maintained copies);
`apps/coordinator` only observes and records; `workflows/cre-*` provide
automation (liveness), not correctness; the Solana program and Base
receivers enforce correctness.

## Design decisions on the spec's open items

- **VAA source mechanism** → dev-guardian signer behind the same polling
  interface as Wormholescan/guardian RPC (`vaa-fetcher.ts`) — swap the
  locator, keep the contract.
- **Mock-forwarder address** → the demo forwarder is a configured EOA,
  validated exactly like ReceiverTemplate validates the Keystone Forwarder;
  swapping in the real forwarder is a one-call owner change.
- **Settlement asset** → native-ETH demo market seeded at deploy
  (escrow-style, simplest honest choice; the market is a consumer demo, not
  the product).
- **RPC provider list** → three deterministic recorded responders in this
  build (labeled), provider URLs configurable per workflow config for live.
- **Odds consensus** → out of scope for settlement; the odds surface
  (TxLINE `TXLineStablePriceDemargined`) is referenced in the integrations
  page only.

## Security checklist (judge-facing)

The receiver enforces, in order: Wormhole core verification → source-chain
check → registered-emitter check → payload magic/version → destination-chain
check → replay protection by VAA digest AND emitter sequence → on-chain
attestation-id derivation → conflict freeze (never overwrite). The Tamper
Lab demonstrates each failure live. Dual replay protection, one registered
emitter, permissionless `submitVaa` (CRE provides liveness, not
correctness), and the L1–L4 trust taxonomy are all deliberate, visible
design choices.

## License

MIT
