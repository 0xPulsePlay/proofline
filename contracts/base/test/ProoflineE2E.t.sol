// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockWormholeCore} from "../src/MockWormholeCore.sol";
import {FinalityRegistry} from "../src/FinalityRegistry.sol";
import {CRELevel3Receiver} from "../src/CRELevel3Receiver.sol";
import {WormholeOutcomeReceiver} from "../src/WormholeOutcomeReceiver.sol";
import {DemoPredictionMarket} from "../src/DemoPredictionMarket.sol";
import {MatchOutcomeCodec} from "../src/libraries/MatchOutcomeCodec.sol";
import {AttestationIds} from "../src/libraries/AttestationIds.sol";

/// @notice End-to-end + tamper suite (spec §3.10 item 10): the full Base-side
///         stack with VAAs built and guardian-signed in-test.
contract ProoflineE2ETest is Test {
    string constant VECTOR_PATH = "../../packages/test-vectors/match-outcome-v1.json";

    uint16 constant SOLANA_CHAIN = 1;
    uint16 constant BASE_SEPOLIA_WH_CHAIN = 10004;
    uint8 constant QUORUM = 13;
    int64 constant FIXTURE_ID = 982341;

    MockWormholeCore core;
    FinalityRegistry registry;
    CRELevel3Receiver l3Receiver;
    WormholeOutcomeReceiver l4Receiver;
    DemoPredictionMarket market;

    address forwarder = makeAddr("relay-cli-forwarder");
    address rando = makeAddr("permissionless-rando");

    // Vector-derived fixture data.
    bytes vectorPayload;
    bytes32 sourceEmitter;
    bytes32 vectorAttestationId;
    MatchOutcomeCodec.MatchOutcome vectorOutcome;

    function setUp() public {
        string memory json = vm.readFile(VECTOR_PATH);
        vectorPayload = vm.parseJsonBytes(json, ".encodedPayload");
        sourceEmitter = vm.parseJsonBytes32(json, ".sourceEmitter");
        vectorAttestationId = vm.parseJsonBytes32(json, ".attestationId");
        vectorOutcome = MatchOutcomeCodec.decode(vectorPayload);

        address[19] memory guardians;
        for (uint256 i = 0; i < 19; i++) {
            guardians[i] = vm.addr(guardianKey(i));
        }
        // Sanity anchors from the build brief.
        assertEq(guardians[0], 0xE6977A35e941a241305E238AF62fABd8725F497E, "guardian 0 derivation");
        assertEq(guardians[18], 0x6B59A6D788D2cFb715C69a6239DB370f18439CF3, "guardian 18 derivation");

        core = new MockWormholeCore(guardians, QUORUM, BASE_SEPOLIA_WH_CHAIN);
        registry = new FinalityRegistry(address(this));
        l3Receiver = new CRELevel3Receiver(address(this), registry, forwarder);
        l4Receiver = new WormholeOutcomeReceiver(address(this), core, registry, sourceEmitter, forwarder);
        registry.setReporters(address(l3Receiver), address(l4Receiver));

        market = new DemoPredictionMarket{value: 100 gwei}(
            address(this), registry, FIXTURE_ID, "Canada", "France", 38, 17, 45
        );
    }

    receive() external payable {}

    // ------------------------------------------------------------------
    // VAA construction helpers
    // ------------------------------------------------------------------

    function guardianKey(uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("proofline.dev.guardian.", vm.toString(i))));
    }

    function buildBody(bytes32 emitter, uint16 emitterChainId, uint64 sequence, bytes memory payload)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            uint32(1784498100), // timestamp
            uint32(7), // nonce
            emitterChainId,
            emitter,
            sequence,
            uint8(1), // consistencyLevel
            payload
        );
    }

    /// @dev Sign body with the given guardian indices (in the given order),
    ///      using keyFor(index) as the private key — pass a wrong key mapping
    ///      to simulate a non-guardian signer.
    function buildVaaCustomSigners(bytes memory body, uint8[] memory indices, uint256[] memory keys)
        internal
        pure
        returns (bytes memory vaa)
    {
        bytes32 digest = keccak256(abi.encodePacked(keccak256(body)));
        bytes memory sigs;
        for (uint256 i = 0; i < indices.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], digest);
            sigs = abi.encodePacked(sigs, indices[i], r, s, uint8(v - 27));
        }
        vaa = abi.encodePacked(
            uint8(1), // VAA version
            uint32(0), // guardianSetIndex
            uint8(indices.length),
            sigs,
            body
        );
    }

    function buildVaa(bytes memory body, uint256 numSigners) internal pure returns (bytes memory) {
        uint8[] memory indices = new uint8[](numSigners);
        uint256[] memory keys = new uint256[](numSigners);
        for (uint256 i = 0; i < numSigners; i++) {
            indices[i] = uint8(i);
            keys[i] = guardianKey(i);
        }
        return buildVaaCustomSigners(body, indices, keys);
    }

    function canonicalVaa(uint64 sequence) internal view returns (bytes memory) {
        return buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, sequence, vectorPayload), QUORUM);
    }

    /// @dev Re-encode the vector outcome with field overrides (magic fixed).
    function encodePayload(MatchOutcomeCodec.MatchOutcome memory o) internal pure returns (bytes memory) {
        return abi.encodePacked(
            abi.encodePacked(
                bytes4(0x5052464c),
                o.version,
                o.messageType,
                o.flags,
                o.destinationChain,
                o.sourceValidationVersion,
                o.result,
                o.fixtureId,
                o.scoreSequence,
                o.proofTimestampMs
            ),
            abi.encodePacked(o.period, o.participant1Score, o.participant2Score),
            o.txlineProgramId,
            o.dailyRootAccount,
            o.validationInstructionHash,
            o.proofBundleHash
        );
    }

    function level3Report(bytes32 attestationId, bytes32 proofBundleHash) internal view returns (bytes memory) {
        return abi.encode(
            CRELevel3Receiver.Level3Report({
                attestationId: attestationId,
                fixtureId: FIXTURE_ID,
                participant1Score: vectorOutcome.participant1Score,
                participant2Score: vectorOutcome.participant2Score,
                proofBundleHash: proofBundleHash,
                result: vectorOutcome.result
            })
        );
    }

    function sendCanonicalL3() internal {
        vm.prank(forwarder);
        l3Receiver.onReport("", level3Report(vectorAttestationId, vectorOutcome.proofBundleHash));
    }

    // ------------------------------------------------------------------
    // Happy paths
    // ------------------------------------------------------------------

    function test_EncodePayloadHelperMatchesVector() public view {
        assertEq(encodePayload(vectorOutcome), vectorPayload, "test helper must reproduce vector bytes");
    }

    function test_HappyPath_L4ThenL3_DualFinalized_SettleAndClaim() public {
        // Permissionless VAA submission by a rando.
        vm.prank(rando);
        l4Receiver.submitVaa(canonicalVaa(42));

        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.WormholeVerified));
        WormholeOutcomeReceiver.Level4Attestation memory att = l4Receiver.attestation(FIXTURE_ID);
        assertTrue(att.exists);
        // On-chain independent derivation must equal the vector's attestationId.
        assertEq(att.attestationId, vectorAttestationId, "on-chain attestationId != vector");
        assertEq(att.wormholeSequence, 42);

        // Market cannot settle yet.
        vm.expectRevert(DemoPredictionMarket.NotDualFinalized.selector);
        market.settle();

        // Level 3 arrives, digests match -> DualFinalized.
        sendCanonicalL3();
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.DualFinalized));

        (bool finalized, uint8 result, int32 p1, int32 p2) = registry.finalOutcome(FIXTURE_ID);
        assertTrue(finalized);
        assertEq(result, 1); // HOME = Canada
        assertEq(p1, 2);
        assertEq(p2, 1);

        // ITxLineMirror downstream view.
        (uint16 s1, uint16 s2, bool verified) = registry.finalResults(uint256(uint64(FIXTURE_ID)));
        assertTrue(verified);
        assertEq(s1, 2);
        assertEq(s2, 1);

        // Anyone can settle.
        vm.prank(rando);
        market.settle();
        assertTrue(market.settled());
        assertEq(market.winningOutcome(), 1);

        // Owner claims escrow.
        uint256 before = address(this).balance;
        market.claim();
        assertEq(address(this).balance, before + 100 gwei);
    }

    function test_L3First_Provisional_ThenL4_DualFinalized() public {
        sendCanonicalL3();
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.CREAttested));

        // Provisional winner visible, settlement locked.
        (bool available, uint8 result) = market.provisionalWinner();
        assertTrue(available);
        assertEq(result, 1);
        vm.expectRevert(DemoPredictionMarket.NotDualFinalized.selector);
        market.settle();
        (,, bool verified) = registry.finalResults(uint256(uint64(FIXTURE_ID)));
        assertFalse(verified);

        // L4 lands -> DualFinalized.
        vm.prank(rando);
        l4Receiver.submitVaa(canonicalVaa(42));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.DualFinalized));
        market.settle();
    }

    function test_OnReportVaaPath_ForwarderGated() public {
        vm.prank(forwarder);
        l4Receiver.onReport("", canonicalVaa(42));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.WormholeVerified));
    }

    // ------------------------------------------------------------------
    // Tamper suite (§3.10 item 10)
    // ------------------------------------------------------------------

    function test_Tamper_AlteredPayloadByte() public {
        bytes memory vaa = canonicalVaa(42);
        // Flip one byte in the payload region (last byte of the VAA):
        // signatures no longer match the recomputed digest.
        vaa[vaa.length - 1] = bytes1(uint8(vaa[vaa.length - 1]) ^ 0xFF);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.InvalidVaa.selector, "VM signature invalid"));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_InsufficientSignatures() public {
        bytes memory vaa = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 42, vectorPayload), 12);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.InvalidVaa.selector, "no quorum"));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_DuplicateGuardianIndex() public {
        uint8[] memory indices = new uint8[](QUORUM);
        uint256[] memory keys = new uint256[](QUORUM);
        for (uint256 i = 0; i < QUORUM; i++) {
            uint256 idx = i == 0 ? 0 : i - 1; // duplicate guardian 0 at slot 1... actually slots 0 and 1 both 0
            indices[i] = uint8(idx);
            keys[i] = guardianKey(idx);
        }
        bytes memory vaa =
            buildVaaCustomSigners(buildBody(sourceEmitter, SOLANA_CHAIN, 42, vectorPayload), indices, keys);
        vm.expectRevert(
            abi.encodeWithSelector(WormholeOutcomeReceiver.InvalidVaa.selector, "signature indices out of order")
        );
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_NonGuardianSigner() public {
        uint8[] memory indices = new uint8[](QUORUM);
        uint256[] memory keys = new uint256[](QUORUM);
        for (uint256 i = 0; i < QUORUM; i++) {
            indices[i] = uint8(i);
            keys[i] = guardianKey(i);
        }
        keys[5] = uint256(keccak256("not.a.guardian")); // valid index, wrong key
        bytes memory vaa =
            buildVaaCustomSigners(buildBody(sourceEmitter, SOLANA_CHAIN, 42, vectorPayload), indices, keys);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.InvalidVaa.selector, "VM signature invalid"));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_WrongEmitterAddress() public {
        bytes32 evilEmitter = keccak256("evil.emitter");
        bytes memory vaa = buildVaa(buildBody(evilEmitter, SOLANA_CHAIN, 42, vectorPayload), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.WrongEmitter.selector, evilEmitter));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_WrongEmitterChain() public {
        bytes memory vaa = buildVaa(buildBody(sourceEmitter, 2 /* Ethereum */, 42, vectorPayload), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.WrongEmitterChain.selector, 2));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_WrongDestinationChain() public {
        MatchOutcomeCodec.MatchOutcome memory o = vectorOutcome;
        o.destinationChain = 23; // Arbitrum, not us
        bytes memory vaa = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 42, encodePayload(o)), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.WrongDestinationChain.selector, 23));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_ReplayIdenticalVaa() public {
        bytes memory vaa = canonicalVaa(42);
        l4Receiver.submitVaa(vaa);
        vm.expectPartialRevert(WormholeOutcomeReceiver.VaaAlreadyConsumed.selector);
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_ReplayBySequence() public {
        l4Receiver.submitVaa(canonicalVaa(42));
        // Different body (nonce/timestamp identical, but tweak payload-independent
        // route: same sequence, different consistency by rebuilding with a
        // different nonce) -> different digest, same emitter sequence.
        bytes memory body = abi.encodePacked(
            uint32(1784498100), uint32(99), SOLANA_CHAIN, sourceEmitter, uint64(42), uint8(1), vectorPayload
        );
        bytes memory vaa = buildVaa(body, QUORUM);
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.SequenceAlreadyConsumed.selector, uint64(42)));
        l4Receiver.submitVaa(vaa);
    }

    function test_Tamper_ConflictingOutcome_FreezesSettlement() public {
        l4Receiver.submitVaa(canonicalVaa(42));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.WormholeVerified));

        // Second VAA, different proofBundleHash -> different attestationId.
        MatchOutcomeCodec.MatchOutcome memory o = vectorOutcome;
        o.proofBundleHash = keccak256("tampered.evidence.bundle");
        bytes memory vaa2 = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 43, encodePayload(o)), QUORUM);
        l4Receiver.submitVaa(vaa2); // does not revert: it lands the Conflict state

        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.Conflict));

        // Stored L4 attestation is NOT overwritten.
        assertEq(l4Receiver.attestation(FIXTURE_ID).attestationId, vectorAttestationId);

        // Settlement is frozen.
        vm.expectRevert(DemoPredictionMarket.NotDualFinalized.selector);
        market.settle();

        // Further reports revert; status stays Conflict.
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(FinalityRegistry.FixtureFrozen.selector, FIXTURE_ID));
        l3Receiver.onReport("", level3Report(vectorAttestationId, vectorOutcome.proofBundleHash));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.Conflict));
    }

    function test_Tamper_L3L4Mismatch_Conflict() public {
        // L3 arrives with a mismatched digest first, then the canonical VAA.
        vm.prank(forwarder);
        l3Receiver.onReport("", level3Report(keccak256("wrong.digest"), keccak256("wrong.bundle")));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.CREAttested));

        l4Receiver.submitVaa(canonicalVaa(42));
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.Conflict));

        vm.expectRevert(DemoPredictionMarket.NotDualFinalized.selector);
        market.settle();
    }

    function test_Tamper_BadMagicAndVersionPayloads() public {
        bytes memory badMagic = vectorPayload;
        bytes memory tampered = new bytes(badMagic.length);
        for (uint256 i = 0; i < badMagic.length; i++) {
            tampered[i] = badMagic[i];
        }
        tampered[0] = 0x51; // "QRFL"
        bytes memory vaa = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 42, tampered), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.BadMagic.selector, bytes4(0x5152464c)));
        l4Receiver.submitVaa(vaa);

        MatchOutcomeCodec.MatchOutcome memory o = vectorOutcome;
        o.version = 2;
        bytes memory vaa2 = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 42, encodePayload(o)), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(MatchOutcomeCodec.UnsupportedVersion.selector, 2));
        l4Receiver.submitVaa(vaa2);
    }

    function test_Tamper_OnReportFromNonForwarder() public {
        vm.prank(rando);
        vm.expectRevert(CRELevel3Receiver.NotForwarder.selector);
        l3Receiver.onReport("", level3Report(vectorAttestationId, vectorOutcome.proofBundleHash));

        vm.prank(rando);
        vm.expectRevert(WormholeOutcomeReceiver.NotForwarder.selector);
        l4Receiver.onReport("", canonicalVaa(42));
    }

    function test_Tamper_RegistryReportsFromNonReceivers() public {
        vm.prank(rando);
        vm.expectRevert(FinalityRegistry.NotReporter.selector);
        registry.reportLevel3(FIXTURE_ID, vectorAttestationId, 2, 1, 1);

        vm.prank(rando);
        vm.expectRevert(FinalityRegistry.NotReporter.selector);
        registry.reportLevel4(FIXTURE_ID, vectorAttestationId, 2, 1, 1);

        // Even the L3 receiver cannot report L4 and vice versa.
        vm.prank(address(l3Receiver));
        vm.expectRevert(FinalityRegistry.NotReporter.selector);
        registry.reportLevel4(FIXTURE_ID, vectorAttestationId, 2, 1, 1);
    }

    function test_Tamper_L3DuplicateAttestation() public {
        sendCanonicalL3();
        vm.prank(forwarder);
        vm.expectRevert(
            abi.encodeWithSelector(CRELevel3Receiver.AlreadyConsumed.selector, vectorAttestationId)
        );
        l3Receiver.onReport("", level3Report(vectorAttestationId, vectorOutcome.proofBundleHash));
    }

    // ------------------------------------------------------------------
    // Registry state machine details
    // ------------------------------------------------------------------

    function test_Registry_DualFinalizedIsTerminal() public {
        l4Receiver.submitVaa(canonicalVaa(42));
        sendCanonicalL3();
        assertEq(uint8(registry.status(FIXTURE_ID)), uint8(FinalityRegistry.FinalityStatus.DualFinalized));

        // A later VAA for the same fixture (same digest, new sequence) is a
        // duplicate at the receiver; a conflicting one is rejected by the
        // finalized registry.
        vm.expectRevert(abi.encodeWithSelector(WormholeOutcomeReceiver.DuplicateOutcome.selector, FIXTURE_ID));
        l4Receiver.submitVaa(canonicalVaa(43));

        MatchOutcomeCodec.MatchOutcome memory o = vectorOutcome;
        o.proofBundleHash = keccak256("late.tamper");
        bytes memory vaa = buildVaa(buildBody(sourceEmitter, SOLANA_CHAIN, 44, encodePayload(o)), QUORUM);
        vm.expectRevert(abi.encodeWithSelector(FinalityRegistry.FixtureFinalized.selector, FIXTURE_ID));
        l4Receiver.submitVaa(vaa);
    }

    function test_Registry_SettersOneShot() public {
        vm.expectRevert(FinalityRegistry.ReportersAlreadySet.selector);
        registry.setReporters(rando, rando);
    }
}
