//! Rust mirrors of the TxLINE TxOracle IDL types this adapter touches.
//!
//! These are transcribed from TxOracle's published Anchor IDL, not invented
//! here: TxOracle is the deployed mainnet verifier
//! (`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`, see
//! `packages/protocol/src/constants.ts`, the cross-language source of
//! truth) and this adapter must produce byte-identical instruction data to
//! what TxLINE's own clients produce.

use anchor_lang::prelude::*;

/// TxLINE final-settlement marker: a score record is terminal when
/// `period == 100` (equivalently `statusId == 100`, the `game_finalised`
/// action). This adapter refuses to verify anything else — Proofline
/// attests final outcomes only, never in-play scores.
pub const FINAL_PERIOD: i32 = 100;

/// `source_validation_version` value for the `validate_stat_v2` generation.
pub const SOURCE_VALIDATION_V2: u8 = 2;

/// Argument struct for TxOracle `validate_stat_v2`, borsh-serialized after
/// the 8-byte Anchor discriminator.
///
/// VALIDATION PREDICATE — exact equality. TxOracle walks the Merkle proof
/// in `proof` against the daily root account passed as the instruction's
/// first account and returns `true` iff the committed terminal score record
/// for (`fixture_id`, `sequence`) has exactly `period == 100` and exactly
/// these two participant scores. There is no range/threshold mode in this
/// adapter: the reported final score either is the committed final score or
/// verification fails.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ValidateStatV2Args {
    /// TxLINE fixture id.
    pub fixture_id: i64,
    /// Score sequence number of the terminal record.
    pub sequence: i64,
    /// Period marker; must be `FINAL_PERIOD` for a final-score validation.
    pub period: i32,
    /// Reported final score, participant 1.
    pub participant_1_score: i32,
    /// Reported final score, participant 2.
    pub participant_2_score: i32,
    /// TxLINE Merkle proof bytes (leaf serialization + sibling path in
    /// TxLINE's own encoding — deliberately opaque to this adapter, see
    /// design §3.3: we reuse TxLINE's canonical verifier instead of
    /// reimplementing its byte-level encoding).
    pub proof: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_borsh_roundtrip() {
        let args = ValidateStatV2Args {
            fixture_id: 982341,
            sequence: 184,
            period: FINAL_PERIOD,
            participant_1_score: 2,
            participant_2_score: 1,
            proof: vec![0xde, 0xad, 0xbe, 0xef],
        };
        let bytes = args.try_to_vec().unwrap();
        let back = ValidateStatV2Args::try_from_slice(&bytes).unwrap();
        assert_eq!(args, back);
    }
}
