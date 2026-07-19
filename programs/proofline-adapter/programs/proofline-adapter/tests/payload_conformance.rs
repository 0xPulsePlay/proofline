//! Cross-language conformance: the Rust `MatchOutcomeV1` serializer must
//! reproduce `packages/test-vectors/match-outcome-v1.json` byte-for-byte.
//! That vector is the single source of truth shared with the TypeScript
//! (`packages/protocol`) and Solidity (`contracts/base`) implementations.

use proofline_adapter::wormhole::payload::{MatchOutcomeV1, MATCH_OUTCOME_V1_LENGTH};

const VECTOR_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/test-vectors/match-outcome-v1.json"
));

/// Minimal field extraction for the known-shape vector file (keys are
/// unique across the document). Avoids a serde_json dev-dependency.
fn raw_value(key: &str) -> String {
    let needle = format!("\"{key}\":");
    let start = VECTOR_JSON
        .find(&needle)
        .unwrap_or_else(|| panic!("vector missing key {key}"))
        + needle.len();
    let rest = VECTOR_JSON[start..].trim_start();
    if let Some(stripped) = rest.strip_prefix('"') {
        stripped
            .split('"')
            .next()
            .expect("unterminated string")
            .to_string()
    } else {
        rest.split(|c: char| c == ',' || c == '}' || c.is_whitespace())
            .next()
            .expect("empty value")
            .to_string()
    }
}

fn vector_int<T: std::str::FromStr>(key: &str) -> T
where
    T::Err: std::fmt::Debug,
{
    raw_value(key).parse::<T>().expect("bad integer in vector")
}

fn vector_hex(key: &str) -> Vec<u8> {
    let s = raw_value(key);
    let s = s.strip_prefix("0x").expect("hex value must be 0x-prefixed");
    assert!(s.len() % 2 == 0, "odd hex length for {key}");
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).expect("bad hex"))
        .collect()
}

fn vector_hex32(key: &str) -> [u8; 32] {
    let v = vector_hex(key);
    assert_eq!(v.len(), 32, "{key} must be 32 bytes");
    let mut a = [0u8; 32];
    a.copy_from_slice(&v);
    a
}

fn vector_outcome() -> MatchOutcomeV1 {
    MatchOutcomeV1 {
        flags: vector_int("flags"),
        destination_chain: vector_int("destinationChain"),
        source_validation_version: vector_int("sourceValidationVersion"),
        result: vector_int("result"),
        fixture_id: vector_int("fixtureId"),
        score_sequence: vector_int("scoreSequence"),
        proof_timestamp_ms: vector_int("proofTimestampMs"),
        period: vector_int("period"),
        participant_1_score: vector_int("participant1Score"),
        participant_2_score: vector_int("participant2Score"),
        txline_program_id: vector_hex32("txlineProgramId"),
        daily_root_account: vector_hex32("dailyRootAccount"),
        validation_instruction_hash: vector_hex32("validationInstructionHash"),
        proof_bundle_hash: vector_hex32("proofBundleHash"),
    }
}

#[test]
fn serializer_reproduces_vector_bytes_exactly() {
    let expected = vector_hex("encodedPayload");
    assert_eq!(expected.len(), MATCH_OUTCOME_V1_LENGTH);

    let encoded = vector_outcome().encode();
    assert_eq!(
        encoded.as_slice(),
        expected.as_slice(),
        "Rust MatchOutcomeV1 serializer diverged from the cross-language test vector"
    );
}

#[test]
fn vector_bytes_decode_back_to_vector_outcome() {
    let expected = vector_hex("encodedPayload");
    let decoded = MatchOutcomeV1::decode(&expected).expect("vector payload must decode");
    assert_eq!(decoded, vector_outcome());
    // and a full roundtrip through our own encoder
    assert_eq!(decoded.encode().as_slice(), expected.as_slice());
}
