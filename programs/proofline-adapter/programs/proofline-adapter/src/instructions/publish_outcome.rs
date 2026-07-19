//! Transaction B of the two-transaction design: serialize `MatchOutcomeV1`
//! from an existing `VerifiedOutcome` and emit it through the Wormhole core
//! bridge — plus the optional single-transaction fast path
//! (`verify_and_publish_inline`) for proofs whose compute footprint fits.
//!
//! The two-transaction default is an explicit architectural decision, not a
//! compromise: TxOracle verification and Wormhole publication do not share
//! one compute budget, and the demo gets two distinct, inspectable Solana
//! slots ("TxLINE proof verified" / "Wormhole message emitted").
//!
//! THE ONLY ROAD TO A WORMHOLE MESSAGE runs through a `VerifiedOutcome` PDA
//! minted by a successful TxOracle CPI. There is no admin publish path, no
//! raw-payload instruction, no bypass (§3.10 item 3).

use anchor_lang::prelude::*;

use crate::instructions::verify_outcome::{
    record_verified_outcome, resolve_proof_bytes, run_txline_verification, VerifyOutcomeArgs,
};
use crate::state::{Config, ProofBuffer, VerifiedOutcome};
use crate::wormhole::emitter::{post_message, PostMessageAccounts, EMITTER_SEED};
use crate::wormhole::payload::MatchOutcomeV1;
use crate::ProoflineError;

/// Wormhole nonce — deduplication happens by emitter sequence, so a
/// constant nonce is fine.
const WORMHOLE_NONCE: u32 = 0;

/// Build the 176-byte cross-chain payload for a verified outcome.
pub fn build_payload(config: &Config, outcome: &VerifiedOutcome) -> [u8; 176] {
    MatchOutcomeV1 {
        flags: 0,
        destination_chain: config.destination_chain,
        source_validation_version: outcome.source_validation_version,
        result: outcome.result,
        fixture_id: outcome.fixture_id,
        score_sequence: outcome.score_sequence,
        proof_timestamp_ms: outcome.proof_timestamp_ms,
        period: outcome.period,
        participant_1_score: outcome.participant_1_score,
        participant_2_score: outcome.participant_2_score,
        txline_program_id: config.txline_program_id.to_bytes(),
        daily_root_account: outcome.daily_root_account.to_bytes(),
        validation_instruction_hash: outcome.validation_instruction_hash,
        proof_bundle_hash: outcome.proof_bundle_hash,
    }
    .encode()
}

#[derive(Accounts)]
pub struct PublishOutcome<'info> {
    /// Any relayer — publication is permissionless; the payer only funds
    /// the bridge fee and message rent.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [Config::SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [
            VerifiedOutcome::SEED,
            &verified_outcome.fixture_id.to_be_bytes(),
            &verified_outcome.score_sequence.to_be_bytes(),
        ],
        bump = verified_outcome.bump,
        constraint = !verified_outcome.published @ ProoflineError::AlreadyPublished
    )]
    pub verified_outcome: Account<'info, VerifiedOutcome>,
    /// CHECK: this program's sole Wormhole emitter PDA; signs the
    /// post_message CPI via seeds.
    #[account(seeds = [EMITTER_SEED], bump = config.emitter_bump)]
    pub emitter: UncheckedAccount<'info>,
    /// CHECK: pinned to the configured Wormhole core bridge.
    #[account(
        executable,
        address = config.wormhole_core @ ProoflineError::WrongWormholeProgram
    )]
    pub wormhole_program: UncheckedAccount<'info>,
    /// CHECK: core bridge config PDA, derivation enforced against the
    /// configured bridge program.
    #[account(mut, seeds = [b"Bridge"], bump, seeds::program = config.wormhole_core)]
    pub wormhole_bridge: UncheckedAccount<'info>,
    /// CHECK: bridge fee collector PDA.
    #[account(mut, seeds = [b"fee_collector"], bump, seeds::program = config.wormhole_core)]
    pub wormhole_fee_collector: UncheckedAccount<'info>,
    /// CHECK: per-emitter sequence tracker PDA (created by the bridge on
    /// first message).
    #[account(
        mut,
        seeds = [b"Sequence", emitter.key().as_ref()],
        bump,
        seeds::program = config.wormhole_core
    )]
    pub wormhole_sequence: UncheckedAccount<'info>,
    /// Fresh message account keypair; the bridge initializes and owns it.
    #[account(mut)]
    pub wormhole_message: Signer<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

pub fn publish_outcome(ctx: Context<PublishOutcome>) -> Result<()> {
    let payload = build_payload(&ctx.accounts.config, &ctx.accounts.verified_outcome);
    let sequence = post_message(
        &PostMessageAccounts {
            wormhole_program: &ctx.accounts.wormhole_program.to_account_info(),
            bridge: &ctx.accounts.wormhole_bridge.to_account_info(),
            message: &ctx.accounts.wormhole_message.to_account_info(),
            emitter: &ctx.accounts.emitter.to_account_info(),
            sequence: &ctx.accounts.wormhole_sequence.to_account_info(),
            payer: &ctx.accounts.payer.to_account_info(),
            fee_collector: &ctx.accounts.wormhole_fee_collector.to_account_info(),
            clock: &ctx.accounts.clock.to_account_info(),
            rent: &ctx.accounts.rent.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        },
        &payload,
        WORMHOLE_NONCE,
        ctx.accounts.config.emitter_bump,
    )?;

    let outcome = &mut ctx.accounts.verified_outcome;
    outcome.published = true;
    outcome.wormhole_emitter = ctx.accounts.emitter.key();
    outcome.wormhole_sequence = sequence;
    outcome.wormhole_message = ctx.accounts.wormhole_message.key();
    Ok(())
}

/// Single-transaction fast path: verify + publish in one instruction, for
/// proofs whose compute footprint comfortably fits one budget. Runs the
/// IDENTICAL verification core and the IDENTICAL publish path — it is a
/// packaging optimization, not a second trust path.
#[derive(Accounts)]
#[instruction(args: VerifyOutcomeArgs)]
pub struct VerifyAndPublishInline<'info> {
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
            &args.fixture_id.to_be_bytes(),
            &args.score_sequence.to_be_bytes(),
        ],
        bump
    )]
    pub verified_outcome: Account<'info, VerifiedOutcome>,
    pub proof_buffer: Option<Account<'info, ProofBuffer>>,
    /// CHECK: emitter PDA (see `PublishOutcome`).
    #[account(seeds = [EMITTER_SEED], bump = config.emitter_bump)]
    pub emitter: UncheckedAccount<'info>,
    /// CHECK: pinned to the configured Wormhole core bridge.
    #[account(
        executable,
        address = config.wormhole_core @ ProoflineError::WrongWormholeProgram
    )]
    pub wormhole_program: UncheckedAccount<'info>,
    /// CHECK: core bridge config PDA.
    #[account(mut, seeds = [b"Bridge"], bump, seeds::program = config.wormhole_core)]
    pub wormhole_bridge: UncheckedAccount<'info>,
    /// CHECK: bridge fee collector PDA.
    #[account(mut, seeds = [b"fee_collector"], bump, seeds::program = config.wormhole_core)]
    pub wormhole_fee_collector: UncheckedAccount<'info>,
    /// CHECK: per-emitter sequence tracker PDA.
    #[account(
        mut,
        seeds = [b"Sequence", emitter.key().as_ref()],
        bump,
        seeds::program = config.wormhole_core
    )]
    pub wormhole_sequence: UncheckedAccount<'info>,
    /// Fresh message account keypair; the bridge initializes and owns it.
    #[account(mut)]
    pub wormhole_message: Signer<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: auxiliary TxOracle accounts, as in VerifyOutcome.
}

pub fn verify_and_publish_inline<'info>(
    ctx: Context<'_, '_, 'info, 'info, VerifyAndPublishInline<'info>>,
    args: VerifyOutcomeArgs,
) -> Result<()> {
    // Verify (identical core to verify_outcome).
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
    )?;

    // Publish (identical path to publish_outcome).
    let payload = build_payload(&ctx.accounts.config, &ctx.accounts.verified_outcome);
    let sequence = post_message(
        &PostMessageAccounts {
            wormhole_program: &ctx.accounts.wormhole_program.to_account_info(),
            bridge: &ctx.accounts.wormhole_bridge.to_account_info(),
            message: &ctx.accounts.wormhole_message.to_account_info(),
            emitter: &ctx.accounts.emitter.to_account_info(),
            sequence: &ctx.accounts.wormhole_sequence.to_account_info(),
            payer: &ctx.accounts.payer.to_account_info(),
            fee_collector: &ctx.accounts.wormhole_fee_collector.to_account_info(),
            clock: &ctx.accounts.clock.to_account_info(),
            rent: &ctx.accounts.rent.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        },
        &payload,
        WORMHOLE_NONCE,
        ctx.accounts.config.emitter_bump,
    )?;

    let outcome = &mut ctx.accounts.verified_outcome;
    outcome.published = true;
    outcome.wormhole_emitter = ctx.accounts.emitter.key();
    outcome.wormhole_sequence = sequence;
    outcome.wormhole_message = ctx.accounts.wormhole_message.key();
    Ok(())
}
