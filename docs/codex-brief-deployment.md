# Brief addendum: you own the DEPLOYMENT end-to-end (dress rehearsal → mainnet)

Owner order (via Director): codex plans and executes the deployment work; the operator
(Proofline lane) gates and verifies. This extends the adapter-ABI brief in
`docs/codex-brief-adapter-abi.md` — the ABI rework and its golden-vector test remain
prerequisite and unchanged.

## Deployment scope

**Phase D1 — dress rehearsal (MANDATORY, before any mainnet action):**
Run the complete deploy sequence against a LOCAL VALIDATOR with the real TxLINE program
cloned from mainnet (devnet does not have TxLINE; faucets are dry anyway):

```
solana-test-validator \
  --url https://api.mainnet-beta.solana.com \
  --clone 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA \
  --clone 8DCh33bPSZrJojZTLoZ7Briaw21tY2m15xNpTxudjxgS \
  --clone CdrFdcGqLpGxq3qDxcj4aNQT8jsUU2vBHd3JEEAQ55jd \
  --reset
```
(All three pre-resolved: program account, its ProgramData
`8DCh33bPSZrJojZTLoZ7Briaw21tY2m15xNpTxudjxgS` (verified via `solana program show`),
and the daily-root PDA for the golden proof's epochDay 20638. Use
`--upgradeable-program` cloning semantics if plain `--clone` of the pair fails on this
CLI version.)

Rehearsal sequence (script it — it becomes the mainnet runbook):
1. `anchor build`; report .so size (escalate >470 KB, do not proceed).
2. Copy the program keypair `programs/proofline-adapter/target/deploy/proofline_adapter-keypair.json`
   from the MAIN checkout `/home/claude/.world/groups/wos-company/proofline/workspace/proofline/programs/proofline-adapter/target/deploy/`
   into this worktree's target/deploy BEFORE building (declare_id is PRF5wS3RSArKNCC2pYtDvBciM9KxtDw6tqAUzimKqbN and must match).
3. Deploy to the local validator with a LOCAL throwaway keypair (airdrop local SOL — real keys never touch the rehearsal).
4. `initialize_config` with the hardcoded mainnet TxLINE id.
5. **Real-proof verification through the on-chain path**: build the `verify_outcome`
   transaction from the golden evidence (`evidence/mainnet/rehearsal-18175918/raw-proof-response.json`
   + `strategy.canonical.json`), send it as a REAL transaction on the local validator, and
   require: CPI into the cloned TxLINE program succeeds, return data checked, VerifiedOutcome
   PDA created with fields derived from the verified bytes (fixture 18175918, 3–2, seq 1242).
6. `publish_outcome` and read the resulting account back; assert the derived fields.
7. Readback: fetch both PDAs, print decoded contents; the rehearsal is GREEN only if every
   step above passed without manual intervention.

**Phase D2 — mainnet execution (ONLY after D1 is green AND the operator confirms in the
directive that the gate stands):**
Same script, parameterized: cluster mainnet-beta, fee payer + upgrade authority =
`$PROOFLINE_SIGNER_KEYPAIR` (path in env; never print it, never copy it), program id keypair
as above. Budget: burner holds ~3.229 SOL; rent for the final binary + ~0.01 fees must fit
with ≥0.05 SOL left as memo reserve. Use `--max-len` = final binary size (no 2× headroom —
budget-locked). After deploy: `initialize_config`, then the same real-proof `verify_outcome`
+ `publish_outcome` with the golden historical proof AS A REAL MAINNET TRANSACTION, then
readback both PDAs from a SECOND RPC (https://solana-rpc.publicnode.com) at finalized and
emit explorer links. Record every signature, slot, and account address into
`evidence/mainnet/full-deploy/` as JSON.

## Rails (unchanged, hard)
- No mainnet transaction before D1 green + operator confirmation.
- Mainnet signing exclusively via the env-path burner keypair; NEVER read it into logs/output,
  never copy the file, never print secret bytes. Local rehearsal uses throwaway local keys.
- Escalate (stop and report) if: binary >470 KB, rent+fees would leave <0.05 SOL reserve,
  TxLINE clone fails, or the rehearsal verify does not pass cleanly.
- Do not touch the main checkout (`workspace/proofline`) — the live hybrid watcher runs there.
- Compute-unit limit for verify_outcome: the TxLINE CPI needed 1.4M CU in simulation — set
  the compute budget accordingly on both rehearsal and mainnet.

## Deliverable
D1: rehearsal script + full green transcript (paste key lines) + .so size + rent math.
Then STOP and report for the operator's D2 gate confirmation.
