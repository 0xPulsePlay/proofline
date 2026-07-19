//! `MatchOutcomeV1` — the fixed-width, versioned, domain-separated
//! cross-chain payload (176 bytes, all multi-byte integers BIG-ENDIAN —
//! network order, matching Wormhole payload conventions and cheap Solidity
//! slicing).
//!
//! This is deliberately NOT a mirror of TxLINE's Solana account structure:
//! Base consumers get a compact, stable application message (design §3.5).
//!
//! CROSS-LANGUAGE TRUTH: this layout is defined once in
//! `packages/protocol/src/payload.ts`; the conformance vector at
//! `packages/test-vectors/match-outcome-v1.json` pins the exact bytes, and
//! `tests/payload_conformance.rs` asserts this serializer reproduces the
//! vector byte-for-byte.
//!
//! Layout (offset / size / field):
//! ```text
//!   0    4   magic "PRFL"
//!   4    1   version (1)
//!   5    1   message_type (1 = MATCH_OUTCOME)
//!   6    2   flags
//!   8    2   destination_chain (Wormhole chain id)
//!   10   1   source_validation_version (1|2|3)
//!   11   1   result (1=HOME 2=DRAW 3=AWAY; 0 reserved/invalid)
//!   12   8   fixture_id (i64)
//!   20   8   score_sequence (i64)
//!   28   8   proof_timestamp_ms (i64)
//!   36   4   period (i32)
//!   40   4   participant_1_score (i32)
//!   44   4   participant_2_score (i32)
//!   48   32  txline_program_id
//!   80   32  daily_root_account
//!   112  32  validation_instruction_hash
//!   144  32  proof_bundle_hash
//! ```

/// ASCII "PRFL".
pub const PAYLOAD_MAGIC: [u8; 4] = *b"PRFL";
pub const PAYLOAD_VERSION: u8 = 1;
pub const MESSAGE_TYPE_MATCH_OUTCOME: u8 = 1;
pub const MATCH_OUTCOME_V1_LENGTH: usize = 176;

/// Match result codes. 0 is reserved so an all-zero payload can never
/// decode as a valid outcome.
pub const RESULT_HOME: u8 = 1;
pub const RESULT_DRAW: u8 = 2;
pub const RESULT_AWAY: u8 = 3;

/// Derive the result code from the verified final scores. The result is
/// always computed on-chain from the scores TxOracle verified — never taken
/// from the caller.
pub fn derive_result(participant_1_score: i32, participant_2_score: i32) -> u8 {
    if participant_1_score > participant_2_score {
        RESULT_HOME
    } else if participant_1_score == participant_2_score {
        RESULT_DRAW
    } else {
        RESULT_AWAY
    }
}

/// Bounds check for the result enum (used on decode and by the receivers).
pub fn is_valid_result(code: u8) -> bool {
    (RESULT_HOME..=RESULT_AWAY).contains(&code)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchOutcomeV1 {
    pub flags: u16,
    pub destination_chain: u16,
    pub source_validation_version: u8,
    pub result: u8,
    pub fixture_id: i64,
    pub score_sequence: i64,
    pub proof_timestamp_ms: i64,
    pub period: i32,
    pub participant_1_score: i32,
    pub participant_2_score: i32,
    pub txline_program_id: [u8; 32],
    pub daily_root_account: [u8; 32],
    pub validation_instruction_hash: [u8; 32],
    pub proof_bundle_hash: [u8; 32],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PayloadError {
    BadLength,
    BadMagic,
    UnsupportedVersion,
    UnsupportedMessageType,
    InvalidResult,
}

impl MatchOutcomeV1 {
    /// Serialize to the exact 176-byte big-endian wire format.
    pub fn encode(&self) -> [u8; MATCH_OUTCOME_V1_LENGTH] {
        let mut b = [0u8; MATCH_OUTCOME_V1_LENGTH];
        b[0..4].copy_from_slice(&PAYLOAD_MAGIC);
        b[4] = PAYLOAD_VERSION;
        b[5] = MESSAGE_TYPE_MATCH_OUTCOME;
        b[6..8].copy_from_slice(&self.flags.to_be_bytes());
        b[8..10].copy_from_slice(&self.destination_chain.to_be_bytes());
        b[10] = self.source_validation_version;
        b[11] = self.result;
        b[12..20].copy_from_slice(&self.fixture_id.to_be_bytes());
        b[20..28].copy_from_slice(&self.score_sequence.to_be_bytes());
        b[28..36].copy_from_slice(&self.proof_timestamp_ms.to_be_bytes());
        b[36..40].copy_from_slice(&self.period.to_be_bytes());
        b[40..44].copy_from_slice(&self.participant_1_score.to_be_bytes());
        b[44..48].copy_from_slice(&self.participant_2_score.to_be_bytes());
        b[48..80].copy_from_slice(&self.txline_program_id);
        b[80..112].copy_from_slice(&self.daily_root_account);
        b[112..144].copy_from_slice(&self.validation_instruction_hash);
        b[144..176].copy_from_slice(&self.proof_bundle_hash);
        b
    }

    /// Strict decode — rejects wrong length, magic, version, message type
    /// and out-of-bounds result codes.
    pub fn decode(bytes: &[u8]) -> Result<Self, PayloadError> {
        if bytes.len() != MATCH_OUTCOME_V1_LENGTH {
            return Err(PayloadError::BadLength);
        }
        if bytes[0..4] != PAYLOAD_MAGIC {
            return Err(PayloadError::BadMagic);
        }
        if bytes[4] != PAYLOAD_VERSION {
            return Err(PayloadError::UnsupportedVersion);
        }
        if bytes[5] != MESSAGE_TYPE_MATCH_OUTCOME {
            return Err(PayloadError::UnsupportedMessageType);
        }
        let result = bytes[11];
        if !is_valid_result(result) {
            return Err(PayloadError::InvalidResult);
        }
        let be_u16 = |o: usize| u16::from_be_bytes([bytes[o], bytes[o + 1]]);
        let be_i32 = |o: usize| {
            i32::from_be_bytes([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]])
        };
        let be_i64 = |o: usize| {
            let mut a = [0u8; 8];
            a.copy_from_slice(&bytes[o..o + 8]);
            i64::from_be_bytes(a)
        };
        let arr32 = |o: usize| {
            let mut a = [0u8; 32];
            a.copy_from_slice(&bytes[o..o + 32]);
            a
        };
        Ok(Self {
            flags: be_u16(6),
            destination_chain: be_u16(8),
            source_validation_version: bytes[10],
            result,
            fixture_id: be_i64(12),
            score_sequence: be_i64(20),
            proof_timestamp_ms: be_i64(28),
            period: be_i32(36),
            participant_1_score: be_i32(40),
            participant_2_score: be_i32(44),
            txline_program_id: arr32(48),
            daily_root_account: arr32(80),
            validation_instruction_hash: arr32(112),
            proof_bundle_hash: arr32(144),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> MatchOutcomeV1 {
        MatchOutcomeV1 {
            flags: 0,
            destination_chain: 10004,
            source_validation_version: 2,
            result: RESULT_HOME,
            fixture_id: 982341,
            score_sequence: 184,
            proof_timestamp_ms: 1_784_498_100_000,
            period: 100,
            participant_1_score: 2,
            participant_2_score: 1,
            txline_program_id: [0x11; 32],
            daily_root_account: [0x22; 32],
            validation_instruction_hash: [0x33; 32],
            proof_bundle_hash: [0x44; 32],
        }
    }

    #[test]
    fn roundtrip() {
        let o = sample();
        let bytes = o.encode();
        assert_eq!(bytes.len(), MATCH_OUTCOME_V1_LENGTH);
        assert_eq!(MatchOutcomeV1::decode(&bytes).unwrap(), o);
    }

    #[test]
    fn decode_rejects_bad_length_magic_version_type() {
        let o = sample();
        let bytes = o.encode();

        assert_eq!(
            MatchOutcomeV1::decode(&bytes[..175]),
            Err(PayloadError::BadLength)
        );

        let mut bad = bytes;
        bad[0] = b'X';
        assert_eq!(MatchOutcomeV1::decode(&bad), Err(PayloadError::BadMagic));

        let mut bad = o.encode();
        bad[4] = 9;
        assert_eq!(
            MatchOutcomeV1::decode(&bad),
            Err(PayloadError::UnsupportedVersion)
        );

        let mut bad = o.encode();
        bad[5] = 9;
        assert_eq!(
            MatchOutcomeV1::decode(&bad),
            Err(PayloadError::UnsupportedMessageType)
        );
    }

    #[test]
    fn result_enum_bounds() {
        assert!(!is_valid_result(0)); // reserved — all-zero payload invalid
        assert!(is_valid_result(RESULT_HOME));
        assert!(is_valid_result(RESULT_DRAW));
        assert!(is_valid_result(RESULT_AWAY));
        assert!(!is_valid_result(4));
        assert!(!is_valid_result(255));

        let mut bad = sample().encode();
        bad[11] = 0;
        assert_eq!(
            MatchOutcomeV1::decode(&bad),
            Err(PayloadError::InvalidResult)
        );
        bad[11] = 4;
        assert_eq!(
            MatchOutcomeV1::decode(&bad),
            Err(PayloadError::InvalidResult)
        );
    }

    #[test]
    fn result_is_derived_from_scores() {
        assert_eq!(derive_result(2, 1), RESULT_HOME);
        assert_eq!(derive_result(0, 0), RESULT_DRAW);
        assert_eq!(derive_result(1, 3), RESULT_AWAY);
    }
}
