use anchor_lang::prelude::*;

/// Global adapter configuration. Created exactly once by `initialize_config`.
///
/// Deliberately minimal and deliberately *static*: there is no
/// `update_config` instruction and no admin-controlled publish path
/// (security checklist §3.10 item 3). The `admin` key is recorded purely for
/// provenance/attribution — it grants zero runtime authority. The only way a
/// Wormhole message leaves this program is through a `VerifiedOutcome` PDA
/// that was created by a successful TxOracle CPI.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Key that ran `initialize_config`. Provenance only — carries no
    /// runtime authority (no publish path, no config mutation path).
    pub admin: Pubkey,
    /// The TxLINE TxOracle program this adapter CPIs into, and the ONLY
    /// program id whose return data is trusted (§3.10 item 1).
    pub txline_program_id: Pubkey,
    /// Wormhole Core Bridge program id (core messaging, NOT the token
    /// bridge).
    pub wormhole_core: Pubkey,
    /// Chainlink Keystone Forwarder authority allowed to drive `on_report`.
    /// Liveness-only: the same verify path is open permissionlessly via
    /// `verify_outcome`, so this authority cannot forge and cannot censor.
    pub forwarder_authority: Pubkey,
    /// Bump of the `["emitter"]` PDA that signs Wormhole `post_message`.
    pub emitter_bump: u8,
    /// Wormhole destination chain id stamped into every MatchOutcomeV1
    /// payload (Base = 30, Base Sepolia = 10004).
    pub destination_chain: u16,
    /// Bump of this config PDA.
    pub bump: u8,
}

impl Config {
    pub const SEED: &'static [u8] = b"config";
}
