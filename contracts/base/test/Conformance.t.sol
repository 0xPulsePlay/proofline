// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MatchOutcomeCodec} from "../src/libraries/MatchOutcomeCodec.sol";
import {AttestationIds} from "../src/libraries/AttestationIds.sol";

/// @notice Conformance against packages/test-vectors/match-outcome-v1.json —
///         the cross-language source of truth. The Solidity codec must decode
///         the vector's encodedPayload byte-for-byte and AttestationIds must
///         reproduce the vector's attestationId exactly.
contract ConformanceTest is Test {
    string constant VECTOR_PATH = "../../packages/test-vectors/match-outcome-v1.json";

    function _vector() internal view returns (string memory) {
        return vm.readFile(VECTOR_PATH);
    }

    function test_DomainSeparatorMatchesVector() public view {
        string memory json = _vector();
        bytes32 expected = vm.parseJsonBytes32(json, ".domainSeparator");
        assertEq(AttestationIds.DOMAIN_SEPARATOR, expected, "DOMAIN_SEPARATOR mismatch");
        assertEq(AttestationIds.DOMAIN_SEPARATOR, keccak256("proofline.attestation.v1"));
    }

    function test_CodecDecodesVectorPayload() public view {
        string memory json = _vector();
        bytes memory payload = vm.parseJsonBytes(json, ".encodedPayload");
        assertEq(payload.length, 176, "vector payload length");

        MatchOutcomeCodec.MatchOutcome memory o = MatchOutcomeCodec.decode(payload);

        assertEq(o.version, 1, "version");
        assertEq(o.messageType, 1, "messageType");
        assertEq(o.flags, uint16(vm.parseJsonUint(json, ".outcome.flags")), "flags");
        assertEq(o.destinationChain, uint16(vm.parseJsonUint(json, ".outcome.destinationChain")), "destinationChain");
        assertEq(
            o.sourceValidationVersion,
            uint8(vm.parseJsonUint(json, ".outcome.sourceValidationVersion")),
            "sourceValidationVersion"
        );
        assertEq(o.result, uint8(vm.parseJsonUint(json, ".outcome.result")), "result");
        assertEq(o.fixtureId, int64(vm.parseJsonInt(json, ".outcome.fixtureId")), "fixtureId");
        assertEq(o.scoreSequence, int64(vm.parseJsonInt(json, ".outcome.scoreSequence")), "scoreSequence");
        assertEq(o.proofTimestampMs, int64(vm.parseJsonInt(json, ".outcome.proofTimestampMs")), "proofTimestampMs");
        assertEq(o.period, int32(vm.parseJsonInt(json, ".outcome.period")), "period");
        assertEq(o.participant1Score, int32(vm.parseJsonInt(json, ".outcome.participant1Score")), "p1Score");
        assertEq(o.participant2Score, int32(vm.parseJsonInt(json, ".outcome.participant2Score")), "p2Score");
        assertEq(o.txlineProgramId, vm.parseJsonBytes32(json, ".outcome.txlineProgramId"), "txlineProgramId");
        assertEq(o.dailyRootAccount, vm.parseJsonBytes32(json, ".outcome.dailyRootAccount"), "dailyRootAccount");
        assertEq(
            o.validationInstructionHash,
            vm.parseJsonBytes32(json, ".outcome.validationInstructionHash"),
            "validationInstructionHash"
        );
        assertEq(o.proofBundleHash, vm.parseJsonBytes32(json, ".outcome.proofBundleHash"), "proofBundleHash");
    }

    function test_AttestationIdMatchesVector() public view {
        string memory json = _vector();
        bytes memory payload = vm.parseJsonBytes(json, ".encodedPayload");
        bytes32 sourceEmitter = vm.parseJsonBytes32(json, ".sourceEmitter");
        bytes32 expectedId = vm.parseJsonBytes32(json, ".attestationId");

        MatchOutcomeCodec.MatchOutcome memory o = MatchOutcomeCodec.decode(payload);

        bytes32 got = AttestationIds.compute(
            sourceEmitter, o.fixtureId, o.scoreSequence, o.validationInstructionHash, o.proofBundleHash
        );
        assertEq(got, expectedId, "attestationId mismatch vs vector");
    }

    function test_CodecRejectsMalformedPayloads() public {
        string memory json = _vector();
        bytes memory good = vm.parseJsonBytes(json, ".encodedPayload");

        // Bad length.
        bytes memory short_ = new bytes(175);
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.BadPayloadLength.selector, 175));
        this.decodeExternal(short_);

        // Bad magic.
        bytes memory badMagic = _clone(good);
        badMagic[0] = 0x00;
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.BadMagic.selector, bytes4(0x0052464c)));
        this.decodeExternal(badMagic);

        // Bad version.
        bytes memory badVersion = _clone(good);
        badVersion[4] = 0x02;
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.UnsupportedVersion.selector, 2));
        this.decodeExternal(badVersion);

        // Bad message type.
        bytes memory badType = _clone(good);
        badType[5] = 0x09;
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.UnsupportedMessageType.selector, 9));
        this.decodeExternal(badType);

        // Result 0 and result > 3.
        bytes memory zeroResult = _clone(good);
        zeroResult[11] = 0x00;
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.InvalidResult.selector, 0));
        this.decodeExternal(zeroResult);

        bytes memory bigResult = _clone(good);
        bigResult[11] = 0x04;
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.InvalidResult.selector, 4));
        this.decodeExternal(bigResult);
    }

    /// @dev external wrapper so expectRevert catches library reverts cleanly.
    function decodeExternal(bytes memory payload) external pure returns (MatchOutcomeCodec.MatchOutcome memory) {
        return MatchOutcomeCodec.decode(payload);
    }

    function _clone(bytes memory src) internal pure returns (bytes memory dst) {
        dst = new bytes(src.length);
        for (uint256 i = 0; i < src.length; i++) {
            dst[i] = src[i];
        }
    }
}
