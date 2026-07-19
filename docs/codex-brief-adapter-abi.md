# Brief: replace the placeholder TxLINE ABI with the real pinned CPI binding

You are working in a git WORKTREE (`full-deploy` branch) of the Proofline monorepo. Scope:
`programs/proofline-adapter` (Anchor program, anchor-lang 0.32.1). Goal: make the adapter
capable of REAL on-chain verification against the DEPLOYED mainnet TxLINE program
(`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`) so it can be deployed to Solana mainnet today.

Authoritative context (read first):
- `docs/codex-mainnet-review.md` sections "P0 — The Solana adapter uses the wrong TxLINE ABI",
  "P1 — The adapter trusts caller-supplied provenance fields", "P1 — Deployment configuration
  is not mainnet-safe", and "Post-deadline FULL checklist" items 1-3. Those findings are the
  spec for this task.
- The pinned official CPI crate: `/home/claude/code/txodds/txline-kit/crates/txline-kit-cpi`
  (`txline_cpi` lib). It provides `VALIDATE_STAT_V2_DISCRIMINATOR` ([208,215,194,214,241,71,246,178]),
  the full `StatValidationInput`/`NDimensionalStrategy` Borsh types, `daily_scores_pda(timestamp_ms)`,
  `validate_stat_v2_data(...)`, `validate_stat_v2_instruction(...)`, `validate_stat_v2_cpi(...)`.
  Use it as a path dependency. Do NOT modify that crate.
- GOLDEN VECTOR (the hard correctness gate): `evidence/mainnet/rehearsal-18175918/instruction-data.bin`
  (726 bytes) is the exact validateStatV2 instruction data, built from the pinned IDL in
  TypeScript, that RETURNED TRUE on deployed mainnet TxLINE this morning (2 RPCs, finalized).
  The raw proof it was built from is `evidence/mainnet/rehearsal-18175918/raw-proof-response.json`;
  the strategy is `strategy.canonical.json` (exact-equality predicates, thresholds = the proof's
  own stat values, in statsToProve order). Payload `ts` MUST equal `summary.updateStats.minTimestamp`.

## Required changes

1. **Delete the invented ABI.** `src/txline/idl_types.rs` + the hand-written instruction builder
   in `src/txline/instruction.rs` define a flat argument shape that cannot call the deployed
   program. Replace all uses with `txline_cpi` types/builders. Keep
   `validation_instruction_hash` semantics but hash the REAL instruction bytes.
2. **`verify_outcome` derives everything from verified bytes** (review P1). New flow: the
   instruction receives the full `StatValidationInput` + `NDimensionalStrategy` (Borsh, as
   `txline_cpi` defines them). It must:
   - derive the daily-root PDA from `input.fixture_summary.update_stats.min_timestamp` via
     `txline_cpi::daily_scores_pda` and require it equals the passed account;
   - require the TxLINE program account is exactly the hardcoded mainnet id;
   - CPI `validate_stat_v2` and require return data: program id == TxLINE AND exactly one byte 0x01
     (keep the existing return_data.rs check shape but against the real program);
   - derive fixture id, score values (stat keys 1 and 2), sequence/period, proof timestamp, and
     the validation-instruction hash from the EXACT serialized CPI bytes — remove
     `proof_timestamp_ms`/`proof_bundle_hash` as caller inputs; the bundle hash commitment
     stored in VerifiedOutcome may be computed on-chain as keccak of the serialized
     StatValidationInput (document the exact recipe in a doc comment).
3. **`publish_outcome`** consumes only the VerifiedOutcome PDA fields (already mostly true —
   verify after the P1 rework).
4. **Feature-gate the Wormhole leg OFF by default** (cargo feature `wormhole`, default off) —
   the review calls that CPI unproven/unaudited; mainnet build ships without it. `on_report`
   may remain compiled but the emitter module must be behind the feature.
5. **Mainnet config safety**: `initialize_config` must reject any TxLINE program id other than
   the hardcoded mainnet constant (compile-time const, not caller input). Add a `[programs.mainnet]`
   entry to Anchor.toml with the program keypair path unchanged. No other config loosening.
6. **Tests (all must pass with `cargo test`)**:
   - port existing unit/conformance tests to the new types;
   - **golden-vector test**: load `raw-proof-response.json` + `strategy.canonical.json` from
     `evidence/mainnet/rehearsal-18175918/`, build the instruction data with `txline_cpi`, and
     assert BYTE-FOR-BYTE equality with `instruction-data.bin`. This test failing means the ABI
     is wrong — do not weaken it. (Parse the JSON with serde_json in the test.)
   - a negative test: tampered stat value → different instruction bytes.
7. **Build**: `~/.cargo/bin/anchor build` must succeed; report the final `.so` size — rent
   funding depends on it (target: stay under 470 KB; flag loudly if over).

## Hard rules
- Touch ONLY `programs/proofline-adapter` (+ its Cargo.toml/lock) in this worktree. Nothing else.
- No network calls in tests. No new dependencies beyond txline-kit-cpi (path dep) + serde_json (dev-dep) unless strictly necessary.
- Never print or read key material. Do not run any deploy command.
- If `txline_cpi`'s types conflict with anchor-lang 0.32.1, resolve in the ADAPTER (wrapper types),
  not by editing the pinned crate.

## Deliverable
Working tree with the changes (do not commit), `cargo test` green, `anchor build` green, and a
summary: files changed, .so size, golden-vector test status, any deviations with reasons.
