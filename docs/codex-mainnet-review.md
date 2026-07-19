# Codex mainnet review — Proofline (extracted from the codex session log by the Director; complete report recovered from the full session log)

# Proofline pre-mainnet review and deploy plan

**Review time:** 2026-07-19, 07:55 ET  
**Review target:** commit `99bd4eab96c90bc7a4eb09b971d1f669706c7122` on `main`  
**Decision:** **NO-GO for the custom-program deployment. GO for a tightly scoped no-deploy mainnet attestation path, with the mandatory fixes below.**

## Executive verdict

Proofline is a strong hackathon prototype with unusually good honesty labeling, clean package boundaries, cross-language payload vectors, a real exercised Base Sepolia leg, and good unit/conformance coverage. It is good submission material.

It is **not good to ship as a new Solana mainnet program today**. The central Solana adapter does not implement TxLINE's real `validate_stat_v2` ABI. It compiles and its unit tests pass because those tests exercise Proofline's own invented flat argument shape, not the deployed TxLINE program. There is no validator/CPI integration test. The Level 3 “canonical transaction” is likewise a textual placeholder rather than an Anchor/Borsh TxLINE instruction. A mainnet deployment would therefore be expensive, outside the stated signer authorization, and functionally incapable of performing the advertised verification.

The honest path that can be made ready before 14:30 ET is:

1. capture the final and its real TxLINE V2 proof using the already-working two-header API flow;
2. derive and read the real mainnet daily-root PDA at `finalized` commitment;
3. execute TxLINE's deployed `validateStatV2` as a read-only mainnet `.view()`/`simulateTransaction` using the official IDL and exact proof/strategy;
4. hash and preserve the complete evidence bundle; and
5. sign a compact Proofline attestation containing those identities in a normal Solana Memo transaction.

That provides real, timestamped, independently reproducible mainnet evidence. It does **not** turn client-side verification into trustless on-chain verification, and the recording must say that plainly.

## 1. Quality review

### Architecture and code-quality verdict

What is good:

- The real/simulated boundary is prominent in `README.md:42-55`, not buried.
- Protocol hashing and payload encoding have TypeScript, Rust, and Solidity conformance coverage.
- The Base contracts have meaningful happy-path, ordering, replay, conflict, guardian-quorum, emitter, and payload-tamper tests.
- The event-sourced UI and `sim:` signature convention make it difficult to accidentally present a simulated receipt as a chain receipt.
- Return-data origin checking is conceptually correct: an eventual adapter must require both the TxLINE program ID and an exact boolean return.
- The adjacent TxLINE tooling is substantially more production-ready than Proofline's current Solana integration: it has a pinned official ABI, exact serialization vectors, safe daily-root derivation, and recorded successful mainnet `.view()` verification.

Validation evidence already present in the lane, generated between 06:58 and 07:14 ET today:

- TypeScript typecheck: 16/16 workspaces passed.
- TypeScript tests: 3/3 test-bearing workspaces passed.
- Foundry: 25/25 tests passed.
- Anchor/Rust: build completed and unit/conformance tests passed, with 18 macro/config warnings.
- SBF deploy artifact exists and is 374,816 bytes.

These are useful health signals, but none exercises the Proofline adapter against the deployed TxLINE program or Wormhole Core.

### Mandatory blockers and bugs

#### P0 — The Solana adapter uses the wrong TxLINE ABI

`programs/proofline-adapter/.../txline/idl_types.rs:21-47` defines `validate_stat_v2` as:

`fixture_id, sequence, period, participant_1_score, participant_2_score, proof: Vec<u8>`.

TxLINE's published IDL defines two arguments: a structured `StatValidationInput` and an `NDimensionalStrategy`. The official CPI binding pins discriminator `[208,215,194,214,241,71,246,178]` and serializes the full proof hierarchy, proof-node directions, stat leaves, and strategy. The deployed instruction also has a timestamp-derived `daily_scores_roots` PDA invariant.

**Impact:** the current CPI instruction cannot successfully call deployed mainnet TxLINE. FULL must not deploy until the hand-written ABI is removed and the pinned `txline-kit-cpi` binding is used or reproduced byte-for-byte.

#### P0 — The claimed Level 3 “canonical transaction” is not a TxLINE transaction

`packages/config/src/cre-runtime.ts:348-359` explicitly encodes UTF-8 text such as `validate_stat_v2:fixture=...`; it is not the Anchor discriminator plus Borsh payload and strategy. `workflows/cre-level3-attestor/main.ts:127-165` then returns a locally manufactured `true` response for that transaction. `apps/relay-cli/src/verify-evidence.ts:109-129` verifies the same textual placeholder.

**Impact:** all hashes may be internally consistent while proving nothing about TxLINE. Do not reuse `canonicalValidateStatV2Data`, the existing Level 3 simulation builder, or its “verification” result in the real-mainnet path.

#### P0 — The live Proofline path discards the real proof leg

`packages/txline-sdk/src/scores/live-snapshot.ts:11-15,115-157` treats proof/root data as unavailable and injects synthetic template values. That premise is stale: the configured two-header API flow can retrieve `/api/scores/stat-validation`, and the capture repository already contains real proof bundles plus a working mainnet verifier.

**Impact:** merely switching Proofline's current config to `mode: live` still produces synthetic roots/proofs. The no-deploy path must consume raw capture proof responses, not this template path.

#### P0 — Final-score detection/mapping is unsafe for the live final

`isFinalRecord` requires action, status ID, and period all to match exactly. Real provider finalisation records may omit period. The live mapper probes unconfirmed field names and defaults missing scores and period to zero (`live-snapshot.ts:79-92`).

**Impact:** the pipeline can miss the final or manufacture a 0–0 shape from absent fields. Use the observed finalisation record to select the sequence, then take attested score values from the returned V2 proof's requested stat leaves. Never default a field that enters an attestation.

#### P0 — A memo alone does not prove that verification ran

A Solana signature proves that the authorized key signed the exact memo in a transaction finalized at a slot. The Memo program does not execute TxLINE, validate a Merkle path, or enforce truthful memo contents.

**Required mitigation:** publish/preserve the full raw proof bundle, hash it canonically, bind that digest plus the exact serialized TxLINE instruction digest and root address into the memo, and provide a one-command independent verifier. Use at least two independent RPCs for the `.view()` result and record finalized slots. The UI must say “client-verified against TxLINE mainnet; attestation anchored by Memo,” not “verified on-chain by Proofline.”

#### P1 — The adapter trusts caller-supplied provenance fields

`proof_timestamp_ms` and `proof_bundle_hash` are caller inputs (`verify_outcome.rs:26-45`), and the comment says bundle correctness is enforced by equality on Base. In the current system, both lanes consume the same operator-controlled fixture/handoff, so equality is consistency, not independent correctness.

**FULL-path requirement:** parse/accept the official TxLINE payload, derive the proof timestamp, fixture, score values, sequence/stat identity, daily-root PDA, and deterministic bundle/instruction hash from those exact bytes on-chain. Do not allow a relayer to choose provenance independently of the verified payload.

#### P1 — Deployment configuration is not mainnet-safe

`Anchor.toml:8-16` declares only `localnet` and points at the default local wallet. `initialize_config` accepts arbitrary program IDs, destination chain, and forwarder with no known-mainnet constant checks. There is no initialize/deploy/smoke-test runbook, no mainnet IDL/client configuration, and no upgrade-authority ceremony.

The declared program identity also requires a program-address signer on initial deployment. That is a second signing identity beyond the sole authorized mainnet burner, so FULL conflicts with the authorization in this brief even if funding appears.

#### P1 — Wormhole publication is unproven integration code

The hand-written Wormhole CPI has only pure layout/parser unit tests. There is no local-validator or mainnet-compatible integration test proving account creation, account ordering, fee handling, message posting, or VAA observation. The program's own header calls it unaudited reference source and advises against deadline-day deployment (`lib.rs:8-16`). Treat that warning as correct.

### Ship verdict by component

| Component | Verdict today |
| --- | --- |
| Base Sepolia contracts and recorded receipts | Ship as the already-labeled real Base leg |
| Simulated Wormhole/CRE demo | Ship only with current simulation labels |
| Current Proofline live TxLINE snapshot path | Do not use for proof claims |
| Custom Solana adapter | **Do not deploy** |
| New proof-backed Memo attestation path | Ship after the P0 no-deploy fixes and a historical rehearsal |

## 2. Mainnet options

### A. FULL — compile and deploy the Anchor adapter

#### Cost

The actual stripped artifact at `target/deploy/proofline_adapter.so` is **374,816 bytes**. The build intermediate is 471,240 bytes; the smaller deploy artifact is the relevant estimate.

Upgradeable-loader sizing for the current artifact:

| Account | Data size | Finalized mainnet rent query at 07:43 ET |
| --- | ---: | ---: |
| Program | 36 bytes | 0.001141440 SOL |
| ProgramData | 45 + 374,816 = 374,861 bytes | 2.609923440 SOL |
| Upload buffer (transient) | 37 + 374,816 = 374,853 bytes | 2.609867760 SOL |

The upload buffer's balance is reused/consumed during initial deployment; it is not an additional permanent 2.61 SOL. The permanent rent floor is therefore approximately:

`2.609923440 + 0.001141440 = 2.611064880 SOL`

Against **0.229 SOL available**, the bare rent shortfall is:

`2.611064880 - 0.229 = 2.382064880 SOL`

Deployment also needs hundreds of upload transactions for a 375 KB binary, the final deploy transaction, initialization, and tests. At the current 5,000-lamport base fee per signature, upload/base fees should remain in the low thousandths of SOL, but retries and priority fees are workload-dependent. A bare-minimum top-up would be roughly **2.39 SOL**. A prudent funding target is a **2.65 SOL wallet balance**, requiring a **2.421 SOL top-up**. This estimate uses today's finalized `getMinimumBalanceForRentExemption` results; re-query immediately before any approved spend.

The Solana CLI now defaults initial `max-len` to the current program length. Reserving substantial upgrade headroom increases rent linearly. The older 2× allocation convention would put this artifact near 5.22 SOL permanent rent and should not be selected under this budget.

References: Solana documents the current 5,000-lamport/signature base fee and optional priority-fee formula in its [fee structure](https://solana.com/docs/core/fees/fee-structure). Loader-v3 is the normal upgradeable deployment model; the installed CLI reports `--max-len` defaults to the original program length.

#### Time and feasibility

- Replace the false ABI with the pinned official binding and remodel outcome derivation: 2–4 hours.
- Add validator/integration coverage for CPI account/PDA/return behavior: 1–2 hours.
- Validate Wormhole Core CPI end-to-end and fix likely integration issues: 1–3 hours.
- Add mainnet config, program-identity authorization, initialization checks, upgrade-authority decision, deploy client, and smoke tests: 1–2 hours.
- Fund, upload, deploy, initialize, and inspect: 15–45 minutes if the network and RPC behave.

**Honest estimate: 5–10 engineering hours plus funding/authorization, with material tail risk.** It cannot be made responsibly ready for the 14:30 ET recording freeze, and the signer constraint alone prevents it under the current authorization.

**Verdict: NO-GO. Do not fund this option today.**

### B. NO-DEPLOY HONEST PATH — real root/proof reads plus Memo

#### Proposed evidence chain

```text
TxLINE final event
  -> raw /stat-validation proof (two authenticated headers)
  -> timestamp-derived daily_scores_roots PDA
  -> finalized mainnet account read
  -> exact official validateStatV2 .view() on 2+ RPCs
  -> canonical evidence bundle + exact instruction hash
  -> signed Proofline v1 Memo transaction
  -> finalized transaction fetched back and decoded
```

Use the already-working capture/verification implementation rather than Proofline's placeholder builder. The official client has already replayed a historical proof through deployed mainnet `validateStatV2` and received `true`; the local capture directory also already contains multiple real historical proof bundles and an active directory for final fixture `18257739`. Credential values were not inspected; only the access-file key names were checked, confirming the expected JWT/API-token/wallet metadata shape.

#### Attestation format

Keep the memo compact and versioned, for example:

```text
proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=f7e3bcd5db4c6744445f75dfab7eccc879c6d2de
```

Rules:

- `bundle` is a documented canonical hash of the complete verbatim proof response, strategy, root, and final record—not of a UI summary.
- `ix` hashes the exact Anchor/Borsh instruction bytes actually simulated.
- `root` is derived from the proof timestamp and its account owner/existence are checked at finalized commitment.
- `result` is derived from proof stat values, never from defaulted snapshot fields.
- The fee payer signs the transaction; include its public key in the evidence manifest and verify it on readback.
- One deterministic attestation ID per `(cluster, TxLINE program, fixture, sequence, root, ix, bundle)`. A correction must use an explicit `supersedes=<signature>` field; never silently overwrite.
- Preserve the complete evidence bundle outside the memo and make the verifier available to judges. A 32-byte digest without the preimage is not independently useful.

Solana transactions are limited to 1,232 bytes, so a digest-oriented memo is appropriate; do not try to put the proof itself in the transaction. The [Solana Memo documentation](https://solana.com/docs/payments/send-payments/payment-with-memo) confirms that memo text is permanently recorded in transaction logs and visible through RPC/explorers.

#### Cost

A one-signer Memo transaction creates no account and pays no rent. At the current base fee:

- base cost: **5,000 lamports = 0.000005 SOL per transaction**;
- theoretical capacity of 0.229 SOL: **45,800 memo transactions** at base fee only;
- preserving 0.020 SOL and assuming no priority fee: **41,800 transactions**;
- even at 0.000015 SOL total per transaction (base plus a generous 10,000-lamport priority allowance): about **13,933 transactions** after that reserve.

The final requires only a handful: optionally one “capture started” marker, one per significant proof-backed event, and one final attestation. Re-query fees immediately before broadcast and cap any priority fee explicitly.

#### Does it deliver “can't fake”?

**Yes, for a carefully worded claim:** it proves that the authorized burner signed a specific digest/reference at a mainnet slot; that the referenced TxLINE root account existed on mainnet; and—if the raw proof is published—that any judge can independently run the exact deployed TxLINE verifier against that root and reproduce `true`.

**No, for the stronger claim:** the Memo program itself does not enforce the proof, and an operator could sign a false memo. RPC simulation output is not persisted as consensus state. Multiple finalized RPC reads and a public reproducible proof make deception detectable, but do not turn it into a Proofline smart-contract verdict.

The recording narration should be: **“real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet.”** It should not say **“Proofline verified the proof on-chain.”**

#### Time

Using the adjacent capture and official verifier code: **2–3.5 hours to a rehearsed path**, including memo schema/decoder, artifact canonicalization, multi-RPC verification, confirmation/readback, and UI/recording evidence. This is feasible before 14:30 ET with a hard scope freeze.

### C. HYBRID — recommended

For today's final:

- Use Option B for the live Solana mainnet evidence.
- Continue showing the already-real Base Sepolia delivery/settlement receipts as a separate exercised leg.
- Keep Wormhole and CRE labeled simulated.
- Do not visually imply that today's Memo caused the existing Base settlement unless a separately identified, real relay transaction actually does so.
- After the hackathon, replace the adapter ABI with `txline-kit-cpi`, integrate/test Wormhole, arrange a program identity and funding, then deploy deliberately.

This produces more real evidence today than rushing an unusable program: the roots, deployed TxLINE verification, attestation signature, slot, and explorer transaction are all real, while every remaining trust boundary is stated accurately.

## 3. Recommendation and timed work plan

### Go/no-go decision

**GO: HYBRID/no-deploy.**  
**NO-GO: FULL, even if Liam offers funding today.** Funding does not cure the wrong ABI, missing integration tests, or unauthorized second signer.

### Mandatory before the first mainnet Memo

1. **Delete the placeholder from the real path.** The transaction bytes must come from the pinned official TxLINE IDL/client; assert discriminator and, preferably, match a Rust/TypeScript golden vector.
2. **Use the real proof endpoint.** Capture the complete verbatim V2 response with both required auth headers; never substitute Proofline's synthetic proof/root template.
3. **Bind the correct root.** Derive `daily_scores_roots` from `summary.updateStats.minTimestamp`, assert it equals the account passed to `validateStatV2`, read it at `finalized`, and record slot, owner, and account-data hash.
4. **Prove exact values.** Use exact-equality predicates for the requested score stat indices. No zero defaults, guessed key names, or snapshot-only score assertions.
5. **Require reproducible success.** Get `true` from at least two independent mainnet RPC providers using identical serialized instruction data; reject missing/wrong-program/malformed return data and any differing stable result.
6. **Canonicalize evidence once.** Define and test deterministic bundle hashing; persist raw proof, exact instruction bytes, strategy, RPC results, root read, and final record. Memo only the compact identities.
7. **Add transaction safety rails.** Hardcode/allowlist mainnet cluster, TxLINE program, Memo program, authorized signer public key, maximum fee/priority fee, and expected memo schema. Default to dry-run. Require an explicit operator broadcast flag and show decoded contents before signing.
8. **Confirm what landed.** Wait for `finalized`, fetch the transaction from a second RPC, verify success, signer, cluster, Memo program, and byte-exact memo, then produce the explorer link.
9. **Fix the claim/UI.** Display “client-verified + memo-anchored,” expose proof/root/instruction/bundle identities, and keep Wormhole/CRE simulation badges visible.
10. **Historical rehearsal.** Run the entire read/verify/hash/build/decode/readback pipeline on an already-captured historical V2 proof. No live-final code should be first exercised after kickoff.

### Work schedule, Eastern Time

| Time | Gate/work |
| --- | --- |
| 08:00–08:15 | Liam go/no-go: approve HYBRID wording and freeze FULL. Assign one implementation owner; preserve the active capture process. |
| 08:15–09:15 | Wire raw capture proof -> pinned official TxLINE verifier -> deterministic evidence bundle. Add strict final/stat/PDA checks. |
| 09:15–10:00 | Historical proof rehearsal against 2+ mainnet RPCs at finalized commitment. Compare exact instruction bytes and results. Fix any discrepancy before proceeding. |
| 10:00–10:45 | Implement compact Memo v1 builder, local decoder, deterministic ID, signer/program/cluster/fee allowlists, dry-run default, and readback verifier. |
| 10:45–11:30 | End-to-end historical rehearsal. If Liam explicitly authorizes spend, one historical mainnet Memo smoke test costs about 0.000005 SOL plus any capped priority fee; otherwise validate unsigned/local serialization and defer the first broadcast. |
| 11:30–12:30 | Add the evidence view/recording surface: RPC slots, root, proof result, memo preview/signature, explorer link, and explicit trust wording. |
| 12:30–13:15 | Failure drills: expired JWT renewal with same API token, proof-not-yet-indexed retry, RPC disagreement/rate limit, transaction expiry/resign, delayed finalisation, and duplicate suppression. |
| 13:15–14:00 | Operator rehearsal with screen capture; verify final fixture `18257739`, capture services, disk, clocks, and two RPC endpoints without exposing credentials. |
| 14:00–14:30 | Code/config freeze and recording setup. Start a clean evidence run and capture-start marker only if explicitly authorized. |
| 15:00 onward | Record kickoff/live data. Memo only meaningful proof-backed checkpoints. After finalisation, retry proof retrieval through the next five-minute indexing window, run both RPC verifications, post the final memo, wait for finalized readback, then capture explorer/evidence screens. |
| By 19:30 | Preserve at least 30 minutes of contingency before the 19:59:59 submission deadline. Do not let a missing Memo block submission of the already-working honest demo. |

### Abort/fallback rules

- If the historical proof does not return identical `true` on two RPCs by 10:00 ET, do not build the live claim on RPC screenshots; fix the verifier or fall back to raw root read plus explicitly unverified memo wording.
- If the Memo path is not rehearsed end-to-end by 11:30 ET, freeze it out of the critical UI and record the real root/read-only verifier separately rather than improvising a transaction live.
- If final proof indexing is delayed, keep recording and retry with bounded backoff. Never memo “verified” before `validateStatV2` returns exact `true`.
- Never pivot back to FULL today. Its blockers are architectural and authorization-related, not schedule padding.

## Post-deadline FULL checklist

Before any later adapter deployment:

1. replace the hand-written TxLINE types with the pinned `txline-kit-cpi` crate and lock the IDL revision;
2. derive every attested field from the verified payload and deterministic bytes;
3. enforce the known TxLINE mainnet program and timestamp-derived root PDA;
4. add program-test plus a mainnet read-only rehearsal and a real consumer CPI transaction on an appropriate test environment;
5. integrate Wormhole using a maintained SDK/version or prove the raw CPI against a validator and test emission/VAA observation;
6. establish an explicitly authorized program identity and upgrade-authority policy;
7. regenerate size/rent estimates, fund only after review, deploy upgradeable for smoke tests, verify source/binary, then consider `--final` or governed authority;
8. obtain an independent security review of the exact deploy commit.

## Review limitations

This was a deadline-prioritized, read-only review. No keypair was read, no credential value was printed, no transaction was constructed/simulated/signed/sent, and no deployment was attempted. The only project write is this report. Existing build/test logs were inspected rather than rerunning commands that would write caches/artifacts. The lane had one pre-existing untracked `apps/web/.gitignore`; it was not touched.
++ b/proofline/workspace/proofline/docs/codex-mainnet-review.md
# Proofline pre-mainnet review and deploy plan

**Review time:** 2026-07-19, 07:55 ET  
**Review target:** commit `99bd4eab96c90bc7a4eb09b971d1f669706c7122` on `main`  
**Decision:** **NO-GO for the custom-program deployment. GO for a tightly scoped no-deploy mainnet attestation path, with the mandatory fixes below.**

## Executive verdict

Proofline is a strong hackathon prototype with unusually good honesty labeling, clean package boundaries, cross-language payload vectors, a real exercised Base Sepolia leg, and good unit/conformance coverage. It is good submission material.

It is **not good to ship as a new Solana mainnet program today**. The central Solana adapter does not implement TxLINE's real `validate_stat_v2` ABI. It compiles and its unit tests pass because those tests exercise Proofline's own invented flat argument shape, not the deployed TxLINE program. There is no validator/CPI integration test. The Level 3 “canonical transaction” is likewise a textual placeholder rather than an Anchor/Borsh TxLINE instruction. A mainnet deployment would therefore be expensive, outside the stated signer authorization, and functionally incapable of performing the advertised verification.

The honest path that can be made ready before 14:30 ET is:

1. capture the final and its real TxLINE V2 proof using the already-working two-header API flow;
2. derive and read the real mainnet daily-root PDA at `finalized` commitment;
3. execute TxLINE's deployed `validateStatV2` as a read-only mainnet `.view()`/`simulateTransaction` using the official IDL and exact proof/strategy;
4. hash and preserve the complete evidence bundle; and
5. sign a compact Proofline attestation containing those identities in a normal Solana Memo transaction.

That provides real, timestamped, independently reproducible mainnet evidence. It does **not** turn client-side verification into trustless on-chain verification, and the recording must say that plainly.

## 1. Quality review

### Architecture and code-quality verdict

What is good:

- The real/simulated boundary is prominent in `README.md:42-55`, not buried.
- Protocol hashing and payload encoding have TypeScript, Rust, and Solidity conformance coverage.
- The Base contracts have meaningful happy-path, ordering, replay, conflict, guardian-quorum, emitter, and payload-tamper tests.
- The event-sourced UI and `sim:` signature convention make it difficult to accidentally present a simulated receipt as a chain receipt.
- Return-data origin checking is conceptually correct: an eventual adapter must require both the TxLINE program ID and an exact boolean return.
- The adjacent TxLINE tooling is substantially more production-ready than Proofline's current Solana integration: it has a pinned official ABI, exact serialization vectors, safe daily-root derivation, and recorded successful mainnet `.view()` verification.

Validation evidence already present in the lane, generated between 06:58 and 07:14 ET today:

- TypeScript typecheck: 16/16 workspaces passed.
- TypeScript tests: 3/3 test-bearing workspaces passed.
- Foundry: 25/25 tests passed.
- Anchor/Rust: build completed and unit/conformance tests passed, with 18 macro/config warnings.
- SBF deploy artifact exists and is 374,816 bytes.

These are useful health signals, but none exercises the Proofline adapter against the deployed TxLINE program or Wormhole Core.

### Mandatory blockers and bugs

#### P0 — The Solana adapter uses the wrong TxLINE ABI

`programs/proofline-adapter/.../txline/idl_types.rs:21-47` defines `validate_stat_v2` as:

`fixture_id, sequence, period, participant_1_score, participant_2_score, proof: Vec<u8>`.

TxLINE's published IDL defines two arguments: a structured `StatValidationInput` and an `NDimensionalStrategy`. The official CPI binding pins discriminator `[208,215,194,214,241,71,246,178]` and serializes the full proof hierarchy, proof-node directions, stat leaves, and strategy. The deployed instruction also has a timestamp-derived `daily_scores_roots` PDA invariant.

**Impact:** the current CPI instruction cannot successfully call deployed mainnet TxLINE. FULL must not deploy until the hand-written ABI is removed and the pinned `txline-kit-cpi` binding is used or reproduced byte-for-byte.

#### P0 — The claimed Level 3 “canonical transaction” is not a TxLINE transaction

`packages/config/src/cre-runtime.ts:348-359` explicitly encodes UTF-8 text such as `validate_stat_v2:fixture=...`; it is not the Anchor discriminator plus Borsh payload and strategy. `workflows/cre-level3-attestor/main.ts:127-165` then returns a locally manufactured `true` response for that transaction. `apps/relay-cli/src/verify-evidence.ts:109-129` verifies the same textual placeholder.

**Impact:** all hashes may be internally consistent while proving nothing about TxLINE. Do not reuse `canonicalValidateStatV2Data`, the existing Level 3 simulation builder, or its “verification” result in the real-mainnet path.

#### P0 — The live Proofline path discards the real proof leg

`packages/txline-sdk/src/scores/live-snapshot.ts:11-15,115-157` treats proof/root data as unavailable and injects synthetic template values. That premise is stale: the configured two-header API flow can retrieve `/api/scores/stat-validation`, and the capture repository already contains real proof bundles plus a working mainnet verifier.

**Impact:** merely switching Proofline's current config to `mode: live` still produces synthetic roots/proofs. The no-deploy path must consume raw capture proof responses, not this template path.

#### P0 — Final-score detection/mapping is unsafe for the live final

`isFinalRecord` requires action, status ID, and period all to match exactly. Real provider finalisation records may omit period. The live mapper probes unconfirmed field names and defaults missing scores and period to zero (`live-snapshot.ts:79-92`).

**Impact:** the pipeline can miss the final or manufacture a 0–0 shape from absent fields. Use the observed finalisation record to select the sequence, then take attested score values from the returned V2 proof's requested stat leaves. Never default a field that enters an attestation.

#### P0 — A memo alone does not prove that verification ran

A Solana signature proves that the authorized key signed the exact memo in a transaction finalized at a slot. The Memo program does not execute TxLINE, validate a Merkle path, or enforce truthful memo contents.

**Required mitigation:** publish/preserve the full raw proof bundle, hash it canonically, bind that digest plus the exact serialized TxLINE instruction digest and root address into the memo, and provide a one-command independent verifier. Use at least two independent RPCs for the `.view()` result and record finalized slots. The UI must say “client-verified against TxLINE mainnet; attestation anchored by Memo,” not “verified on-chain by Proofline.”

#### P1 — The adapter trusts caller-supplied provenance fields

`proof_timestamp_ms` and `proof_bundle_hash` are caller inputs (`verify_outcome.rs:26-45`), and the comment says bundle correctness is enforced by equality on Base. In the current system, both lanes consume the same operator-controlled fixture/handoff, so equality is consistency, not independent correctness.

**FULL-path requirement:** parse/accept the official TxLINE payload, derive the proof timestamp, fixture, score values, sequence/stat identity, daily-root PDA, and deterministic bundle/instruction hash from those exact bytes on-chain. Do not allow a relayer to choose provenance independently of the verified payload.

#### P1 — Deployment configuration is not mainnet-safe

`Anchor.toml:8-16` declares only `localnet` and points at the default local wallet. `initialize_config` accepts arbitrary program IDs, destination chain, and forwarder with no known-mainnet constant checks. There is no initialize/deploy/smoke-test runbook, no mainnet IDL/client configuration, and no upgrade-authority ceremony.

The declared program identity also requires a program-address signer on initial deployment. That is a second signing identity beyond the sole authorized mainnet burner, so FULL conflicts with the authorization in this brief even if funding appears.

#### P1 — Wormhole publication is unproven integration code

The hand-written Wormhole CPI has only pure layout/parser unit tests. There is no local-validator or mainnet-compatible integration test proving account creation, account ordering, fee handling, message posting, or VAA observation. The program's own header calls it unaudited reference source and advises against deadline-day deployment (`lib.rs:8-16`). Treat that warning as correct.

### Ship verdict by component

| Component | Verdict today |
| --- | --- |
| Base Sepolia contracts and recorded receipts | Ship as the already-labeled real Base leg |
| Simulated Wormhole/CRE demo | Ship only with current simulation labels |
| Current Proofline live TxLINE snapshot path | Do not use for proof claims |
| Custom Solana adapter | **Do not deploy** |
| New proof-backed Memo attestation path | Ship after the P0 no-deploy fixes and a historical rehearsal |

## 2. Mainnet options

### A. FULL — compile and deploy the Anchor adapter

#### Cost

The actual stripped artifact at `target/deploy/proofline_adapter.so` is **374,816 bytes**. The build intermediate is 471,240 bytes; the smaller deploy artifact is the relevant estimate.

Upgradeable-loader sizing for the current artifact:

| Account | Data size | Finalized mainnet rent query at 07:43 ET |
| --- | ---: | ---: |
| Program | 36 bytes | 0.001141440 SOL |
| ProgramData | 45 + 374,816 = 374,861 bytes | 2.609923440 SOL |
| Upload buffer (transient) | 37 + 374,816 = 374,853 bytes | 2.609867760 SOL |

The upload buffer's balance is reused/consumed during initial deployment; it is not an additional permanent 2.61 SOL. The permanent rent floor is therefore approximately:

`2.609923440 + 0.001141440 = 2.611064880 SOL`

Against **0.229 SOL available**, the bare rent shortfall is:

`2.611064880 - 0.229 = 2.382064880 SOL`

Deployment also needs hundreds of upload transactions for a 375 KB binary, the final deploy transaction, initialization, and tests. At the current 5,000-lamport base fee per signature, upload/base fees should remain in the low thousandths of SOL, but retries and priority fees are workload-dependent. A bare-minimum top-up would be roughly **2.39 SOL**. A prudent funding target is a **2.65 SOL wallet balance**, requiring a **2.421 SOL top-up**. This estimate uses today's finalized `getMinimumBalanceForRentExemption` results; re-query immediately before any approved spend.

The Solana CLI now defaults initial `max-len` to the current program length. Reserving substantial upgrade headroom increases rent linearly. The older 2× allocation convention would put this artifact near 5.22 SOL permanent rent and should not be selected under this budget.

References: Solana documents the current 5,000-lamport/signature base fee and optional priority-fee formula in its [fee structure](https://solana.com/docs/core/fees/fee-structure). Loader-v3 is the normal upgradeable deployment model; the installed CLI reports `--max-len` defaults to the original program length.

#### Time and feasibility

- Replace the false ABI with the pinned official binding and remodel outcome derivation: 2–4 hours.
- Add validator/integration coverage for CPI account/PDA/return behavior: 1–2 hours.
- Validate Wormhole Core CPI end-to-end and fix likely integration issues: 1–3 hours.
- Add mainnet config, program-identity authorization, initialization checks, upgrade-authority decision, deploy client, and smoke tests: 1–2 hours.
- Fund, upload, deploy, initialize, and inspect: 15–45 minutes if the network and RPC behave.

**Honest estimate: 5–10 engineering hours plus funding/authorization, with material tail risk.** It cannot be made responsibly ready for the 14:30 ET recording freeze, and the signer constraint alone prevents it under the current authorization.

**Verdict: NO-GO. Do not fund this option today.**

### B. NO-DEPLOY HONEST PATH — real root/proof reads plus Memo

#### Proposed evidence chain

```text
TxLINE final event
  -> raw /stat-validation proof (two authenticated headers)
  -> timestamp-derived daily_scores_roots PDA
  -> finalized mainnet account read
  -> exact official validateStatV2 .view() on 2+ RPCs
  -> canonical evidence bundle + exact instruction hash
  -> signed Proofline v1 Memo transaction
  -> finalized transaction fetched back and decoded
```

Use the already-working capture/verification implementation rather than Proofline's placeholder builder. The official client has already replayed a historical proof through deployed mainnet `validateStatV2` and received `true`; the local capture directory also already contains multiple real historical proof bundles and an active directory for final fixture `18257739`. Credential values were not inspected; only the access-file key names were checked, confirming the expected JWT/API-token/wallet metadata shape.

#### Attestation format

Keep the memo compact and versioned, for example:

```text
proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=f7e3bcd5db4c6744445f75dfab7eccc879c6d2de
```

Rules:

- `bundle` is a documented canonical hash of the complete verbatim proof response, strategy, root, and final record—not of a UI summary.
- `ix` hashes the exact Anchor/Borsh instruction bytes actually simulated.
- `root` is derived from the proof timestamp and its account owner/existence are checked at finalized commitment.
- `result` is derived from proof stat values, never from defaulted snapshot fields.
- The fee payer signs the transaction; include its public key in the evidence manifest and verify it on readback.
- One deterministic attestation ID per `(cluster, TxLINE program, fixture, sequence, root, ix, bundle)`. A correction must use an explicit `supersedes=<signature>` field; never silently overwrite.
- Preserve the complete evidence bundle outside the memo and make the verifier available to judges. A 32-byte digest without the preimage is not independently useful.

Solana transactions are limited to 1,232 bytes, so a digest-oriented memo is appropriate; do not try to put the proof itself in the transaction. The [Solana Memo documentation](https://solana.com/docs/payments/send-payments/payment-with-memo) confirms that memo text is permanently recorded in transaction logs and visible through RPC/explorers.

#### Cost

A one-signer Memo transaction creates no account and pays no rent. At the current base fee:

- base cost: **5,000 lamports = 0.000005 SOL per transaction**;
- theoretical capacity of 0.229 SOL: **45,800 memo transactions** at base fee only;
- preserving 0.020 SOL and assuming no priority fee: **41,800 transactions**;
- even at 0.000015 SOL total per transaction (base plus a generous 10,000-lamport priority allowance): about **13,933 transactions** after that reserve.

The final requires only a handful: optionally one “capture started” marker, one per significant proof-backed event, and one final attestation. Re-query fees immediately before broadcast and cap any priority fee explicitly.

#### Does it deliver “can't fake”?

**Yes, for a carefully worded claim:** it proves that the authorized burner signed a specific digest/reference at a mainnet slot; that the referenced TxLINE root account existed on mainnet; and—if the raw proof is published—that any judge can independently run the exact deployed TxLINE verifier against that root and reproduce `true`.

**No, for the stronger claim:** the Memo program itself does not enforce the proof, and an operator could sign a false memo. RPC simulation output is not persisted as consensus state. Multiple finalized RPC reads and a public reproducible proof make deception detectable, but do not turn it into a Proofline smart-contract verdict.

The recording narration should be: **“real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet.”** It should not say **“Proofline verified the proof on-chain.”**

#### Time

Using the adjacent capture and official verifier code: **2–3.5 hours to a rehearsed path**, including memo schema/decoder, artifact canonicalization, multi-RPC verification, confirmation/readback, and UI/recording evidence. This is feasible before 14:30 ET with a hard scope freeze.

### C. HYBRID — recommended

For today's final:

- Use Option B for the live Solana mainnet evidence.
- Continue showing the already-real Base Sepolia delivery/settlement receipts as a separate exercised leg.
- Keep Wormhole and CRE labeled simulated.
- Do not visually imply that today's Memo caused the existing Base settlement unless a separately identified, real relay transaction actually does so.
- After the hackathon, replace the adapter ABI with `txline-kit-cpi`, integrate/test Wormhole, arrange a program identity and funding, then deploy deliberately.

This produces more real evidence today than rushing an unusable program: the roots, deployed TxLINE verification, attestation signature, slot, and explorer transaction are all real, while every remaining trust boundary is stated accurately.

## 3. Recommendation and timed work plan

### Go/no-go decision

**GO: HYBRID/no-deploy.**  
**NO-GO: FULL, even if Liam offers funding today.** Funding does not cure the wrong ABI, missing integration tests, or unauthorized second signer.

### Mandatory before the first mainnet Memo

1. **Delete the placeholder from the real path.** The transaction bytes must come from the pinned official TxLINE IDL/client; assert discriminator and, preferably, match a Rust/TypeScript golden vector.
2. **Use the real proof endpoint.** Capture the complete verbatim V2 response with both required auth headers; never substitute Proofline's synthetic proof/root template.
3. **Bind the correct root.** Derive `daily_scores_roots` from `summary.updateStats.minTimestamp`, assert it equals the account passed to `validateStatV2`, read it at `finalized`, and record slot, owner, and account-data hash.
4. **Prove exact values.** Use exact-equality predicates for the requested score stat indices. No zero defaults, guessed key names, or snapshot-only score assertions.
5. **Require reproducible success.** Get `true` from at least two independent mainnet RPC providers using identical serialized instruction data; reject missing/wrong-program/malformed return data and any differing stable result.
6. **Canonicalize evidence once.** Define and test deterministic bundle hashing; persist raw proof, exact instruction bytes, strategy, RPC results, root read, and final record. Memo only the compact identities.
7. **Add transaction safety rails.** Hardcode/allowlist mainnet cluster, TxLINE program, Memo program, authorized signer public key, maximum fee/priority fee, and expected memo schema. Default to dry-run. Require an explicit operator broadcast flag and show decoded contents before signing.
8. **Confirm what landed.** Wait for `finalized`, fetch the transaction from a second RPC, verify success, signer, cluster, Memo program, and byte-exact memo, then produce the explorer link.
9. **Fix the claim/UI.** Display “client-verified + memo-anchored,” expose proof/root/instruction/bundle identities, and keep Wormhole/CRE simulation badges visible.
10. **Historical rehearsal.** Run the entire read/verify/hash/build/decode/readback pipeline on an already-captured historical V2 proof. No live-final code should be first exercised after kickoff.

### Work schedule, Eastern Time

| Time | Gate/work |
| --- | --- |
| 08:00–08:15 | Liam go/no-go: approve HYBRID wording and freeze FULL. Assign one implementation owner; preserve the active capture process. |
| 08:15–09:15 | Wire raw capture proof -> pinned official TxLINE verifier -> deterministic evidence bundle. Add strict final/stat/PDA checks. |
| 09:15–10:00 | Historical proof rehearsal against 2+ mainnet RPCs at finalized commitment. Compare exact instruction bytes and results. Fix any discrepancy before proceeding. |
| 10:00–10:45 | Implement compact Memo v1 builder, local decoder, deterministic ID, signer/program/cluster/fee allowlists, dry-run default, and readback verifier. |
| 10:45–11:30 | End-to-end historical rehearsal. If Liam explicitly authorizes spend, one historical mainnet Memo smoke test costs about 0.000005 SOL plus any capped priority fee; otherwise validate unsigned/local serialization and defer the first broadcast. |
| 11:30–12:30 | Add the evidence view/recording surface: RPC slots, root, proof result, memo preview/signature, explorer link, and explicit trust wording. |
| 12:30–13:15 | Failure drills: expired JWT renewal with same API token, proof-not-yet-indexed retry, RPC disagreement/rate limit, transaction expiry/resign, delayed finalisation, and duplicate suppression. |
| 13:15–14:00 | Operator rehearsal with screen capture; verify final fixture `18257739`, capture services, disk, clocks, and two RPC endpoints without exposing credentials. |
| 14:00–14:30 | Code/config freeze and recording setup. Start a clean evidence run and capture-start marker only if explicitly authorized. |
| 15:00 onward | Record kickoff/live data. Memo only meaningful proof-backed checkpoints. After finalisation, retry proof retrieval through the next five-minute indexing window, run both RPC verifications, post the final memo, wait for finalized readback, then capture explorer/evidence screens. |
| By 19:30 | Preserve at least 30 minutes of contingency before the 19:59:59 submission deadline. Do not let a missing Memo block submission of the already-working honest demo. |

### Abort/fallback rules

- If the historical proof does not return identical `true` on two RPCs by 10:00 ET, do not build the live claim on RPC screenshots; fix the verifier or fall back to raw root read plus explicitly unverified memo wording.
- If the Memo path is not rehearsed end-to-end by 11:30 ET, freeze it out of the critical UI and record the real root/read-only verifier separately rather than improvising a transaction live.
- If final proof indexing is delayed, keep recording and retry with bounded backoff. Never memo “verified” before `validateStatV2` returns exact `true`.
- Never pivot back to FULL today. Its blockers are architectural and authorization-related, not schedule padding.

## Post-deadline FULL checklist

Before any later adapter deployment:

1. replace the hand-written TxLINE types with the pinned `txline-kit-cpi` crate and lock the IDL revision;
2. derive every attested field from the verified payload and deterministic bytes;
3. enforce the known TxLINE mainnet program and timestamp-derived root PDA;
4. add program-test plus a mainnet read-only rehearsal and a real consumer CPI transaction on an appropriate test environment;
5. integrate Wormhole using a maintained SDK/version or prove the raw CPI against a validator and test emission/VAA observation;
6. establish an explicitly authorized program identity and upgrade-authority policy;
7. regenerate size/rent estimates, fund only after review, deploy upgradeable for smoke tests, verify source/binary, then consider `--final` or governed authority;
8. obtain an independent security review of the exact deploy commit.

## Review limitations

This was a deadline-prioritized, read-only review. No keypair was read, no credential value was printed, no transaction was constructed/simulated/signed/sent, and no deployment was attempted. The only project write is this report. Existing build/test logs were inspected rather than rerunning commands that would write caches/artifacts. The lane had one pre-existing untracked `apps/web/.gitignore`; it was not touched.
++ b/proofline/workspace/proofline/docs/codex-mainnet-review.md
# Proofline pre-mainnet review and deploy plan

**Review time:** 2026-07-19, 07:55 ET  
**Review target:** commit `99bd4eab96c90bc7a4eb09b971d1f669706c7122` on `main`  
**Decision:** **NO-GO for the custom-program deployment. GO for a tightly scoped no-deploy mainnet attestation path, with the mandatory fixes below.**

## Executive verdict

Proofline is a strong hackathon prototype with unusually good honesty labeling, clean package boundaries, cross-language payload vectors, a real exercised Base Sepolia leg, and good unit/conformance coverage. It is good submission material.

It is **not good to ship as a new Solana mainnet program today**. The central Solana adapter does not implement TxLINE's real `validate_stat_v2` ABI. It compiles and its unit tests pass because those tests exercise Proofline's own invented flat argument shape, not the deployed TxLINE program. There is no validator/CPI integration test. The Level 3 “canonical transaction” is likewise a textual placeholder rather than an Anchor/Borsh TxLINE instruction. A mainnet deployment would therefore be expensive, outside the stated signer authorization, and functionally incapable of performing the advertised verification.

The honest path that can be made ready before 14:30 ET is:

1. capture the final and its real TxLINE V2 proof using the already-working two-header API flow;
2. derive and read the real mainnet daily-root PDA at `finalized` commitment;
3. execute TxLINE's deployed `validateStatV2` as a read-only mainnet `.view()`/`simulateTransaction` using the official IDL and exact proof/strategy;
4. hash and preserve the complete evidence bundle; and
5. sign a compact Proofline attestation containing those identities in a normal Solana Memo transaction.

That provides real, timestamped, independently reproducible mainnet evidence. It does **not** turn client-side verification into trustless on-chain verification, and the recording must say that plainly.

## 1. Quality review

### Architecture and code-quality verdict

What is good:

- The real/simulated boundary is prominent in `README.md:42-55`, not buried.
- Protocol hashing and payload encoding have TypeScript, Rust, and Solidity conformance coverage.
- The Base contracts have meaningful happy-path, ordering, replay, conflict, guardian-quorum, emitter, and payload-tamper tests.
- The event-sourced UI and `sim:` signature convention make it difficult to accidentally present a simulated receipt as a chain receipt.
- Return-data origin checking is conceptually correct: an eventual adapter must require both the TxLINE program ID and an exact boolean return.
- The adjacent TxLINE tooling is substantially more production-ready than Proofline's current Solana integration: it has a pinned official ABI, exact serialization vectors, safe daily-root derivation, and recorded successful mainnet `.view()` verification.

Validation evidence already present in the lane, generated between 06:58 and 07:14 ET today:

- TypeScript typecheck: 16/16 workspaces passed.
- TypeScript tests: 3/3 test-bearing workspaces passed.
- Foundry: 25/25 tests passed.
- Anchor/Rust: build completed and unit/conformance tests passed, with 18 macro/config warnings.
- SBF deploy artifact exists and is 374,816 bytes.

These are useful health signals, but none exercises the Proofline adapter against the deployed TxLINE program or Wormhole Core.

### Mandatory blockers and bugs

#### P0 — The Solana adapter uses the wrong TxLINE ABI

`programs/proofline-adapter/.../txline/idl_types.rs:21-47` defines `validate_stat_v2` as:

`fixture_id, sequence, period, participant_1_score, participant_2_score, proof: Vec<u8>`.

TxLINE's published IDL defines two arguments: a structured `StatValidationInput` and an `NDimensionalStrategy`. The official CPI binding pins discriminator `[208,215,194,214,241,71,246,178]` and serializes the full proof hierarchy, proof-node directions, stat leaves, and strategy. The deployed instruction also has a timestamp-derived `daily_scores_roots` PDA invariant.

**Impact:** the current CPI instruction cannot successfully call deployed mainnet TxLINE. FULL must not deploy until the hand-written ABI is removed and the pinned `txline-kit-cpi` binding is used or reproduced byte-for-byte.

#### P0 — The claimed Level 3 “canonical transaction” is not a TxLINE transaction

`packages/config/src/cre-runtime.ts:348-359` explicitly encodes UTF-8 text such as `validate_stat_v2:fixture=...`; it is not the Anchor discriminator plus Borsh payload and strategy. `workflows/cre-level3-attestor/main.ts:127-165` then returns a locally manufactured `true` response for that transaction. `apps/relay-cli/src/verify-evidence.ts:109-129` verifies the same textual placeholder.

**Impact:** all hashes may be internally consistent while proving nothing about TxLINE. Do not reuse `canonicalValidateStatV2Data`, the existing Level 3 simulation builder, or its “verification” result in the real-mainnet path.

#### P0 — The live Proofline path discards the real proof leg

`packages/txline-sdk/src/scores/live-snapshot.ts:11-15,115-157` treats proof/root data as unavailable and injects synthetic template values. That premise is stale: the configured two-header API flow can retrieve `/api/scores/stat-validation`, and the capture repository already contains real proof bundles plus a working mainnet verifier.

**Impact:** merely switching Proofline's current config to `mode: live` still produces synthetic roots/proofs. The no-deploy path must consume raw capture proof responses, not this template path.

#### P0 — Final-score detection/mapping is unsafe for the live final

`isFinalRecord` requires action, status ID, and period all to match exactly. Real provider finalisation records may omit period. The live mapper probes unconfirmed field names and defaults missing scores and period to zero (`live-snapshot.ts:79-92`).

**Impact:** the pipeline can miss the final or manufacture a 0–0 shape from absent fields. Use the observed finalisation record to select the sequence, then take attested score values from the returned V2 proof's requested stat leaves. Never default a field that enters an attestation.

#### P0 — A memo alone does not prove that verification ran

A Solana signature proves that the authorized key signed the exact memo in a transaction finalized at a slot. The Memo program does not execute TxLINE, validate a Merkle path, or enforce truthful memo contents.

**Required mitigation:** publish/preserve the full raw proof bundle, hash it canonically, bind that digest plus the exact serialized TxLINE instruction digest and root address into the memo, and provide a one-command independent verifier. Use at least two independent RPCs for the `.view()` result and record finalized slots. The UI must say “client-verified against TxLINE mainnet; attestation anchored by Memo,” not “verified on-chain by Proofline.”

#### P1 — The adapter trusts caller-supplied provenance fields

`proof_timestamp_ms` and `proof_bundle_hash` are caller inputs (`verify_outcome.rs:26-45`), and the comment says bundle correctness is enforced by equality on Base. In the current system, both lanes consume the same operator-controlled fixture/handoff, so equality is consistency, not independent correctness.

**FULL-path requirement:** parse/accept the official TxLINE payload, derive the proof timestamp, fixture, score values, sequence/stat identity, daily-root PDA, and deterministic bundle/instruction hash from those exact bytes on-chain. Do not allow a relayer to choose provenance independently of the verified payload.

#### P1 — Deployment configuration is not mainnet-safe

`Anchor.toml:8-16` declares only `localnet` and points at the default local wallet. `initialize_config` accepts arbitrary program IDs, destination chain, and forwarder with no known-mainnet constant checks. There is no initialize/deploy/smoke-test runbook, no mainnet IDL/client configuration, and no upgrade-authority ceremony.

The declared program identity also requires a program-address signer on initial deployment. That is a second signing identity beyond the sole authorized mainnet burner, so FULL conflicts with the authorization in this brief even if funding appears.

#### P1 — Wormhole publication is unproven integration code

The hand-written Wormhole CPI has only pure layout/parser unit tests. There is no local-validator or mainnet-compatible integration test proving account creation, account ordering, fee handling, message posting, or VAA observation. The program's own header calls it unaudited reference source and advises against deadline-day deployment (`lib.rs:8-16`). Treat that warning as correct.

### Ship verdict by component

| Component | Verdict today |
| --- | --- |
| Base Sepolia contracts and recorded receipts | Ship as the already-labeled real Base leg |
| Simulated Wormhole/CRE demo | Ship only with current simulation labels |
| Current Proofline live TxLINE snapshot path | Do not use for proof claims |
| Custom Solana adapter | **Do not deploy** |
| New proof-backed Memo attestation path | Ship after the P0 no-deploy fixes and a historical rehearsal |

## 2. Mainnet options

### A. FULL — compile and deploy the Anchor adapter

#### Cost

The actual stripped artifact at `target/deploy/proofline_adapter.so` is **374,816 bytes**. The build intermediate is 471,240 bytes; the smaller deploy artifact is the relevant estimate.

Upgradeable-loader sizing for the current artifact:

| Account | Data size | Finalized mainnet rent query at 07:43 ET |
| --- | ---: | ---: |
| Program | 36 bytes | 0.001141440 SOL |
| ProgramData | 45 + 374,816 = 374,861 bytes | 2.609923440 SOL |
| Upload buffer (transient) | 37 + 374,816 = 374,853 bytes | 2.609867760 SOL |

The upload buffer's balance is reused/consumed during initial deployment; it is not an additional permanent 2.61 SOL. The permanent rent floor is therefore approximately:

`2.609923440 + 0.001141440 = 2.611064880 SOL`

Against **0.229 SOL available**, the bare rent shortfall is:

`2.611064880 - 0.229 = 2.382064880 SOL`

Deployment also needs hundreds of upload transactions for a 375 KB binary, the final deploy transaction, initialization, and tests. At the current 5,000-lamport base fee per signature, upload/base fees should remain in the low thousandths of SOL, but retries and priority fees are workload-dependent. A bare-minimum top-up would be roughly **2.39 SOL**. A prudent funding target is a **2.65 SOL wallet balance**, requiring a **2.421 SOL top-up**. This estimate uses today's finalized `getMinimumBalanceForRentExemption` results; re-query immediately before any approved spend.

The Solana CLI now defaults initial `max-len` to the current program length. Reserving substantial upgrade headroom increases rent linearly. The older 2× allocation convention would put this artifact near 5.22 SOL permanent rent and should not be selected under this budget.

References: Solana documents the current 5,000-lamport/signature base fee and optional priority-fee formula in its [fee structure](https://solana.com/docs/core/fees/fee-structure). Loader-v3 is the normal upgradeable deployment model; the installed CLI reports `--max-len` defaults to the original program length.

#### Time and feasibility

- Replace the false ABI with the pinned official binding and remodel outcome derivation: 2–4 hours.
- Add validator/integration coverage for CPI account/PDA/return behavior: 1–2 hours.
- Validate Wormhole Core CPI end-to-end and fix likely integration issues: 1–3 hours.
- Add mainnet config, program-identity authorization, initialization checks, upgrade-authority decision, deploy client, and smoke tests: 1–2 hours.
- Fund, upload, deploy, initialize, and inspect: 15–45 minutes if the network and RPC behave.

**Honest estimate: 5–10 engineering hours plus funding/authorization, with material tail risk.** It cannot be made responsibly ready for the 14:30 ET recording freeze, and the signer constraint alone prevents it under the current authorization.

**Verdict: NO-GO. Do not fund this option today.**

### B. NO-DEPLOY HONEST PATH — real root/proof reads plus Memo

#### Proposed evidence chain

```text
TxLINE final event
  -> raw /stat-validation proof (two authenticated headers)
  -> timestamp-derived daily_scores_roots PDA
  -> finalized mainnet account read
  -> exact official validateStatV2 .view() on 2+ RPCs
  -> canonical evidence bundle + exact instruction hash
  -> signed Proofline v1 Memo transaction
  -> finalized transaction fetched back and decoded
```

Use the already-working capture/verification implementation rather than Proofline's placeholder builder. The official client has already replayed a historical proof through deployed mainnet `validateStatV2` and received `true`; the local capture directory also already contains multiple real historical proof bundles and an active directory for final fixture `18257739`. Credential values were not inspected; only the access-file key names were checked, confirming the expected JWT/API-token/wallet metadata shape.

#### Attestation format

Keep the memo compact and versioned, for example:

```text
proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=f7e3bcd5db4c6744445f75dfab7eccc879c6d2de
```

Rules:

- `bundle` is a documented canonical hash of the complete verbatim proof response, strategy, root, and final record—not of a UI summary.
- `ix` hashes the exact Anchor/Borsh instruction bytes actually simulated.
- `root` is derived from the proof timestamp and its account owner/existence are checked at finalized commitment.
- `result` is derived from proof stat values, never from defaulted snapshot fields.
- The fee payer signs the transaction; include its public key in the evidence manifest and verify it on readback.
- One deterministic attestation ID per `(cluster, TxLINE program, fixture, sequence, root, ix, bundle)`. A correction must use an explicit `supersedes=<signature>` field; never silently overwrite.
- Preserve the complete evidence bundle outside the memo and make the verifier available to judges. A 32-byte digest without the preimage is not independently useful.

Solana transactions are limited to 1,232 bytes, so a digest-oriented memo is appropriate; do not try to put the proof itself in the transaction. The [Solana Memo documentation](https://solana.com/docs/payments/send-payments/payment-with-memo) confirms that memo text is permanently recorded in transaction logs and visible through RPC/explorers.

#### Cost

A one-signer Memo transaction creates no account and pays no rent. At the current base fee:

- base cost: **5,000 lamports = 0.000005 SOL per transaction**;
- theoretical capacity of 0.229 SOL: **45,800 memo transactions** at base fee only;
- preserving 0.020 SOL and assuming no priority fee: **41,800 transactions**;
- even at 0.000015 SOL total per transaction (base plus a generous 10,000-lamport priority allowance): about **13,933 transactions** after that reserve.

The final requires only a handful: optionally one “capture started” marker, one per significant proof-backed event, and one final attestation. Re-query fees immediately before broadcast and cap any priority fee explicitly.

#### Does it deliver “can't fake”?

**Yes, for a carefully worded claim:** it proves that the authorized burner signed a specific digest/reference at a mainnet slot; that the referenced TxLINE root account existed on mainnet; and—if the raw proof is published—that any judge can independently run the exact deployed TxLINE verifier against that root and reproduce `true`.

**No, for the stronger claim:** the Memo program itself does not enforce the proof, and an operator could sign a false memo. RPC simulation output is not persisted as consensus state. Multiple finalized RPC reads and a public reproducible proof make deception detectable, but do not turn it into a Proofline smart-contract verdict.

The recording narration should be: **“real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet.”** It should not say **“Proofline verified the proof on-chain.”**

#### Time

Using the adjacent capture and official verifier code: **2–3.5 hours to a rehearsed path**, including memo schema/decoder, artifact canonicalization, multi-RPC verification, confirmation/readback, and UI/recording evidence. This is feasible before 14:30 ET with a hard scope freeze.

### C. HYBRID — recommended

For today's final:

- Use Option B for the live Solana mainnet evidence.
- Continue showing the already-real Base Sepolia delivery/settlement receipts as a separate exercised leg.
- Keep Wormhole and CRE labeled simulated.
- Do not visually imply that today's Memo caused the existing Base settlement unless a separately identified, real relay transaction actually does so.
- After the hackathon, replace the adapter ABI with `txline-kit-cpi`, integrate/test Wormhole, arrange a program identity and funding, then deploy deliberately.

This produces more real evidence today than rushing an unusable program: the roots, deployed TxLINE verification, attestation signature, slot, and explorer transaction are all real, while every remaining trust boundary is stated accurately.

## 3. Recommendation and timed work plan

### Go/no-go decision

**GO: HYBRID/no-deploy.**  
**NO-GO: FULL, even if Liam offers funding today.** Funding does not cure the wrong ABI, missing integration tests, or unauthorized second signer.

### Mandatory before the first mainnet Memo

1. **Delete the placeholder from the real path.** The transaction bytes must come from the pinned official TxLINE IDL/client; assert discriminator and, preferably, match a Rust/TypeScript golden vector.
2. **Use the real proof endpoint.** Capture the complete verbatim V2 response with both required auth headers; never substitute Proofline's synthetic proof/root template.
3. **Bind the correct root.** Derive `daily_scores_roots` from `summary.updateStats.minTimestamp`, assert it equals the account passed to `validateStatV2`, read it at `finalized`, and record slot, owner, and account-data hash.
4. **Prove exact values.** Use exact-equality predicates for the requested score stat indices. No zero defaults, guessed key names, or snapshot-only score assertions.
5. **Require reproducible success.** Get `true` from at least two independent mainnet RPC providers using identical serialized instruction data; reject missing/wrong-program/malformed return data and any differing stable result.
6. **Canonicalize evidence once.** Define and test deterministic bundle hashing; persist raw proof, exact instruction bytes, strategy, RPC results, root read, and final record. Memo only the compact identities.
7. **Add transaction safety rails.** Hardcode/allowlist mainnet cluster, TxLINE program, Memo program, authorized signer public key, maximum fee/priority fee, and expected memo schema. Default to dry-run. Require an explicit operator broadcast flag and show decoded contents before signing.
8. **Confirm what landed.** Wait for `finalized`, fetch the transaction from a second RPC, verify success, signer, cluster, Memo program, and byte-exact memo, then produce the explorer link.
9. **Fix the claim/UI.** Display “client-verified + memo-anchored,” expose proof/root/instruction/bundle identities, and keep Wormhole/CRE simulation badges visible.
10. **Historical rehearsal.** Run the entire read/verify/hash/build/decode/readback pipeline on an already-captured historical V2 proof. No live-final code should be first exercised after kickoff.

### Work schedule, Eastern Time

| Time | Gate/work |
| --- | --- |
| 08:00–08:15 | Liam go/no-go: approve HYBRID wording and freeze FULL. Assign one implementation owner; preserve the active capture process. |
| 08:15–09:15 | Wire raw capture proof -> pinned official TxLINE verifier -> deterministic evidence bundle. Add strict final/stat/PDA checks. |
| 09:15–10:00 | Historical proof rehearsal against 2+ mainnet RPCs at finalized commitment. Compare exact instruction bytes and results. Fix any discrepancy before proceeding. |
| 10:00–10:45 | Implement compact Memo v1 builder, local decoder, deterministic ID, signer/program/cluster/fee allowlists, dry-run default, and readback verifier. |
| 10:45–11:30 | End-to-end historical rehearsal. If Liam explicitly authorizes spend, one historical mainnet Memo smoke test costs about 0.000005 SOL plus any capped priority fee; otherwise validate unsigned/local serialization and defer the first broadcast. |
| 11:30–12:30 | Add the evidence view/recording surface: RPC slots, root, proof result, memo preview/signature, explorer link, and explicit trust wording. |
| 12:30–13:15 | Failure drills: expired JWT renewal with same API token, proof-not-yet-indexed retry, RPC disagreement/rate limit, transaction expiry/resign, delayed finalisation, and duplicate suppression. |
| 13:15–14:00 | Operator rehearsal with screen capture; verify final fixture `18257739`, capture services, disk, clocks, and two RPC endpoints without exposing credentials. |
| 14:00–14:30 | Code/config freeze and recording setup. Start a clean evidence run and capture-start marker only if explicitly authorized. |
| 15:00 onward | Record kickoff/live data. Memo only meaningful proof-backed checkpoints. After finalisation, retry proof retrieval through the next five-minute indexing window, run both RPC verifications, post the final memo, wait for finalized readback, then capture explorer/evidence screens. |
| By 19:30 | Preserve at least 30 minutes of contingency before the 19:59:59 submission deadline. Do not let a missing Memo block submission of the already-working honest demo. |

### Abort/fallback rules

- If the historical proof does not return identical `true` on two RPCs by 10:00 ET, do not build the live claim on RPC screenshots; fix the verifier or fall back to raw root read plus explicitly unverified memo wording.
- If the Memo path is not rehearsed end-to-end by 11:30 ET, freeze it out of the critical UI and record the real root/read-only verifier separately rather than improvising a transaction live.
- If final proof indexing is delayed, keep recording and retry with bounded backoff. Never memo “verified” before `validateStatV2` returns exact `true`.
- Never pivot back to FULL today. Its blockers are architectural and authorization-related, not schedule padding.

## Post-deadline FULL checklist

Before any later adapter deployment:

1. replace the hand-written TxLINE types with the pinned `txline-kit-cpi` crate and lock the IDL revision;
2. derive every attested field from the verified payload and deterministic bytes;
3. enforce the known TxLINE mainnet program and timestamp-derived root PDA;
4. add program-test plus a mainnet read-only rehearsal and a real consumer CPI transaction on an appropriate test environment;
5. integrate Wormhole using a maintained SDK/version or prove the raw CPI against a validator and test emission/VAA observation;
6. establish an explicitly authorized program identity and upgrade-authority policy;
7. regenerate size/rent estimates, fund only after review, deploy upgradeable for smoke tests, verify source/binary, then consider `--final` or governed authority;
8. obtain an independent security review of the exact deploy commit.

## Review limitations

This was a deadline-prioritized, read-only review. No keypair was read, no credential value was printed, no transaction was constructed/simulated/signed/sent, and no deployment was attempted. The only project write is this report. Existing build/test logs were inspected rather than rerunning commands that would write caches/artifacts. The lane had one pre-existing untracked `apps/web/.gitignore`; it was not touched.
++ b/proofline/workspace/proofline/docs/codex-mainnet-review.md
# Proofline pre-mainnet review and deploy plan

**Review time:** 2026-07-19, 07:55 ET  
**Review target:** commit `99bd4eab96c90bc7a4eb09b971d1f669706c7122` on `main`  
**Decision:** **NO-GO for the custom-program deployment. GO for a tightly scoped no-deploy mainnet attestation path, with the mandatory fixes below.**

## Executive verdict

Proofline is a strong hackathon prototype with unusually good honesty labeling, clean package boundaries, cross-language payload vectors, a real exercised Base Sepolia leg, and good unit/conformance coverage. It is good submission material.

It is **not good to ship as a new Solana mainnet program today**. The central Solana adapter does not implement TxLINE's real `validate_stat_v2` ABI. It compiles and its unit tests pass because those tests exercise Proofline's own invented flat argument shape, not the deployed TxLINE program. There is no validator/CPI integration test. The Level 3 “canonical transaction” is likewise a textual placeholder rather than an Anchor/Borsh TxLINE instruction. A mainnet deployment would therefore be expensive, outside the stated signer authorization, and functionally incapable of performing the advertised verification.

The honest path that can be made ready before 14:30 ET is:

1. capture the final and its real TxLINE V2 proof using the already-working two-header API flow;
2. derive and read the real mainnet daily-root PDA at `finalized` commitment;
3. execute TxLINE's deployed `validateStatV2` as a read-only mainnet `.view()`/`simulateTransaction` using the official IDL and exact proof/strategy;
4. hash and preserve the complete evidence bundle; and
5. sign a compact Proofline attestation containing those identities in a normal Solana Memo transaction.

That provides real, timestamped, independently reproducible mainnet evidence. It does **not** turn client-side verification into trustless on-chain verification, and the recording must say that plainly.

## 1. Quality review

### Architecture and code-quality verdict

What is good:

- The real/simulated boundary is prominent in `README.md:42-55`, not buried.
- Protocol hashing and payload encoding have TypeScript, Rust, and Solidity conformance coverage.
- The Base contracts have meaningful happy-path, ordering, replay, conflict, guardian-quorum, emitter, and payload-tamper tests.
- The event-sourced UI and `sim:` signature convention make it difficult to accidentally present a simulated receipt as a chain receipt.
- Return-data origin checking is conceptually correct: an eventual adapter must require both the TxLINE program ID and an exact boolean return.
- The adjacent TxLINE tooling is substantially more production-ready than Proofline's current Solana integration: it has a pinned official ABI, exact serialization vectors, safe daily-root derivation, and recorded successful mainnet `.view()` verification.

Validation evidence already present in the lane, generated between 06:58 and 07:14 ET today:

- TypeScript typecheck: 16/16 workspaces passed.
- TypeScript tests: 3/3 test-bearing workspaces passed.
- Foundry: 25/25 tests passed.
- Anchor/Rust: build completed and unit/conformance tests passed, with 18 macro/config warnings.
- SBF deploy artifact exists and is 374,816 bytes.

These are useful health signals, but none exercises the Proofline adapter against the deployed TxLINE program or Wormhole Core.

### Mandatory blockers and bugs

#### P0 — The Solana adapter uses the wrong TxLINE ABI

`programs/proofline-adapter/.../txline/idl_types.rs:21-47` defines `validate_stat_v2` as:

`fixture_id, sequence, period, participant_1_score, participant_2_score, proof: Vec<u8>`.

TxLINE's published IDL defines two arguments: a structured `StatValidationInput` and an `NDimensionalStrategy`. The official CPI binding pins discriminator `[208,215,194,214,241,71,246,178]` and serializes the full proof hierarchy, proof-node directions, stat leaves, and strategy. The deployed instruction also has a timestamp-derived `daily_scores_roots` PDA invariant.

**Impact:** the current CPI instruction cannot successfully call deployed mainnet TxLINE. FULL must not deploy until the hand-written ABI is removed and the pinned `txline-kit-cpi` binding is used or reproduced byte-for-byte.

#### P0 — The claimed Level 3 “canonical transaction” is not a TxLINE transaction

`packages/config/src/cre-runtime.ts:348-359` explicitly encodes UTF-8 text such as `validate_stat_v2:fixture=...`; it is not the Anchor discriminator plus Borsh payload and strategy. `workflows/cre-level3-attestor/main.ts:127-165` then returns a locally manufactured `true` response for that transaction. `apps/relay-cli/src/verify-evidence.ts:109-129` verifies the same textual placeholder.

**Impact:** all hashes may be internally consistent while proving nothing about TxLINE. Do not reuse `canonicalValidateStatV2Data`, the existing Level 3 simulation builder, or its “verification” result in the real-mainnet path.

#### P0 — The live Proofline path discards the real proof leg

`packages/txline-sdk/src/scores/live-snapshot.ts:11-15,115-157` treats proof/root data as unavailable and injects synthetic template values. That premise is stale: the configured two-header API flow can retrieve `/api/scores/stat-validation`, and the capture repository already contains real proof bundles plus a working mainnet verifier.

**Impact:** merely switching Proofline's current config to `mode: live` still produces synthetic roots/proofs. The no-deploy path must consume raw capture proof responses, not this template path.

#### P0 — Final-score detection/mapping is unsafe for the live final

`isFinalRecord` requires action, status ID, and period all to match exactly. Real provider finalisation records may omit period. The live mapper probes unconfirmed field names and defaults missing scores and period to zero (`live-snapshot.ts:79-92`).

**Impact:** the pipeline can miss the final or manufacture a 0–0 shape from absent fields. Use the observed finalisation record to select the sequence, then take attested score values from the returned V2 proof's requested stat leaves. Never default a field that enters an attestation.

#### P0 — A memo alone does not prove that verification ran

A Solana signature proves that the authorized key signed the exact memo in a transaction finalized at a slot. The Memo program does not execute TxLINE, validate a Merkle path, or enforce truthful memo contents.

**Required mitigation:** publish/preserve the full raw proof bundle, hash it canonically, bind that digest plus the exact serialized TxLINE instruction digest and root address into the memo, and provide a one-command independent verifier. Use at least two independent RPCs for the `.view()` result and record finalized slots. The UI must say “client-verified against TxLINE mainnet; attestation anchored by Memo,” not “verified on-chain by Proofline.”

#### P1 — The adapter trusts caller-supplied provenance fields

`proof_timestamp_ms` and `proof_bundle_hash` are caller inputs (`verify_outcome.rs:26-45`), and the comment says bundle correctness is enforced by equality on Base. In the current system, both lanes consume the same operator-controlled fixture/handoff, so equality is consistency, not independent correctness.

**FULL-path requirement:** parse/accept the official TxLINE payload, derive the proof timestamp, fixture, score values, sequence/stat identity, daily-root PDA, and deterministic bundle/instruction hash from those exact bytes on-chain. Do not allow a relayer to choose provenance independently of the verified payload.

#### P1 — Deployment configuration is not mainnet-safe

`Anchor.toml:8-16` declares only `localnet` and points at the default local wallet. `initialize_config` accepts arbitrary program IDs, destination chain, and forwarder with no known-mainnet constant checks. There is no initialize/deploy/smoke-test runbook, no mainnet IDL/client configuration, and no upgrade-authority ceremony.

The declared program identity also requires a program-address signer on initial deployment. That is a second signing identity beyond the sole authorized mainnet burner, so FULL conflicts with the authorization in this brief even if funding appears.

#### P1 — Wormhole publication is unproven integration code

The hand-written Wormhole CPI has only pure layout/parser unit tests. There is no local-validator or mainnet-compatible integration test proving account creation, account ordering, fee handling, message posting, or VAA observation. The program's own header calls it unaudited reference source and advises against deadline-day deployment (`lib.rs:8-16`). Treat that warning as correct.

### Ship verdict by component

| Component | Verdict today |
| --- | --- |
| Base Sepolia contracts and recorded receipts | Ship as the already-labeled real Base leg |
| Simulated Wormhole/CRE demo | Ship only with current simulation labels |
| Current Proofline live TxLINE snapshot path | Do not use for proof claims |
| Custom Solana adapter | **Do not deploy** |
| New proof-backed Memo attestation path | Ship after the P0 no-deploy fixes and a historical rehearsal |

## 2. Mainnet options

### A. FULL — compile and deploy the Anchor adapter

#### Cost

The actual stripped artifact at `target/deploy/proofline_adapter.so` is **374,816 bytes**. The build intermediate is 471,240 bytes; the smaller deploy artifact is the relevant estimate.

Upgradeable-loader sizing for the current artifact:

| Account | Data size | Finalized mainnet rent query at 07:43 ET |
| --- | ---: | ---: |
| Program | 36 bytes | 0.001141440 SOL |
| ProgramData | 45 + 374,816 = 374,861 bytes | 2.609923440 SOL |
| Upload buffer (transient) | 37 + 374,816 = 374,853 bytes | 2.609867760 SOL |

The upload buffer's balance is reused/consumed during initial deployment; it is not an additional permanent 2.61 SOL. The permanent rent floor is therefore approximately:

`2.609923440 + 0.001141440 = 2.611064880 SOL`

Against **0.229 SOL available**, the bare rent shortfall is:

`2.611064880 - 0.229 = 2.382064880 SOL`

Deployment also needs hundreds of upload transactions for a 375 KB binary, the final deploy transaction, initialization, and tests. At the current 5,000-lamport base fee per signature, upload/base fees should remain in the low thousandths of SOL, but retries and priority fees are workload-dependent. A bare-minimum top-up would be roughly **2.39 SOL**. A prudent funding target is a **2.65 SOL wallet balance**, requiring a **2.421 SOL top-up**. This estimate uses today's finalized `getMinimumBalanceForRentExemption` results; re-query immediately before any approved spend.

The Solana CLI now defaults initial `max-len` to the current program length. Reserving substantial upgrade headroom increases rent linearly. The older 2× allocation convention would put this artifact near 5.22 SOL permanent rent and should not be selected under this budget.

References: Solana documents the current 5,000-lamport/signature base fee and optional priority-fee formula in its [fee structure](https://solana.com/docs/core/fees/fee-structure). Loader-v3 is the normal upgradeable deployment model; the installed CLI reports `--max-len` defaults to the original program length.

#### Time and feasibility

- Replace the false ABI with the pinned official binding and remodel outcome derivation: 2–4 hours.
- Add validator/integration coverage for CPI account/PDA/return behavior: 1–2 hours.
- Validate Wormhole Core CPI end-to-end and fix likely integration issues: 1–3 hours.
- Add mainnet config, program-identity authorization, initialization checks, upgrade-authority decision, deploy client, and smoke tests: 1–2 hours.
- Fund, upload, deploy, initialize, and inspect: 15–45 minutes if the network and RPC behave.

**Honest estimate: 5–10 engineering hours plus funding/authorization, with material tail risk.** It cannot be made responsibly ready for the 14:30 ET recording freeze, and the signer constraint alone prevents it under the current authorization.

**Verdict: NO-GO. Do not fund this option today.**

### B. NO-DEPLOY HONEST PATH — real root/proof reads plus Memo

#### Proposed evidence chain

```text
TxLINE final event
  -> raw /stat-validation proof (two authenticated headers)
  -> timestamp-derived daily_scores_roots PDA
  -> finalized mainnet account read
  -> exact official validateStatV2 .view() on 2+ RPCs
  -> canonical evidence bundle + exact instruction hash
  -> signed Proofline v1 Memo transaction
  -> finalized transaction fetched back and decoded
```

Use the already-working capture/verification implementation rather than Proofline's placeholder builder. The official client has already replayed a historical proof through deployed mainnet `validateStatV2` and received `true`; the local capture directory also already contains multiple real historical proof bundles and an active directory for final fixture `18257739`. Credential values were not inspected; only the access-file key names were checked, confirming the expected JWT/API-token/wallet metadata shape.

#### Attestation format

Keep the memo compact and versioned, for example:

```text
proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=f7e3bcd5db4c6744445f75dfab7eccc879c6d2de
```

Rules:

- `bundle` is a documented canonical hash of the complete verbatim proof response, strategy, root, and final record—not of a UI summary.
- `ix` hashes the exact Anchor/Borsh instruction bytes actually simulated.
- `root` is derived from the proof timestamp and its account owner/existence are checked at finalized commitment.
- `result` is derived from proof stat values, never from defaulted snapshot fields.
- The fee payer signs the transaction; include its public key in the evidence manifest and verify it on readback.
- One deterministic attestation ID per `(cluster, TxLINE program, fixture, sequence, root, ix, bundle)`. A correction must use an explicit `supersedes=<signature>` field; never silently overwrite.
- Preserve the complete evidence bundle outside the memo and make the verifier available to judges. A 32-byte digest without the preimage is not independently useful.

Solana transactions are limited to 1,232 bytes, so a digest-oriented memo is appropriate; do not try to put the proof itself in the transaction. The [Solana Memo documentation](https://solana.com/docs/payments/send-payments/payment-with-memo) confirms that memo text is permanently recorded in transaction logs and visible through RPC/explorers.

#### Cost

A one-signer Memo transaction creates no account and pays no rent. At the current base fee:

- base cost: **5,000 lamports = 0.000005 SOL per transaction**;
- theoretical capacity of 0.229 SOL: **45,800 memo transactions** at base fee only;
- preserving 0.020 SOL and assuming no priority fee: **41,800 transactions**;
- even at 0.000015 SOL total per transaction (base plus a generous 10,000-lamport priority allowance): about **13,933 transactions** after that reserve.

The final requires only a handful: optionally one “capture started” marker, one per significant proof-backed event, and one final attestation. Re-query fees immediately before broadcast and cap any priority fee explicitly.

#### Does it deliver “can't fake”?

**Yes, for a carefully worded claim:** it proves that the authorized burner signed a specific digest/reference at a mainnet slot; that the referenced TxLINE root account existed on mainnet; and—if the raw proof is published—that any judge can independently run the exact deployed TxLINE verifier against that root and reproduce `true`.

**No, for the stronger claim:** the Memo program itself does not enforce the proof, and an operator could sign a false memo. RPC simulation output is not persisted as consensus state. Multiple finalized RPC reads and a public reproducible proof make deception detectable, but do not turn it into a Proofline smart-contract verdict.

The recording narration should be: **“real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet.”** It should not say **“Proofline verified the proof on-chain.”**

#### Time

Using the adjacent capture and official verifier code: **2–3.5 hours to a rehearsed path**, including memo schema/decoder, artifact canonicalization, multi-RPC verification, confirmation/readback, and UI/recording evidence. This is feasible before 14:30 ET with a hard scope freeze.

### C. HYBRID — recommended

For today's final:

- Use Option B for the live Solana mainnet evidence.
- Continue showing the already-real Base Sepolia delivery/settlement receipts as a separate exercised leg.
- Keep Wormhole and CRE labeled simulated.
- Do not visually imply that today's Memo caused the existing Base settlement unless a separately identified, real relay transaction actually does so.
- After the hackathon, replace the adapter ABI with `txline-kit-cpi`, integrate/test Wormhole, arrange a program identity and funding, then deploy deliberately.

This produces more real evidence today than rushing an unusable program: the roots, deployed TxLINE verification, attestation signature, slot, and explorer transaction are all real, while every remaining trust boundary is stated accurately.

## 3. Recommendation and timed work plan

### Go/no-go decision

**GO: HYBRID/no-deploy.**  
**NO-GO: FULL, even if Liam offers funding today.** Funding does not cure the wrong ABI, missing integration tests, or unauthorized second signer.

### Mandatory before the first mainnet Memo

1. **Delete the placeholder from the real path.** The transaction bytes must come from the pinned official TxLINE IDL/client; assert discriminator and, preferably, match a Rust/TypeScript golden vector.
2. **Use the real proof endpoint.** Capture the complete verbatim V2 response with both required auth headers; never substitute Proofline's synthetic proof/root template.
3. **Bind the correct root.** Derive `daily_scores_roots` from `summary.updateStats.minTimestamp`, assert it equals the account passed to `validateStatV2`, read it at `finalized`, and record slot, owner, and account-data hash.
4. **Prove exact values.** Use exact-equality predicates for the requested score stat indices. No zero defaults, guessed key names, or snapshot-only score assertions.
5. **Require reproducible success.** Get `true` from at least two independent mainnet RPC providers using identical serialized instruction data; reject missing/wrong-program/malformed return data and any differing stable result.
6. **Canonicalize evidence once.** Define and test deterministic bundle hashing; persist raw proof, exact instruction bytes, strategy, RPC results, root read, and final record. Memo only the compact identities.
7. **Add transaction safety rails.** Hardcode/allowlist mainnet cluster, TxLINE program, Memo program, authorized signer public key, maximum fee/priority fee, and expected memo schema. Default to dry-run. Require an explicit operator broadcast flag and show decoded contents before signing.
8. **Confirm what landed.** Wait for `finalized`, fetch the transaction from a second RPC, verify success, signer, cluster, Memo program, and byte-exact memo, then produce the explorer link.
9. **Fix the claim/UI.** Display “client-verified + memo-anchored,” expose proof/root/instruction/bundle identities, and keep Wormhole/CRE simulation badges visible.
10. **Historical rehearsal.** Run the entire read/verify/hash/build/decode/readback pipeline on an already-captured historical V2 proof. No live-final code should be first exercised after kickoff.

### Work schedule, Eastern Time

| Time | Gate/work |
| --- | --- |
| 08:00–08:15 | Liam go/no-go: approve HYBRID wording and freeze FULL. Assign one implementation owner; preserve the active capture process. |
| 08:15–09:15 | Wire raw capture proof -> pinned official TxLINE verifier -> deterministic evidence bundle. Add strict final/stat/PDA checks. |
| 09:15–10:00 | Historical proof rehearsal against 2+ mainnet RPCs at finalized commitment. Compare exact instruction bytes and results. Fix any discrepancy before proceeding. |
| 10:00–10:45 | Implement compact Memo v1 builder, local decoder, deterministic ID, signer/program/cluster/fee allowlists, dry-run default, and readback verifier. |
| 10:45–11:30 | End-to-end historical rehearsal. If Liam explicitly authorizes spend, one historical mainnet Memo smoke test costs about 0.000005 SOL plus any capped priority fee; otherwise validate unsigned/local serialization and defer the first broadcast. |
| 11:30–12:30 | Add the evidence view/recording surface: RPC slots, root, proof result, memo preview/signature, explorer link, and explicit trust wording. |
| 12:30–13:15 | Failure drills: expired JWT renewal with same API token, proof-not-yet-indexed retry, RPC disagreement/rate limit, transaction expiry/resign, delayed finalisation, and duplicate suppression. |
| 13:15–14:00 | Operator rehearsal with screen capture; verify final fixture `18257739`, capture services, disk, clocks, and two RPC endpoints without exposing credentials. |
| 14:00–14:30 | Code/config freeze and recording setup. Start a clean evidence run and capture-start marker only if explicitly authorized. |
| 15:00 onward | Record kickoff/live data. Memo only meaningful proof-backed checkpoints. After finalisation, retry proof retrieval through the next five-minute indexing window, run both RPC verifications, post the final memo, wait for finalized readback, then capture explorer/evidence screens. |
| By 19:30 | Preserve at least 30 minutes of contingency before the 19:59:59 submission deadline. Do not let a missing Memo block submission of the already-working honest demo. |

### Abort/fallback rules

- If the historical proof does not return identical `true` on two RPCs by 10:00 ET, do not build the live claim on RPC screenshots; fix the verifier or fall back to raw root read plus explicitly unverified memo wording.
- If the Memo path is not rehearsed end-to-end by 11:30 ET, freeze it out of the critical UI and record the real root/read-only verifier separately rather than improvising a transaction live.
- If final proof indexing is delayed, keep recording and retry with bounded backoff. Never memo “verified” before `validateStatV2` returns exact `true`.
- Never pivot back to FULL today. Its blockers are architectural and authorization-related, not schedule padding.

## Post-deadline FULL checklist

Before any later adapter deployment:

1. replace the hand-written TxLINE types with the pinned `txline-kit-cpi` crate and lock the IDL revision;
2. derive every attested field from the verified payload and deterministic bytes;
3. enforce the known TxLINE mainnet program and timestamp-derived root PDA;
4. add program-test plus a mainnet read-only rehearsal and a real consumer CPI transaction on an appropriate test environment;
5. integrate Wormhole using a maintained SDK/version or prove the raw CPI against a validator and test emission/VAA observation;
6. establish an explicitly authorized program identity and upgrade-authority policy;
7. regenerate size/rent estimates, fund only after review, deploy upgradeable for smoke tests, verify source/binary, then consider `--final` or governed authority;
8. obtain an independent security review of the exact deploy commit.

## Review limitations

This was a deadline-prioritized, read-only review. No keypair was read, no credential value was printed, no transaction was constructed/simulated/signed/sent, and no deployment was attempted. The only project write is this report. Existing build/test logs were inspected rather than rerunning commands that would write caches/artifacts. The lane had one pre-existing untracked `apps/web/.gitignore`; it was not touched.
++ b/proofline/workspace/proofline/docs/codex-mainnet-review.md
# Proofline pre-mainnet review and deploy plan

**Review time:** 2026-07-19, 07:55 ET  
**Review target:** commit `99bd4eab96c90bc7a4eb09b971d1f669706c7122` on `main`  
**Decision:** **NO-GO for the custom-program deployment. GO for a tightly scoped no-deploy mainnet attestation path, with the mandatory fixes below.**

## Executive verdict

Proofline is a strong hackathon prototype with unusually good honesty labeling, clean package boundaries, cross-language payload vectors, a real exercised Base Sepolia leg, and good unit/conformance coverage. It is good submission material.

It is **not good to ship as a new Solana mainnet program today**. The central Solana adapter does not implement TxLINE's real `validate_stat_v2` ABI. It compiles and its unit tests pass because those tests exercise Proofline's own invented flat argument shape, not the deployed TxLINE program. There is no validator/CPI integration test. The Level 3 “canonical transaction” is likewise a textual placeholder rather than an Anchor/Borsh TxLINE instruction. A mainnet deployment would therefore be expensive, outside the stated signer authorization, and functionally incapable of performing the advertised verification.

The honest path that can be made ready before 14:30 ET is:

1. capture the final and its real TxLINE V2 proof using the already-working two-header API flow;
2. derive and read the real mainnet daily-root PDA at `finalized` commitment;
3. execute TxLINE's deployed `validateStatV2` as a read-only mainnet `.view()`/`simulateTransaction` using the official IDL and exact proof/strategy;
4. hash and preserve the complete evidence bundle; and
5. sign a compact Proofline attestation containing those identities in a normal Solana Memo transaction.

That provides real, timestamped, independently reproducible mainnet evidence. It does **not** turn client-side verification into trustless on-chain verification, and the recording must say that plainly.

## 1. Quality review

### Architecture and code-quality verdict

What is good:

- The real/simulated boundary is prominent in `README.md:42-55`, not buried.
- Protocol hashing and payload encoding have TypeScript, Rust, and Solidity conformance coverage.
- The Base contracts have meaningful happy-path, ordering, replay, conflict, guardian-quorum, emitter, and payload-tamper tests.
- The event-sourced UI and `sim:` signature convention make it difficult to accidentally present a simulated receipt as a chain receipt.
- Return-data origin checking is conceptually correct: an eventual adapter must require both the TxLINE program ID and an exact boolean return.
- The adjacent TxLINE tooling is substantially more production-ready than Proofline's current Solana integration: it has a pinned official ABI, exact serialization vectors, safe daily-root derivation, and recorded successful mainnet `.view()` verification.

Validation evidence already present in the lane, generated between 06:58 and 07:14 ET today:

- TypeScript typecheck: 16/16 workspaces passed.
- TypeScript tests: 3/3 test-bearing workspaces passed.
- Foundry: 25/25 tests passed.
- Anchor/Rust: build completed and unit/conformance tests passed, with 18 macro/config warnings.
- SBF deploy artifact exists and is 374,816 bytes.

These are useful health signals, but none exercises the Proofline adapter against the deployed TxLINE program or Wormhole Core.

### Mandatory blockers and bugs

#### P0 — The Solana adapter uses the wrong TxLINE ABI

`programs/proofline-adapter/.../txline/idl_types.rs:21-47` defines `validate_stat_v2` as:

`fixture_id, sequence, period, participant_1_score, participant_2_score, proof: Vec<u8>`.

TxLINE's published IDL defines two arguments: a structured `StatValidationInput` and an `NDimensionalStrategy`. The official CPI binding pins discriminator `[208,215,194,214,241,71,246,178]` and serializes the full proof hierarchy, proof-node directions, stat leaves, and strategy. The deployed instruction also has a timestamp-derived `daily_scores_roots` PDA invariant.

**Impact:** the current CPI instruction cannot successfully call deployed mainnet TxLINE. FULL must not deploy until the hand-written ABI is removed and the pinned `txline-kit-cpi` binding is used or reproduced byte-for-byte.

#### P0 — The claimed Level 3 “canonical transaction” is not a TxLINE transaction

`packages/config/src/cre-runtime.ts:348-359` explicitly encodes UTF-8 text such as `validate_stat_v2:fixture=...`; it is not the Anchor discriminator plus Borsh payload and strategy. `workflows/cre-level3-attestor/main.ts:127-165` then returns a locally manufactured `true` response for that transaction. `apps/relay-cli/src/verify-evidence.ts:109-129` verifies the same textual placeholder.

**Impact:** all hashes may be internally consistent while proving nothing about TxLINE. Do not reuse `canonicalValidateStatV2Data`, the existing Level 3 simulation builder, or its “verification” result in the real-mainnet path.

#### P0 — The live Proofline path discards the real proof leg

`packages/txline-sdk/src/scores/live-snapshot.ts:11-15,115-157` treats proof/root data as unavailable and injects synthetic template values. That premise is stale: the configured two-header API flow can retrieve `/api/scores/stat-validation`, and the capture repository already contains real proof bundles plus a working mainnet verifier.

**Impact:** merely switching Proofline's current config to `mode: live` still produces synthetic roots/proofs. The no-deploy path must consume raw capture proof responses, not this template path.

#### P0 — Final-score detection/mapping is unsafe for the live final

`isFinalRecord` requires action, status ID, and period all to match exactly. Real provider finalisation records may omit period. The live mapper probes unconfirmed field names and defaults missing scores and period to zero (`live-snapshot.ts:79-92`).

**Impact:** the pipeline can miss the final or manufacture a 0–0 shape from absent fields. Use the observed finalisation record to select the sequence, then take attested score values from the returned V2 proof's requested stat leaves. Never default a field that enters an attestation.

#### P0 — A memo alone does not prove that verification ran

A Solana signature proves that the authorized key signed the exact memo in a transaction finalized at a slot. The Memo program does not execute TxLINE, validate a Merkle path, or enforce truthful memo contents.

**Required mitigation:** publish/preserve the full raw proof bundle, hash it canonically, bind that digest plus the exact serialized TxLINE instruction digest and root address into the memo, and provide a one-command independent verifier. Use at least two independent RPCs for the `.view()` result and record finalized slots. The UI must say “client-verified against TxLINE mainnet; attestation anchored by Memo,” not “verified on-chain by Proofline.”

#### P1 — The adapter trusts caller-supplied provenance fields

`proof_timestamp_ms` and `proof_bundle_hash` are caller inputs (`verify_outcome.rs:26-45`), and the comment says bundle correctness is enforced by equality on Base. In the current system, both lanes consume the same operator-controlled fixture/handoff, so equality is consistency, not independent correctness.

**FULL-path requirement:** parse/accept the official TxLINE payload, derive the proof timestamp, fixture, score values, sequence/stat identity, daily-root PDA, and deterministic bundle/instruction hash from those exact bytes on-chain. Do not allow a relayer to choose provenance independently of the verified payload.

#### P1 — Deployment configuration is not mainnet-safe

`Anchor.toml:8-16` declares only `localnet` and points at the default local wallet. `initialize_config` accepts arbitrary program IDs, destination chain, and forwarder with no known-mainnet constant checks. There is no initialize/deploy/smoke-test runbook, no mainnet IDL/client configuration, and no upgrade-authority ceremony.

The declared program identity also requires a program-address signer on initial deployment. That is a second signing identity beyond the sole authorized mainnet burner, so FULL conflicts with the authorization in this brief even if funding appears.

#### P1 — Wormhole publication is unproven integration code

The hand-written Wormhole CPI has only pure layout/parser unit tests. There is no local-validator or mainnet-compatible integration test proving account creation, account ordering, fee handling, message posting, or VAA observation. The program's own header calls it unaudited reference source and advises against deadline-day deployment (`lib.rs:8-16`). Treat that warning as correct.

### Ship verdict by component

| Component | Verdict today |
| --- | --- |
| Base Sepolia contracts and recorded receipts | Ship as the already-labeled real Base leg |
| Simulated Wormhole/CRE demo | Ship only with current simulation labels |
| Current Proofline live TxLINE snapshot path | Do not use for proof claims |
| Custom Solana adapter | **Do not deploy** |
| New proof-backed Memo attestation path | Ship after the P0 no-deploy fixes and a historical rehearsal |

## 2. Mainnet options

### A. FULL — compile and deploy the Anchor adapter

#### Cost

The actual stripped artifact at `target/deploy/proofline_adapter.so` is **374,816 bytes**. The build intermediate is 471,240 bytes; the smaller deploy artifact is the relevant estimate.

Upgradeable-loader sizing for the current artifact:

| Account | Data size | Finalized mainnet rent query at 07:43 ET |
| --- | ---: | ---: |
| Program | 36 bytes | 0.001141440 SOL |
| ProgramData | 45 + 374,816 = 374,861 bytes | 2.609923440 SOL |
| Upload buffer (transient) | 37 + 374,816 = 374,853 bytes | 2.609867760 SOL |

The upload buffer's balance is reused/consumed during initial deployment; it is not an additional permanent 2.61 SOL. The permanent rent floor is therefore approximately:

`2.609923440 + 0.001141440 = 2.611064880 SOL`

Against **0.229 SOL available**, the bare rent shortfall is:

`2.611064880 - 0.229 = 2.382064880 SOL`

Deployment also needs hundreds of upload transactions for a 375 KB binary, the final deploy transaction, initialization, and tests. At the current 5,000-lamport base fee per signature, upload/base fees should remain in the low thousandths of SOL, but retries and priority fees are workload-dependent. A bare-minimum top-up would be roughly **2.39 SOL**. A prudent funding target is a **2.65 SOL wallet balance**, requiring a **2.421 SOL top-up**. This estimate uses today's finalized `getMinimumBalanceForRentExemption` results; re-query immediately before any approved spend.

The Solana CLI now defaults initial `max-len` to the current program length. Reserving substantial upgrade headroom increases rent linearly. The older 2× allocation convention would put this artifact near 5.22 SOL permanent rent and should not be selected under this budget.

References: Solana documents the current 5,000-lamport/signature base fee and optional priority-fee formula in its [fee structure](https://solana.com/docs/core/fees/fee-structure). Loader-v3 is the normal upgradeable deployment model; the installed CLI reports `--max-len` defaults to the original program length.

#### Time and feasibility

- Replace the false ABI with the pinned official binding and remodel outcome derivation: 2–4 hours.
- Add validator/integration coverage for CPI account/PDA/return behavior: 1–2 hours.
- Validate Wormhole Core CPI end-to-end and fix likely integration issues: 1–3 hours.
- Add mainnet config, program-identity authorization, initialization checks, upgrade-authority decision, deploy client, and smoke tests: 1–2 hours.
- Fund, upload, deploy, initialize, and inspect: 15–45 minutes if the network and RPC behave.

**Honest estimate: 5–10 engineering hours plus funding/authorization, with material tail risk.** It cannot be made responsibly ready for the 14:30 ET recording freeze, and the signer constraint alone prevents it under the current authorization.

**Verdict: NO-GO. Do not fund this option today.**

### B. NO-DEPLOY HONEST PATH — real root/proof reads plus Memo

#### Proposed evidence chain

```text
TxLINE final event
  -> raw /stat-validation proof (two authenticated headers)
  -> timestamp-derived daily_scores_roots PDA
  -> finalized mainnet account read
  -> exact official validateStatV2 .view() on 2+ RPCs
  -> canonical evidence bundle + exact instruction hash
  -> signed Proofline v1 Memo transaction
  -> finalized transaction fetched back and decoded
```

Use the already-working capture/verification implementation rather than Proofline's placeholder builder. The official client has already replayed a historical proof through deployed mainnet `validateStatV2` and received `true`; the local capture directory also already contains multiple real historical proof bundles and an active directory for final fixture `18257739`. Credential values were not inspected; only the access-file key names were checked, confirming the expected JWT/API-token/wallet metadata shape.

#### Attestation format

Keep the memo compact and versioned, for example:

```text
proofline:v1|cluster=mainnet-beta|fixture=<id>|seq=<seq>|result=<H/D/A>|root=<base58>|ix=<hex32>|bundle=<hex32>|proofTs=<ms>|txlineIdl=f7e3bcd5db4c6744445f75dfab7eccc879c6d2de
```

Rules:

- `bundle` is a documented canonical hash of the complete verbatim proof response, strategy, root, and final record—not of a UI summary.
- `ix` hashes the exact Anchor/Borsh instruction bytes actually simulated.
- `root` is derived from the proof timestamp and its account owner/existence are checked at finalized commitment.
- `result` is derived from proof stat values, never from defaulted snapshot fields.
- The fee payer signs the transaction; include its public key in the evidence manifest and verify it on readback.
- One deterministic attestation ID per `(cluster, TxLINE program, fixture, sequence, root, ix, bundle)`. A correction must use an explicit `supersedes=<signature>` field; never silently overwrite.
- Preserve the complete evidence bundle outside the memo and make the verifier available to judges. A 32-byte digest without the preimage is not independently useful.

Solana transactions are limited to 1,232 bytes, so a digest-oriented memo is appropriate; do not try to put the proof itself in the transaction. The [Solana Memo documentation](https://solana.com/docs/payments/send-payments/payment-with-memo) confirms that memo text is permanently recorded in transaction logs and visible through RPC/explorers.

#### Cost

A one-signer Memo transaction creates no account and pays no rent. At the current base fee:

- base cost: **5,000 lamports = 0.000005 SOL per transaction**;
- theoretical capacity of 0.229 SOL: **45,800 memo transactions** at base fee only;
- preserving 0.020 SOL and assuming no priority fee: **41,800 transactions**;
- even at 0.000015 SOL total per transaction (base plus a generous 10,000-lamport priority allowance): about **13,933 transactions** after that reserve.

The final requires only a handful: optionally one “capture started” marker, one per significant proof-backed event, and one final attestation. Re-query fees immediately before broadcast and cap any priority fee explicitly.

#### Does it deliver “can't fake”?

**Yes, for a carefully worded claim:** it proves that the authorized burner signed a specific digest/reference at a mainnet slot; that the referenced TxLINE root account existed on mainnet; and—if the raw proof is published—that any judge can independently run the exact deployed TxLINE verifier against that root and reproduce `true`.

**No, for the stronger claim:** the Memo program itself does not enforce the proof, and an operator could sign a false memo. RPC simulation output is not persisted as consensus state. Multiple finalized RPC reads and a public reproducible proof make deception detectable, but do not turn it into a Proofline smart-contract verdict.

The recording narration should be: **“real TxLINE data, client-verified by TxLINE's deployed mainnet verifier against its real mainnet root, then immutably attested by Proofline on Solana mainnet.”** It should not say **“Proofline verified the proof on-chain.”**

#### Time

Using the adjacent capture and official verifier code: **2–3.5 hours to a rehearsed path**, including memo schema/decoder, artifact canonicalization, multi-RPC verification, confirmation/readback, and UI/recording evidence. This is feasible before 14:30 ET with a hard scope freeze.

### C. HYBRID — recommended

For today's final:

- Use Option B for the live Solana mainnet evidence.
- Continue showing the already-real Base Sepolia delivery/settlement receipts as a separate exercised leg.
- Keep Wormhole and CRE labeled simulated.
- Do not visually imply that today's Memo caused the existing Base settlement unless a separately identified, real relay transaction actually does so.
- After the hackathon, replace the adapter ABI with `txline-kit-cpi`, integrate/test Wormhole, arrange a program identity and funding, then deploy deliberately.

This produces more real evidence today than rushing an unusable program: the roots, deployed TxLINE verification, attestation signature, slot, and explorer transaction are all real, while every remaining trust boundary is stated accurately.

## 3. Recommendation and timed work plan

### Go/no-go decision

**GO: HYBRID/no-deploy.**  
**NO-GO: FULL, even if Liam offers funding today.** Funding does not cure the wrong ABI, missing integration tests, or unauthorized second signer.

### Mandatory before the first mainnet Memo

1. **Delete the placeholder from the real path.** The transaction bytes must come from the pinned official TxLINE IDL/client; assert discriminator and, preferably, match a Rust/TypeScript golden vector.
2. **Use the real proof endpoint.** Capture the complete verbatim V2 response with both required auth headers; never substitute Proofline's synthetic proof/root template.
3. **Bind the correct root.** Derive `daily_scores_roots` from `summary.updateStats.minTimestamp`, assert it equals the account passed to `validateStatV2`, read it at `finalized`, and record slot, owner, and account-data hash.
4. **Prove exact values.** Use exact-equality predicates for the requested score stat indices. No zero defaults, guessed key names, or snapshot-only score assertions.
5. **Require reproducible success.** Get `true` from at least two independent mainnet RPC providers using identical serialized instruction data; reject missing/wrong-program/malformed return data and any differing stable result.
6. **Canonicalize evidence once.** Define and test deterministic bundle hashing; persist raw proof, exact instruction bytes, strategy, RPC results, root read, and final record. Memo only the compact identities.
7. **Add transaction safety rails.** Hardcode/allowlist mainnet cluster, TxLINE program, Memo program, authorized signer public key, maximum fee/priority fee, and expected memo schema. Default to dry-run. Require an explicit operator broadcast flag and show decoded contents before signing.
8. **Confirm what landed.** Wait for `finalized`, fetch the transaction from a second RPC, verify success, signer, cluster, Memo program, and byte-exact memo, then produce the explorer link.
9. **Fix the claim/UI.** Display “client-verified + memo-anchored,” expose proof/root/instruction/bundle identities, and keep Wormhole/CRE simulation badges visible.
10. **Historical rehearsal.** Run the entire read/verify/hash/build/decode/readback pipeline on an already-captured historical V2 proof. No live-final code should be first exercised after kickoff.

### Work schedule, Eastern Time

| Time | Gate/work |
| --- | --- |
| 08:00–08:15 | Liam go/no-go: approve HYBRID wording and freeze FULL. Assign one implementation owner; preserve the active capture process. |
| 08:15–09:15 | Wire raw capture proof -> pinned official TxLINE verifier -> deterministic evidence bundle. Add strict final/stat/PDA checks. |
| 09:15–10:00 | Historical proof rehearsal against 2+ mainnet RPCs at finalized commitment. Compare exact instruction bytes and results. Fix any discrepancy before proceeding. |
| 10:00–10:45 | Implement compact Memo v1 builder, local decoder, deterministic ID, signer/program/cluster/fee allowlists, dry-run default, and readback verifier. |
| 10:45–11:30 | End-to-end historical rehearsal. If Liam explicitly authorizes spend, one historical mainnet Memo smoke test costs about 0.000005 SOL plus any capped priority fee; otherwise validate unsigned/local serialization and defer the first broadcast. |
| 11:30–12:30 | Add the evidence view/recording surface: RPC slots, root, proof result, memo preview/signature, explorer link, and explicit trust wording. |
| 12:30–13:15 | Failure drills: expired JWT renewal with same API token, proof-not-yet-indexed retry, RPC disagreement/rate limit, transaction expiry/resign, delayed finalisation, and duplicate suppression. |
| 13:15–14:00 | Operator rehearsal with screen capture; verify final fixture `18257739`, capture services, disk, clocks, and two RPC endpoints without exposing credentials. |
| 14:00–14:30 | Code/config freeze and recording setup. Start a clean evidence run and capture-start marker only if explicitly authorized. |
| 15:00 onward | Record kickoff/live data. Memo only meaningful proof-backed checkpoints. After finalisation, retry proof retrieval through the next five-minute indexing window, run both RPC verifications, post the final memo, wait for finalized readback, then capture explorer/evidence screens. |
| By 19:30 | Preserve at least 30 minutes of contingency before the 19:59:59 submission deadline. Do not let a missing Memo block submission of the already-working honest demo. |

### Abort/fallback rules

- If the historical proof does not return identical `true` on two RPCs by 10:00 ET, do not build the live claim on RPC screenshots; fix the verifier or fall back to raw root read plus explicitly unverified memo wording.
- If the Memo path is not rehearsed end-to-end by 11:30 ET, freeze it out of the critical UI and record the real root/read-only verifier separately rather than improvising a transaction live.
- If final proof indexing is delayed, keep recording and retry with bounded backoff. Never memo “verified” before `validateStatV2` returns exact `true`.
- Never pivot back to FULL today. Its blockers are architectural and authorization-related, not schedule padding.

## Post-deadline FULL checklist

Before any later adapter deployment:

1. replace the hand-written TxLINE types with the pinned `txline-kit-cpi` crate and lock the IDL revision;
2. derive every attested field from the verified payload and deterministic bytes;
3. enforce the known TxLINE mainnet program and timestamp-derived root PDA;
4. add program-test plus a mainnet read-only rehearsal and a real consumer CPI transaction on an appropriate test environment;
5. integrate Wormhole using a maintained SDK/version or prove the raw CPI against a validator and test emission/VAA observation;
6. establish an explicitly authorized program identity and upgrade-authority policy;
7. regenerate size/rent estimates, fund only after review, deploy upgradeable for smoke tests, verify source/binary, then consider `--final` or governed authority;
8. obtain an independent security review of the exact deploy commit.

## Review limitations

This was a deadline-prioritized, read-only review. No keypair was read, no credential value was printed, no transaction was constructed/simulated/signed/sent, and no deployment was attempted. The only project write is this report. Existing build/test logs were inspected rather than rerunning commands that would write caches/artifacts. The lane had one pre-existing untracked `apps/web/.gitignore`; it was not touched.