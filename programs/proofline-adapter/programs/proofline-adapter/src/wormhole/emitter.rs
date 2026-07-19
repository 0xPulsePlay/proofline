//! Raw Wormhole Core Bridge `post_message` CPI.
//!
//! Wormhole CORE MESSAGING only — explicitly not the token bridge: the
//! object crossing chains is a signed attestation message, not a token.
//!
//! Why a hand-rolled CPI instead of `wormhole-anchor-sdk`: the published
//! SDK pins anchor-lang 0.29.x, which conflicts with this workspace's
//! anchor-lang 0.32.x (compiling beats fancy — accepted trade-off). The
//! account order and data layout below mirror the Wormhole core bridge's
//! own `post_message` instruction builder
//! (wormhole-foundation/wormhole, solana/bridge/program).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::system_instruction;

use crate::ProoflineError;

/// Seed of this program's Wormhole emitter PDA. One program, one emitter —
/// Base registers exactly this one emitter address (§3.10 item 2).
pub const EMITTER_SEED: &[u8] = b"emitter";

/// Wormhole core bridge instruction tag for `PostMessage` (enum index 1 in
/// the bridge's serialized instruction set).
pub const WORMHOLE_IX_POST_MESSAGE: u8 = 1;

/// Wormhole consistency level: 0 = Confirmed, 1 = Finalized. Outcome
/// attestations always wait for finality.
pub const CONSISTENCY_LEVEL_FINALIZED: u8 = 1;

/// Parse the message fee out of the core bridge's `BridgeData` config
/// account. Borsh layout: guardian_set_index u32 ‖ last_lamports u64 ‖
/// BridgeConfig { guardian_set_expiration_time: u32, fee: u64 } — fee at
/// byte offset 16, little-endian.
pub fn parse_bridge_fee(bridge_data: &[u8]) -> Result<u64> {
    if bridge_data.len() < 24 {
        return err!(ProoflineError::MalformedBridgeConfig);
    }
    let mut fee = [0u8; 8];
    fee.copy_from_slice(&bridge_data[16..24]);
    Ok(u64::from_le_bytes(fee))
}

/// Parse a Wormhole `Sequence` tracker account (u64 LE = sequence of the
/// NEXT message). Returns the sequence that was just assigned, i.e.
/// `stored - 1`, when read immediately after a successful `post_message`.
pub fn parse_assigned_sequence(sequence_data: &[u8]) -> Result<u64> {
    if sequence_data.len() < 8 {
        return err!(ProoflineError::MalformedSequenceAccount);
    }
    let mut next = [0u8; 8];
    next.copy_from_slice(&sequence_data[..8]);
    let next = u64::from_le_bytes(next);
    if next == 0 {
        return err!(ProoflineError::MalformedSequenceAccount);
    }
    Ok(next - 1)
}

/// Borsh-shaped `PostMessageData`: tag ‖ nonce u32 LE ‖ payload (u32 LE
/// length prefix + bytes) ‖ consistency_level u8.
pub fn post_message_data(nonce: u32, payload: &[u8], consistency_level: u8) -> Vec<u8> {
    let mut data = Vec::with_capacity(1 + 4 + 4 + payload.len() + 1);
    data.push(WORMHOLE_IX_POST_MESSAGE);
    data.extend_from_slice(&nonce.to_le_bytes());
    data.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    data.extend_from_slice(payload);
    data.push(consistency_level);
    data
}

/// All the accounts the core bridge `post_message` instruction touches, in
/// the bridge's canonical order.
pub struct PostMessageAccounts<'a, 'info> {
    pub wormhole_program: &'a AccountInfo<'info>,
    pub bridge: &'a AccountInfo<'info>,
    pub message: &'a AccountInfo<'info>,
    pub emitter: &'a AccountInfo<'info>,
    pub sequence: &'a AccountInfo<'info>,
    pub payer: &'a AccountInfo<'info>,
    pub fee_collector: &'a AccountInfo<'info>,
    pub clock: &'a AccountInfo<'info>,
    pub rent: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

/// Pay the bridge fee (if any) and post `payload` as a Wormhole message
/// signed by this program's emitter PDA. Returns the assigned sequence.
pub fn post_message(
    accounts: &PostMessageAccounts,
    payload: &[u8],
    nonce: u32,
    emitter_bump: u8,
) -> Result<u64> {
    // 1. Bridge message fee → fee collector (required before post_message).
    let fee = parse_bridge_fee(&accounts.bridge.try_borrow_data()?)?;
    if fee > 0 {
        invoke(
            &system_instruction::transfer(accounts.payer.key, accounts.fee_collector.key, fee),
            &[
                accounts.payer.clone(),
                accounts.fee_collector.clone(),
                accounts.system_program.clone(),
            ],
        )?;
    }

    // 2. post_message, with the emitter PDA co-signing via seeds.
    let ix = Instruction {
        program_id: *accounts.wormhole_program.key,
        accounts: vec![
            AccountMeta::new(*accounts.bridge.key, false),
            AccountMeta::new(*accounts.message.key, true),
            AccountMeta::new_readonly(*accounts.emitter.key, true),
            AccountMeta::new(*accounts.sequence.key, false),
            AccountMeta::new(*accounts.payer.key, true),
            AccountMeta::new(*accounts.fee_collector.key, false),
            AccountMeta::new_readonly(*accounts.clock.key, false),
            AccountMeta::new_readonly(*accounts.rent.key, false),
            AccountMeta::new_readonly(*accounts.system_program.key, false),
        ],
        data: post_message_data(nonce, payload, CONSISTENCY_LEVEL_FINALIZED),
    };
    invoke_signed(
        &ix,
        &[
            accounts.bridge.clone(),
            accounts.message.clone(),
            accounts.emitter.clone(),
            accounts.sequence.clone(),
            accounts.payer.clone(),
            accounts.fee_collector.clone(),
            accounts.clock.clone(),
            accounts.rent.clone(),
            accounts.system_program.clone(),
        ],
        &[&[EMITTER_SEED, &[emitter_bump]]],
    )?;

    // 3. The bridge just incremented the sequence tracker; the message we
    //    posted carries stored - 1.
    parse_assigned_sequence(&accounts.sequence.try_borrow_data()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_fee_parses_from_config_layout() {
        // guardian_set_index=7, last_lamports=99, expiration=86400, fee=100
        let mut data = Vec::new();
        data.extend_from_slice(&7u32.to_le_bytes());
        data.extend_from_slice(&99u64.to_le_bytes());
        data.extend_from_slice(&86400u32.to_le_bytes());
        data.extend_from_slice(&100u64.to_le_bytes());
        assert_eq!(parse_bridge_fee(&data).unwrap(), 100);
        assert!(parse_bridge_fee(&data[..20]).is_err());
    }

    #[test]
    fn sequence_parses_as_stored_minus_one() {
        assert_eq!(parse_assigned_sequence(&1u64.to_le_bytes()).unwrap(), 0);
        assert_eq!(parse_assigned_sequence(&42u64.to_le_bytes()).unwrap(), 41);
        assert!(parse_assigned_sequence(&0u64.to_le_bytes()).is_err());
        assert!(parse_assigned_sequence(&[1, 2, 3]).is_err());
    }

    #[test]
    fn post_message_data_layout() {
        let data = post_message_data(0, b"PRFL-payload", CONSISTENCY_LEVEL_FINALIZED);
        assert_eq!(data[0], WORMHOLE_IX_POST_MESSAGE);
        assert_eq!(&data[1..5], &0u32.to_le_bytes());
        assert_eq!(&data[5..9], &(12u32).to_le_bytes());
        assert_eq!(&data[9..21], b"PRFL-payload");
        assert_eq!(data[21], CONSISTENCY_LEVEL_FINALIZED);
        assert_eq!(data.len(), 22);
    }
}
