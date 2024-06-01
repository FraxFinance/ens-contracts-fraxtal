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
// ============================ FNS ROOT ==============================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

import {ENS} from "../registry/ENS.sol";
import {Root} from "./Root.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FNSRoot is Root {
    bytes32 private constant FRAX_NODE =
        0x323752ac646b7763acccb86343b9898c911d0ef2f83fd5707e526976b8eaea1c;
    ERC20 public constant FXS =
        ERC20(0xFc00000000000000000000000000000000000002);
    ERC20 public constant FRAX =
        ERC20(0xFc00000000000000000000000000000000000001);
    string public constant name = "FNS Root";

    constructor(
        ENS _ens,
        address delegationRegistry,
        address initialDelegate
    ) Root(_ens) {
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
