//! Transaction A of the two-transaction design: verify a TxLINE proof via
//! CPI into TxOracle's `validate_stat_v2` and mint an immutable
//! `VerifiedOutcome` PDA.
//!
//! Permissionless by design: ANY relayer may call this. CRE drives it in
//! production for liveness, but a broken or malicious CRE can neither forge
//! an outcome (TxOracle must return true) nor block one (anyone else can
//! submit the same proof). "CRE provides liveness. TxLINE, Solana, and
//! Wormhole provide correctness."

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;

use crate::state::{proof_buffer::seal_matches, Config, ProofBuffer, VerifiedOutcome};
use crate::txline::idl_types::{ValidateStatV2Args, FINAL_PERIOD, SOURCE_VALIDATION_V2};
use crate::txline::instruction::{build_validate_stat_v2_ix, validation_instruction_hash};
use crate::txline::return_data::require_txline_true;
use crate::wormhole::payload::derive_result;
use crate::ProoflineError;

/// Everything a relayer asserts about the outcome it wants verified. All of
/// it is UNTRUSTED input: the scores/period/fixture/sequence are only
/// accepted if TxOracle's exact-equality predicate returns true for them,
/// and `result` is never taken from the caller at all (derived from the
/// verified scores).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VerifyOutcomeArgs {
    pub fixture_id: i64,
    pub score_sequence: i64,
    pub proof_timestamp_ms: i64,
    /// Must equal `FINAL_PERIOD` (100) — TxLINE `statusId == 100` /
    /// `game_finalised` semantics. Proofline attests finals only.
    pub period: i32,
    pub participant_1_score: i32,
    pub participant_2_score: i32,
    /// keccak256 of the complete off-chain evidence bundle (final record +
    /// proof + root account + strategy). Not verifiable on-chain; bound
    /// into the payload so Base-side attestation-id equality between Level
    /// 3 and Level 4 enforces it.
    pub proof_bundle_hash: [u8; 32],
    /// Small proofs can ride inline in this instruction; large proofs come
    /// from a sealed `ProofBuffer` instead. Exactly one source must be
    /// provided.
    pub inline_proof: Option<Vec<u8>>,
}

#[derive(Accounts)]
#[instruction(args: VerifyOutcomeArgs)]
pub struct VerifyOutcome<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [Config::SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: pinned to the configured TxLINE program id — the CPI target
    /// can never be swapped by a relayer.
    #[account(
        executable,
        address = config.txline_program_id @ ProoflineError::WrongTxlineProgram
    )]
    pub txline_program: UncheckedAccount<'info>,
    /// CHECK: TxLINE daily-root commitment account. Forwarded to TxOracle,
    /// which is the authority on whether it is the right root for this
    /// fixture's date; its address is also fingerprinted into
    /// `validation_instruction_hash`.
    pub daily_root: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + VerifiedOutcome::INIT_SPACE,
        seeds = [
            VerifiedOutcome::SEED,
            &args.fixture_id.to_be_bytes(),
            &args.score_sequence.to_be_bytes(),
        ],
        bump
    )]
    pub verified_outcome: Account<'info, VerifiedOutcome>,
    /// Sealed staging buffer — required iff `args.inline_proof` is `None`.
    pub proof_buffer: Option<Account<'info, ProofBuffer>>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: any auxiliary accounts TxOracle's
    // validate_stat_v2 requires, forwarded verbatim (signer flags stripped).
}

pub fn verify_outcome<'info>(
    ctx: Context<'_, '_, 'info, 'info, VerifyOutcome<'info>>,
    args: VerifyOutcomeArgs,
) -> Result<()> {
    let proof = resolve_proof_bytes(&args, ctx.accounts.proof_buffer.as_deref())?;
    let validation_hash = run_txline_verification(
        &ctx.accounts.config,
        &ctx.accounts.txline_program.to_account_info(),
        &ctx.accounts.daily_root.to_account_info(),
        ctx.remaining_accounts,
        &args,
        &proof,
    )?;
    record_verified_outcome(
        &mut ctx.accounts.verified_outcome,
        &args,
        ctx.accounts.daily_root.key(),
        validation_hash,
        ctx.bumps.verified_outcome,
    )
}

/// Pick exactly one proof source. Buffer path enforces the seal contract:
/// sealed, and contents still hash to the sealed hash.
pub fn resolve_proof_bytes(
    args: &VerifyOutcomeArgs,
    proof_buffer: Option<&ProofBuffer>,
) -> Result<Vec<u8>> {
    match (&args.inline_proof, proof_buffer) {
        (Some(inline), None) => {
            require!(!inline.is_empty(), ProoflineError::EmptyProof);
            Ok(inline.clone())
        }
        (None, Some(buffer)) => {
            require!(buffer.sealed, ProoflineError::BufferNotSealed);
            require!(
                seal_matches(&buffer.data, &buffer.expected_hash),
                ProoflineError::SealHashMismatch
            );
            Ok(buffer.data.clone())
        }
        (Some(_), Some(_)) => err!(ProoflineError::AmbiguousProofSource),
        (None, None) => err!(ProoflineError::MissingProofSource),
    }
}

/// The verification core shared by `verify_outcome`, `on_report` and
/// `verify_and_publish_inline`:
///   1. finals-only gate (`period == 100`);
///   2. CPI into the CONFIGURED TxOracle program with an exact-equality
///      predicate over the reported final scores;
///   3. return-data check — originating program id must equal the
///      configured TxLINE program before the Boolean is trusted
///      (§3.10 item 1);
///   4. fingerprint the exact validation instruction (§3.10 item 8).
pub fn run_txline_verification<'info>(
    config: &Account<'info, Config>,
    txline_program: &AccountInfo<'info>,
    daily_root: &AccountInfo<'info>,
    remaining: &[AccountInfo<'info>],
    args: &VerifyOutcomeArgs,
    proof: &[u8],
) -> Result<[u8; 32]> {
    require!(args.period == FINAL_PERIOD, ProoflineError::NotFinalPeriod);

    let cpi_args = ValidateStatV2Args {
        fixture_id: args.fixture_id,
        sequence: args.score_sequence,
        period: args.period,
        participant_1_score: args.participant_1_score,
        participant_2_score: args.participant_2_score,
        proof: proof.to_vec(),
    };
    let ix = build_validate_stat_v2_ix(
        config.txline_program_id,
        daily_root.key(),
        remaining,
        &cpi_args,
    )?;

    let mut infos: Vec<AccountInfo<'info>> = Vec::with_capacity(remaining.len() + 2);
    infos.push(daily_root.clone());
    infos.extend_from_slice(remaining);
    infos.push(txline_program.clone());
    invoke(&ix, &infos)?;

    // Trust the Boolean only after the program-id check.
    require_txline_true(&config.txline_program_id)?;

    Ok(validation_instruction_hash(
        &config.txline_program_id,
        &daily_root.key(),
        &ix.data,
    ))
}

/// Freeze the verified facts into the `VerifiedOutcome` PDA. From here on
/// the only permitted mutation is `publish_outcome`'s one-shot publication
/// stamp.
pub fn record_verified_outcome(
    outcome: &mut VerifiedOutcome,
    args: &VerifyOutcomeArgs,
    daily_root: Pubkey,
    validation_hash: [u8; 32],
    bump: u8,
) -> Result<()> {
    outcome.fixture_id = args.fixture_id;
    outcome.score_sequence = args.score_sequence;
    outcome.proof_timestamp_ms = args.proof_timestamp_ms;
    outcome.period = args.period;
    outcome.participant_1_score = args.participant_1_score;
    outcome.participant_2_score = args.participant_2_score;
    outcome.result = derive_result(args.participant_1_score, args.participant_2_score);
    outcome.source_validation_version = SOURCE_VALIDATION_V2;
    outcome.daily_root_account = daily_root;
    outcome.validation_instruction_hash = validation_hash;
    outcome.proof_bundle_hash = args.proof_bundle_hash;
    outcome.verified_slot = Clock::get()?.slot;
    outcome.published = false;
    outcome.wormhole_emitter = Pubkey::default();
    outcome.wormhole_sequence = 0;
    outcome.wormhole_message = Pubkey::default();
    outcome.bump = bump;
    Ok(())
}
