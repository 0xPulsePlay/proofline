// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {FinalityRegistry} from "./FinalityRegistry.sol";

/// @title DemoPredictionMarket — flagship Proofline consumer (spec §3.5)
/// @notice Simple demo market for fixture 982341 "Canada vs France":
///         HOME 38 / DRAW 17 / AWAY 45 seeded positions. Deliberately NOT a
///         real AMM — its only job is to prove that an unrelated Base app can
///         consume the shared FinalityRegistry:
///          - while the registry shows CREAttested, a provisional winner is
///            displayable but withdrawals stay locked;
///          - once the registry shows DualFinalized, ANYONE can call
///            `settle()` — settlement authority is the registry, not this
///            contract's owner.
///         All seeded positions are owner-held (demo), escrowed at 1 gwei per
///         position paid by the deployer.
contract DemoPredictionMarket is Ownable {
    uint8 public constant HOME = 1;
    uint8 public constant DRAW = 2;
    uint8 public constant AWAY = 3;

    uint256 public constant WEI_PER_POSITION = 1 gwei;

    FinalityRegistry public immutable registry;
    int64 public immutable fixtureId;
    string public homeTeam;
    string public awayTeam;

    /// @dev outcome (1..3) => seeded position count.
    mapping(uint8 => uint256) public positions;
    uint256 public totalPositions;

    bool public settled;
    uint8 public winningOutcome;
    bool public claimed;

    event Seeded(uint256 homePositions, uint256 drawPositions, uint256 awayPositions, uint256 escrowWei);
    event Settled(int64 indexed fixtureId, uint8 indexed winningOutcome, string source);
    event Claimed(address indexed to, uint256 amountWei);

    error NotDualFinalized();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();
    error BadEscrow(uint256 expected, uint256 got);
    error TransferFailed();

    constructor(
        address initialOwner,
        FinalityRegistry registry_,
        int64 fixtureId_,
        string memory homeTeam_,
        string memory awayTeam_,
        uint256 homePositions,
        uint256 drawPositions,
        uint256 awayPositions
    ) payable Ownable(initialOwner) {
        registry = registry_;
        fixtureId = fixtureId_;
        homeTeam = homeTeam_;
        awayTeam = awayTeam_;

        positions[HOME] = homePositions;
        positions[DRAW] = drawPositions;
        positions[AWAY] = awayPositions;
        totalPositions = homePositions + drawPositions + awayPositions;

        uint256 expectedEscrow = totalPositions * WEI_PER_POSITION;
        if (msg.value != expectedEscrow) revert BadEscrow(expectedEscrow, msg.value);

        emit Seeded(homePositions, drawPositions, awayPositions, msg.value);
    }

    /// @notice Provisional display helper for the fast lane: available once
    ///         the registry shows CREAttested (or better). Withdrawals remain
    ///         locked until DualFinalized — this is UI sugar only.
    function provisionalWinner() external view returns (bool available, uint8 result) {
        FinalityRegistry.FinalityStatus st = registry.status(fixtureId);
        if (st == FinalityRegistry.FinalityStatus.CREAttested) {
            FinalityRegistry.AttestationRecord memory rec = registry.level3Attestation(fixtureId);
            return (true, rec.result);
        }
        if (st == FinalityRegistry.FinalityStatus.DualFinalized) {
            (, uint8 r,,) = registry.finalOutcome(fixtureId);
            return (true, r);
        }
        return (false, 0);
    }

    /// @notice PERMISSIONLESS settlement: requires the registry to be
    ///         DualFinalized for our fixture. Anyone may call.
    function settle() external {
        if (settled) revert AlreadySettled();
        if (registry.status(fixtureId) != FinalityRegistry.FinalityStatus.DualFinalized) {
            revert NotDualFinalized();
        }
        (bool finalized, uint8 result,,) = registry.finalOutcome(fixtureId);
        // finalOutcome is only true when DualFinalized; re-checked for belt-and-braces.
        if (!finalized) revert NotDualFinalized();

        settled = true;
        winningOutcome = result;
        emit Settled(fixtureId, result, "Proofline DualFinalized");
    }

    /// @notice Claim winning-position payouts. In this demo all seeded
    ///         positions are owner-held, so the whole escrow pays out to the
    ///         owner in one claim once settled.
    function claim() external onlyOwner {
        if (!settled) revert NotSettled();
        if (claimed) revert AlreadyClaimed();
        claimed = true;
        uint256 amount = address(this).balance;
        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(owner, amount);
    }
}
