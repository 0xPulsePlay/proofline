//! Raw instruction builder for TxOracle `validate_stat_v2`.
//!
//! Built by hand (rather than via a generated CPI crate) because TxOracle
//! ships no public crate — only a deployed program + IDL. The instruction
//! is always built against the program id stored in `Config`, never against
//! a caller-supplied id.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use solana_keccak_hasher as keccak;
use solana_sha256_hasher as sha256;

use super::idl_types::ValidateStatV2Args;

/// Anchor global-namespace method discriminator:
/// `sha256("global:validate_stat_v2")[..8]`.
pub fn validate_stat_v2_discriminator() -> [u8; 8] {
    let h = sha256::hash(b"global:validate_stat_v2");
    let mut d = [0u8; 8];
    d.copy_from_slice(&h.to_bytes()[..8]);
    d
}

/// Serialize discriminator + borsh args into raw instruction data.
pub fn validate_stat_v2_data(args: &ValidateStatV2Args) -> Result<Vec<u8>> {
    let mut data = validate_stat_v2_discriminator().to_vec();
    args.serialize(&mut data)
        .map_err(|_| error!(crate::ProoflineError::SerializationFailed))?;
    Ok(data)
}

/// Build the full `validate_stat_v2` instruction.
///
/// Account order mirrors TxOracle's IDL: the daily root account first, then
/// any auxiliary accounts the deployed verifier requires (forwarded verbatim
/// from `remaining_accounts`). All metas are forwarded WITHOUT signer flags
/// — TxOracle's verifier is read-only over commitments and must never
/// receive this program's (or the payer's) signer privilege by extension.
pub fn build_validate_stat_v2_ix(
    txline_program_id: Pubkey,
    daily_root: Pubkey,
    remaining: &[AccountInfo],
    args: &ValidateStatV2Args,
) -> Result<Instruction> {
    let mut accounts = vec![AccountMeta::new_readonly(daily_root, false)];
    for info in remaining {
        accounts.push(AccountMeta {
            pubkey: *info.key,
            is_signer: false,
            is_writable: info.is_writable,
        });
    }
    Ok(Instruction {
        program_id: txline_program_id,
        accounts,
        data: validate_stat_v2_data(args)?,
    })
}

/// keccak256(txline_program_id ‖ daily_root ‖ raw instruction data) — the
/// `validation_instruction_hash` fingerprint carried in `MatchOutcomeV1`
/// (§3.10 item 8: hash the EXACT TxLINE validation instruction). Level 3
/// computes the identical hash off-chain over the identical bytes, which is
/// what lets both lanes derive the same attestation id on Base.
pub fn validation_instruction_hash(
    txline_program_id: &Pubkey,
    daily_root: &Pubkey,
    ix_data: &[u8],
) -> [u8; 32] {
    keccak::hashv(&[txline_program_id.as_ref(), daily_root.as_ref(), ix_data]).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::txline::idl_types::FINAL_PERIOD;

    #[test]
    fn discriminator_is_stable_and_prefixes_data() {
        let args = ValidateStatV2Args {
            fixture_id: 982341,
            sequence: 184,
            period: FINAL_PERIOD,
            participant_1_score: 2,
            participant_2_score: 1,
            proof: vec![1, 2, 3],
        };
        let data = validate_stat_v2_data(&args).unwrap();
        assert_eq!(&data[..8], &validate_stat_v2_discriminator());
        let back = ValidateStatV2Args::try_from_slice(&data[8..]).unwrap();
        assert_eq!(back, args);
    }

    #[test]
    fn instruction_hash_changes_with_any_component() {
        let p1 = Pubkey::new_unique();
        let p2 = Pubkey::new_unique();
        let root = Pubkey::new_unique();
        let h = validation_instruction_hash(&p1, &root, b"data");
        assert_ne!(h, validation_instruction_hash(&p2, &root, b"data"));
        assert_ne!(h, validation_instruction_hash(&p1, &p2, b"data"));
        assert_ne!(h, validation_instruction_hash(&p1, &root, b"datb"));
    }
}
