// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

// ====================================================================
// |     ______                   _______                             |
// |    / _____________ __  __   / ____(_____  ____ _____  ________   |
// |   / /_  / ___/ __ `| |/_/  / /_  / / __ \/ __ `/ __ \/ ___/ _ \  |
// |  / __/ / /  / /_/ _>  <   / __/ / / / / / /_/ / / / / /__/  __/  |
// | /_/   /_/   \__,_/_/|_|  /_/   /_/_/ /_/\__,_/_/ /_/\___/\___/   |
// |                                                                  |
// ====================================================================
// ========================== FNS Registry ============================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

import {ENSRegistry} from "./ENSRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FNSRegistry is ENSRegistry {
    bytes32 private constant FRAX_NODE =
        0x323752ac646b7763acccb86343b9898c911d0ef2f83fd5707e526976b8eaea1c;
    ERC20 public constant FXS =
        ERC20(0xFc00000000000000000000000000000000000002);
    ERC20 public constant FRAX =
        ERC20(0xFc00000000000000000000000000000000000001);
    string public constant name = "FNS Registry";

    constructor(
        address delegationRegistry,
        address initialDelegate
    ) ENSRegistry() {
        delegationRegistry.call(
            abi.encodeWithSignature(
                "setDelegationForSelf(address)",
                initialDelegate
            )
        );
        delegationRegistry.call(
            abi.encodeWithSignature("disableSelfManagingDelegations()")
        );
        delegationRegistry.call(
            abi.encodeWithSignature("disableDelegationManagement()")
        );
    }
}
