// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockWormholeCore} from "../src/MockWormholeCore.sol";
import {FinalityRegistry} from "../src/FinalityRegistry.sol";
import {CRELevel3Receiver} from "../src/CRELevel3Receiver.sol";
import {WormholeOutcomeReceiver} from "../src/WormholeOutcomeReceiver.sol";
import {DemoPredictionMarket} from "../src/DemoPredictionMarket.sol";

/// @notice Deploys the full Proofline Base-side stack to Base Sepolia:
///         MockWormholeCore (19 dev guardians, 13-of-19, Wormhole chain 10004),
///         FinalityRegistry, CRELevel3Receiver (forwarder = deployer EOA for
///         the demo), WormholeOutcomeReceiver (registered emitter = the
///         sourceEmitter of the conformance vector, i.e. the simulated Solana
///         emitter), wires the registry reporters, and seeds the
///         DemoPredictionMarket for fixture 982341 Canada vs France.
contract Deploy is Script {
    uint8 constant QUORUM = 13;
    uint16 constant BASE_SEPOLIA_WH_CHAIN = 10004;
    int64 constant FIXTURE_ID = 982341;

    function guardianKey(uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("proofline.dev.guardian.", vm.toString(i))));
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string memory json = vm.readFile("../../packages/test-vectors/match-outcome-v1.json");
        bytes32 sourceEmitter = vm.parseJsonBytes32(json, ".sourceEmitter");

        address[19] memory guardians;
        for (uint256 i = 0; i < 19; i++) {
            guardians[i] = vm.addr(guardianKey(i));
        }
        // Sanity anchors for the deterministic dev guardian set.
        require(guardians[0] == 0xE6977A35e941a241305E238AF62fABd8725F497E, "guardian0 derivation");
        require(guardians[18] == 0x6B59A6D788D2cFb715C69a6239DB370f18439CF3, "guardian18 derivation");

        vm.startBroadcast(pk);

        MockWormholeCore core = new MockWormholeCore(guardians, QUORUM, BASE_SEPOLIA_WH_CHAIN);
        FinalityRegistry registry = new FinalityRegistry(deployer);
        CRELevel3Receiver l3Receiver = new CRELevel3Receiver(deployer, registry, deployer);
        WormholeOutcomeReceiver l4Receiver =
            new WormholeOutcomeReceiver(deployer, core, registry, sourceEmitter, deployer);
        registry.setReporters(address(l3Receiver), address(l4Receiver));

        DemoPredictionMarket market = new DemoPredictionMarket{value: 100 gwei}(
            deployer, registry, FIXTURE_ID, "Canada", "France", 38, 17, 45
        );

        vm.stopBroadcast();

        console2.log("deployer:              ", deployer);
        console2.log("wormholeCore:          ", address(core));
        console2.log("finalityRegistry:      ", address(registry));
        console2.log("creLevel3Receiver:     ", address(l3Receiver));
        console2.log("wormholeOutcomeReceiver:", address(l4Receiver));
        console2.log("demoPredictionMarket:  ", address(market));
        console2.log("registeredEmitter:");
        console2.logBytes32(sourceEmitter);
    }
}
