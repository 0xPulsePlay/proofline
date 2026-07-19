// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {FinalityRegistry} from "./FinalityRegistry.sol";
import {MockWormholeCore} from "./MockWormholeCore.sol";
import {MatchOutcomeCodec} from "./libraries/MatchOutcomeCodec.sol";
import {AttestationIds} from "./libraries/AttestationIds.sol";

/// @title WormholeOutcomeReceiver — Proofline Level 4 proof-lane receiver (spec §3.5)
/// @notice Consumes Wormhole VAAs carrying MatchOutcomeV1 payloads emitted by
///         the registered Proofline Solana emitter, performing the §3.5 check
///         order verbatim in `_consumeVaa`. The `attestationId` is computed
///         ON-CHAIN from the decoded payload fields + the VAA's emitter
///         address — an independent derivation from Level 3's, which is the
///         dual-finality trick.
///
/// Two entrypoints (permissionless-by-design, §3.4 / §3.10 item 7):
///  - `submitVaa` — PERMISSIONLESS: anyone holding a valid VAA can deliver it
///    (CRE provides liveness; Wormhole provides correctness).
///  - `onReport` — forwarder-gated CRE wrapper; the report bytes are the
///    exact VAA bytes. As with CRELevel3Receiver, the demo forwarder is the
///    relay CLI EOA (no real Keystone Forwarder in this build).
contract WormholeOutcomeReceiver is Ownable {
    using MatchOutcomeCodec for bytes;

    struct Level4Attestation {
        bytes32 attestationId;
        int64 fixtureId;
        int32 participant1Score;
        int32 participant2Score;
        bytes32 proofBundleHash;
        uint8 result;
        uint64 wormholeSequence;
        bytes32 vaaHash;
        uint64 receivedAt;
        bool exists;
    }

    MockWormholeCore public immutable wormhole;
    FinalityRegistry public immutable registry;
    /// @notice The ONE exact registered Proofline Solana emitter (§3.10 item 2).
    bytes32 public immutable registeredEmitter;
    /// @notice Wormhole chain id of the source chain (1 = Solana).
    uint16 public constant SOURCE_CHAIN_SOLANA = 1;
    /// @notice Our own Wormhole chain id (10004 = Base Sepolia); payloads must target it.
    uint16 public immutable ourChainId;

    address public forwarder;

    /// @dev Replay protection BY DIGEST and BY EMITTER SEQUENCE (§3.10 item 4).
    mapping(bytes32 => bool) public consumedVaaHashes;
    mapping(uint64 => bool) public consumedSequences;

    mapping(int64 => Level4Attestation) private _attestations;

    event ForwarderSet(address indexed forwarder);
    event OutcomeImported(
        int64 indexed fixtureId, bytes32 indexed attestationId, uint64 wormholeSequence, bytes32 vaaHash
    );
    event ConflictingVaaRejected(int64 indexed fixtureId, bytes32 storedAttestationId, bytes32 incomingAttestationId);

    error NotForwarder();
    error InvalidVaa(string reason);
    error WrongEmitterChain(uint16 got);
    error WrongEmitter(bytes32 got);
    error WrongDestinationChain(uint16 got);
    error VaaAlreadyConsumed(bytes32 vaaHash);
    error SequenceAlreadyConsumed(uint64 sequence);
    error DuplicateOutcome(int64 fixtureId);

    constructor(
        address initialOwner,
        MockWormholeCore wormhole_,
        FinalityRegistry registry_,
        bytes32 registeredEmitter_,
        address forwarder_
    ) Ownable(initialOwner) {
        wormhole = wormhole_;
        registry = registry_;
        registeredEmitter = registeredEmitter_;
        ourChainId = wormhole_.chainId();
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert ZeroAddress();
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    /// @notice PERMISSIONLESS VAA delivery — anyone with the signed VAA bytes.
    function submitVaa(bytes calldata encodedVaa) external {
        _consumeVaa(encodedVaa);
    }

    /// @notice Forwarder-gated CRE wrapper; `report` is the exact VAA bytes.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        _consumeVaa(report);
    }

    /// @dev §3.5 verbatim check order.
    function _consumeVaa(bytes calldata encodedVaa) internal {
        // (1) Wormhole Core parseAndVerifyVM.
        (MockWormholeCore.VM memory vm_, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVaa);

        // (2) Require verification succeeded.
        if (!valid) revert InvalidVaa(reason);

        // (3) Require source chain == Solana.
        if (vm_.emitterChainId != SOURCE_CHAIN_SOLANA) revert WrongEmitterChain(vm_.emitterChainId);

        // (4) Require emitter == the one registered Proofline emitter.
        if (vm_.emitterAddress != registeredEmitter) revert WrongEmitter(vm_.emitterAddress);

        // (5)+(6) Payload magic "PRFL" + supported version — enforced by the
        // codec, which reverts BadMagic/UnsupportedVersion. Decoding also
        // covers (9); destination check (7) runs on the decoded field before
        // any state is written.
        MatchOutcomeCodec.MatchOutcome memory o = MatchOutcomeCodec.decode(vm_.payload);

        // (7) Require destination == our chain (10004 = Base Sepolia).
        if (o.destinationChain != ourChainId) revert WrongDestinationChain(o.destinationChain);

        // (8) Replay protection: by VAA digest AND by emitter sequence.
        if (consumedVaaHashes[vm_.hash]) revert VaaAlreadyConsumed(vm_.hash);
        if (consumedSequences[vm_.sequence]) revert SequenceAlreadyConsumed(vm_.sequence);
        consumedVaaHashes[vm_.hash] = true;
        consumedSequences[vm_.sequence] = true;

        // (9) Outcome decoded above; independently derive the attestationId
        // on-chain from payload fields + emitter (the dual-finality trick).
        bytes32 attestationId = AttestationIds.compute(
            vm_.emitterAddress, o.fixtureId, o.scoreSequence, o.validationInstructionHash, o.proofBundleHash
        );

        // (10) Conflicting outcome for an already-stored fixture: never
        // overwrite. Surface the conflict to the registry (which freezes the
        // fixture in Conflict) and keep our stored attestation intact.
        Level4Attestation storage existing = _attestations[o.fixtureId];
        if (existing.exists) {
            if (existing.attestationId == attestationId) revert DuplicateOutcome(o.fixtureId);
            emit ConflictingVaaRejected(o.fixtureId, existing.attestationId, attestationId);
            registry.reportLevel4(
                o.fixtureId, attestationId, o.participant1Score, o.participant2Score, o.result
            );
            return;
        }

        // (11) Store the Level 4 attestation + report to the registry.
        _attestations[o.fixtureId] = Level4Attestation({
            attestationId: attestationId,
            fixtureId: o.fixtureId,
            participant1Score: o.participant1Score,
            participant2Score: o.participant2Score,
            proofBundleHash: o.proofBundleHash,
            result: o.result,
            wormholeSequence: vm_.sequence,
            vaaHash: vm_.hash,
            receivedAt: uint64(block.timestamp),
            exists: true
        });

        emit OutcomeImported(o.fixtureId, attestationId, vm_.sequence, vm_.hash);

        registry.reportLevel4(o.fixtureId, attestationId, o.participant1Score, o.participant2Score, o.result);
    }

    function attestation(int64 fixtureId) external view returns (Level4Attestation memory) {
        return _attestations[fixtureId];
    }
}
