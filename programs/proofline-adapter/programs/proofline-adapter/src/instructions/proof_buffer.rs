//! ProofBuffer lifecycle: create → append chunks → seal → (verify) → close.
//!
//! The staged-upload path exists because a full TxLINE proof plus forwarder
//! report metadata may not fit one Solana transaction packet (design §3.5).
//! Everything here is uploader-gated for WRITE access but the uploader is
//! untrusted for CORRECTNESS — see `state::proof_buffer`.

use anchor_lang::prelude::*;

use crate::state::{Config, ProofBuffer};
use crate::ProoflineError;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [Config::SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    txline_program_id: Pubkey,
    wormhole_core: Pubkey,
    forwarder_authority: Pubkey,
    destination_chain: u16,
) -> Result<()> {
    let (_, emitter_bump) =
        Pubkey::find_program_address(&[crate::wormhole::emitter::EMITTER_SEED], &crate::ID);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.txline_program_id = txline_program_id;
    config.wormhole_core = wormhole_core;
    config.forwarder_authority = forwarder_authority;
    config.emitter_bump = emitter_bump;
    config.destination_chain = destination_chain;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
#[instruction(buffer_seed: u64, capacity: u32)]
pub struct InitializeProofBuffer<'info> {
    #[account(mut)]
    pub uploader: Signer<'info>,
    #[account(
        init,
        payer = uploader,
        space = ProofBuffer::space(capacity),
        seeds = [ProofBuffer::SEED, uploader.key().as_ref(), &buffer_seed.to_le_bytes()],
        bump
    )]
    pub proof_buffer: Account<'info, ProofBuffer>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_proof_buffer(
    ctx: Context<InitializeProofBuffer>,
    buffer_seed: u64,
    capacity: u32,
) -> Result<()> {
    require!(
        capacity > 0 && capacity <= ProofBuffer::MAX_CAPACITY,
        ProoflineError::CapacityOutOfRange
    );
    let buf = &mut ctx.accounts.proof_buffer;
    buf.uploader = ctx.accounts.uploader.key();
    buf.buffer_seed = buffer_seed;
    buf.capacity = capacity;
    buf.sealed = false;
    buf.expected_hash = [0u8; 32];
    buf.bump = ctx.bumps.proof_buffer;
    buf.data = Vec::new();
    Ok(())
}

#[derive(Accounts)]
pub struct AppendProofChunk<'info> {
    pub uploader: Signer<'info>,
    #[account(mut, has_one = uploader @ ProoflineError::UploaderMismatch)]
    pub proof_buffer: Account<'info, ProofBuffer>,
}

pub fn append_proof_chunk(ctx: Context<AppendProofChunk>, chunk: Vec<u8>) -> Result<()> {
    let buf = &mut ctx.accounts.proof_buffer;
    require!(!buf.sealed, ProoflineError::BufferSealed);
    require!(!chunk.is_empty(), ProoflineError::EmptyChunk);
    require!(
        buf.data.len() + chunk.len() <= buf.capacity as usize,
        ProoflineError::BufferCapacityExceeded
    );
    buf.data.extend_from_slice(&chunk);
    Ok(())
}

#[derive(Accounts)]
pub struct SealProof<'info> {
    pub uploader: Signer<'info>,
    #[account(mut, has_one = uploader @ ProoflineError::UploaderMismatch)]
    pub proof_buffer: Account<'info, ProofBuffer>,
}

/// Record the hash the uploaded bytes are expected to have and freeze the
/// buffer. After this, `append_proof_chunk` refuses the buffer forever and
/// `verify_outcome` will re-hash the contents and reject on mismatch — so a
/// seal with a wrong hash only ever bricks the uploader's own buffer.
pub fn seal_proof(ctx: Context<SealProof>, expected_hash: [u8; 32]) -> Result<()> {
    let buf = &mut ctx.accounts.proof_buffer;
    require!(!buf.sealed, ProoflineError::BufferSealed);
    require!(!buf.data.is_empty(), ProoflineError::EmptyProof);
    buf.expected_hash = expected_hash;
    buf.sealed = true;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseProofBuffer<'info> {
    #[account(mut)]
    pub uploader: Signer<'info>,
    #[account(
        mut,
        close = uploader,
        has_one = uploader @ ProoflineError::UploaderMismatch
    )]
    pub proof_buffer: Account<'info, ProofBuffer>,
}

/// Rent recovery for the uploader once a staged proof has served its
/// purpose (or never will). Uploader-only; closing a buffer can never
/// un-verify an outcome because `VerifiedOutcome` copies everything it
/// needs at verification time.
pub fn close_proof_buffer(_ctx: Context<CloseProofBuffer>) -> Result<()> {
    Ok(())
}
