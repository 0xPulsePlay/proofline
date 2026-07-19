//! Chainlink Keystone Forwarder entrypoint.
//!
//! `on_report(metadata, payload)` is the CRE-driven way to reach the SAME
//! verification core as `verify_outcome` — nothing more. The forwarder
//! authority gate is a LIVENESS credential, not a correctness one: a
//! compromised forwarder still cannot mint an outcome TxOracle refuses to
//! verify, and an unavailable forwarder is bypassed by anyone calling
//! `verify_outcome` directly (permissionless-by-design, §3.4).

use anchor_lang::prelude::*;

use crate::instructions::verify_outcome::{
    record_verified_outcome, resolve_proof_bytes, run_txline_verification, VerifyOutcomeArgs,
};
use crate::state::{Config, ProofBuffer, VerifiedOutcome};
use crate::ProoflineError;

/// Extract the big-endian fixture-id seed from a borsh `VerifyOutcomeArgs`
/// report payload. Falls back to zeroes on a malformed payload; the handler
/// then rejects the payload itself with a proper error before anything is
/// written.
pub fn report_fixture_seed(payload: &[u8]) -> [u8; 8] {
    VerifyOutcomeArgs::try_from_slice(payload)
        .map(|a| a.fixture_id.to_be_bytes())
        .unwrap_or([0u8; 8])
}

/// Companion to `report_fixture_seed` for the score-sequence seed.
pub fn report_sequence_seed(payload: &[u8]) -> [u8; 8] {
    VerifyOutcomeArgs::try_from_slice(payload)
        .map(|a| a.score_sequence.to_be_bytes())
        .unwrap_or([0u8; 8])
}

#[derive(Accounts)]
#[instruction(metadata: Vec<u8>, payload: Vec<u8>)]
pub struct OnReport<'info> {
    /// The configured Keystone Forwarder authority. This is the ONLY
    /// difference from `VerifyOutcome` — same verification core behind it.
    #[account(address = config.forwarder_authority @ ProoflineError::ForwarderMismatch)]
    pub forwarder_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [Config::SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: pinned to the configured TxLINE program id.
    #[account(
        executable,
        address = config.txline_program_id @ ProoflineError::WrongTxlineProgram
    )]
    pub txline_program: UncheckedAccount<'info>,
    /// CHECK: TxLINE daily-root commitment account (see `VerifyOutcome`).
    pub daily_root: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + VerifiedOutcome::INIT_SPACE,
        seeds = [
            VerifiedOutcome::SEED,
            &report_fixture_seed(&payload),
            &report_sequence_seed(&payload),
        ],
        bump
    )]
    pub verified_outcome: Account<'info, VerifiedOutcome>,
    pub proof_buffer: Option<Account<'info, ProofBuffer>>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: auxiliary TxOracle accounts, as in VerifyOutcome.
}

pub fn on_report<'info>(
    ctx: Context<'_, '_, 'info, 'info, OnReport<'info>>,
    metadata: Vec<u8>,
    payload: Vec<u8>,
) -> Result<()> {
    // Keystone report metadata (workflow/report ids) is logged for the
    // evidence trail but carries no authority here.
    msg!("keystone report metadata: {} bytes", metadata.len());

    let args = VerifyOutcomeArgs::try_from_slice(&payload)
        .map_err(|_| error!(ProoflineError::BadReportPayload))?;

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
