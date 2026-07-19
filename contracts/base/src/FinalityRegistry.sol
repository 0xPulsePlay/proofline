// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";

/// @notice Downstream consumer interface (spec §3.5) — lets any Base app read
///         verified final results without knowing anything about Proofline.
interface ITxLineMirror {
    function finalResults(uint256 fixtureId)
        external
        view
        returns (uint16 participant1Score, uint16 participant2Score, bool verified);
}

/// @title FinalityRegistry — Proofline's dual-finality reconciliation contract (spec §3.4)
/// @notice Level 3 (CRE fast lane) and Level 4 (Wormhole proof lane) race here.
///         Each lane independently derives the same `attestationId`; equality
///         of the two digests is what powers `DualFinalized`. A mismatch
///         freezes the fixture in `Conflict` — never silently overwritten.
contract FinalityRegistry is Ownable, ITxLineMirror {
    enum FinalityStatus {
        Unknown,
        CREAttested,
        WormholeVerified,
        DualFinalized,
        Conflict
    }

    struct AttestationRecord {
        bytes32 attestationId;
        int32 participant1Score;
        int32 participant2Score;
        uint8 result; // 1 = HOME, 2 = DRAW, 3 = AWAY
        uint64 receivedAt;
        bool exists;
    }

    /// @notice Level 3 reporter (CRELevel3Receiver), set once.
    address public level3Receiver;
    /// @notice Level 4 reporter (WormholeOutcomeReceiver), set once.
    address public level4Receiver;

    mapping(int64 => FinalityStatus) private _status;
    mapping(int64 => AttestationRecord) private _level3;
    mapping(int64 => AttestationRecord) private _level4;

    event ReportersSet(address indexed level3Receiver, address indexed level4Receiver);
    event Level3Reported(int64 indexed fixtureId, bytes32 indexed attestationId, uint8 result);
    event Level4Reported(int64 indexed fixtureId, bytes32 indexed attestationId, uint8 result);
    event StatusChanged(int64 indexed fixtureId, FinalityStatus indexed status);
    event DualFinalized(int64 indexed fixtureId, bytes32 indexed attestationId);
    event ConflictDetected(int64 indexed fixtureId, bytes32 existingAttestationId, bytes32 incomingAttestationId);

    error NotReporter();
    error ReportersAlreadySet();
    error FixtureFrozen(int64 fixtureId);
    error FixtureFinalized(int64 fixtureId);
    error DuplicateReport(int64 fixtureId);
    error InvalidResult(uint8 result);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice One-shot wiring of the two (and only two) authorized reporters.
    function setReporters(address level3Receiver_, address level4Receiver_) external onlyOwner {
        if (level3Receiver != address(0) || level4Receiver != address(0)) revert ReportersAlreadySet();
        if (level3Receiver_ == address(0) || level4Receiver_ == address(0)) revert ZeroAddress();
        level3Receiver = level3Receiver_;
        level4Receiver = level4Receiver_;
        emit ReportersSet(level3Receiver_, level4Receiver_);
    }

    // ------------------------------------------------------------------
    // Reporting
    // ------------------------------------------------------------------

    function reportLevel3(int64 fixtureId, bytes32 attestationId, int32 p1Score, int32 p2Score, uint8 result)
        external
    {
        if (msg.sender != level3Receiver || level3Receiver == address(0)) revert NotReporter();
        _report(fixtureId, attestationId, p1Score, p2Score, result, true);
    }

    function reportLevel4(int64 fixtureId, bytes32 attestationId, int32 p1Score, int32 p2Score, uint8 result)
        external
    {
        if (msg.sender != level4Receiver || level4Receiver == address(0)) revert NotReporter();
        _report(fixtureId, attestationId, p1Score, p2Score, result, false);
    }

    function _report(
        int64 fixtureId,
        bytes32 attestationId,
        int32 p1Score,
        int32 p2Score,
        uint8 result,
        bool isLevel3
    ) internal {
        if (result == 0 || result > 3) revert InvalidResult(result);
        FinalityStatus st = _status[fixtureId];
        if (st == FinalityStatus.Conflict) revert FixtureFrozen(fixtureId);
        if (st == FinalityStatus.DualFinalized) revert FixtureFinalized(fixtureId);

        mapping(int64 => AttestationRecord) storage mine = isLevel3 ? _level3 : _level4;
        mapping(int64 => AttestationRecord) storage other = isLevel3 ? _level4 : _level3;

        if (mine[fixtureId].exists) {
            // Same-lane re-report: identical digest is a pure duplicate;
            // a different digest is a conflicting outcome → freeze (§3.10 item 5).
            if (mine[fixtureId].attestationId == attestationId) revert DuplicateReport(fixtureId);
            _status[fixtureId] = FinalityStatus.Conflict;
            emit StatusChanged(fixtureId, FinalityStatus.Conflict);
            emit ConflictDetected(fixtureId, mine[fixtureId].attestationId, attestationId);
            return;
        }

        mine[fixtureId] = AttestationRecord({
            attestationId: attestationId,
            participant1Score: p1Score,
            participant2Score: p2Score,
            result: result,
            receivedAt: uint64(block.timestamp),
            exists: true
        });

        if (isLevel3) emit Level3Reported(fixtureId, attestationId, result);
        else emit Level4Reported(fixtureId, attestationId, result);

        if (!other[fixtureId].exists) {
            FinalityStatus next = isLevel3 ? FinalityStatus.CREAttested : FinalityStatus.WormholeVerified;
            _status[fixtureId] = next;
            emit StatusChanged(fixtureId, next);
            return;
        }

        // Both lanes present — reconcile by digest equality.
        if (other[fixtureId].attestationId == attestationId) {
            _status[fixtureId] = FinalityStatus.DualFinalized;
            emit StatusChanged(fixtureId, FinalityStatus.DualFinalized);
            emit DualFinalized(fixtureId, attestationId);
        } else {
            // Freeze — never silently overwrite (§3.10 item 5).
            _status[fixtureId] = FinalityStatus.Conflict;
            emit StatusChanged(fixtureId, FinalityStatus.Conflict);
            emit ConflictDetected(fixtureId, other[fixtureId].attestationId, attestationId);
        }
    }

    // ------------------------------------------------------------------
    // Getters
    // ------------------------------------------------------------------

    function status(int64 fixtureId) external view returns (FinalityStatus) {
        return _status[fixtureId];
    }

    function level3Attestation(int64 fixtureId) external view returns (AttestationRecord memory) {
        return _level3[fixtureId];
    }

    function level4Attestation(int64 fixtureId) external view returns (AttestationRecord memory) {
        return _level4[fixtureId];
    }

    /// @notice Final outcome — only meaningful once DualFinalized.
    function finalOutcome(int64 fixtureId)
        external
        view
        returns (bool finalized, uint8 result, int32 p1, int32 p2)
    {
        if (_status[fixtureId] != FinalityStatus.DualFinalized) return (false, 0, 0, 0);
        AttestationRecord storage rec = _level4[fixtureId];
        return (true, rec.result, rec.participant1Score, rec.participant2Score);
    }

    /// @inheritdoc ITxLineMirror
    function finalResults(uint256 fixtureId)
        external
        view
        returns (uint16 participant1Score, uint16 participant2Score, bool verified)
    {
        if (fixtureId > uint256(uint64(type(int64).max))) return (0, 0, false);
        int64 fid = int64(uint64(fixtureId));
        if (_status[fid] != FinalityStatus.DualFinalized) return (0, 0, false);
        AttestationRecord storage rec = _level4[fid];
        return (uint16(uint32(rec.participant1Score)), uint16(uint32(rec.participant2Score)), true);
    }
}
