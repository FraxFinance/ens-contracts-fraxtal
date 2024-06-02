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
// ========================== FNS PriceOracle =========================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

import "./IPriceOracle.sol";
import "../utils/StringUtils.sol";
import "./SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// FNSPriceOracle sets a price in unit of FXS.
contract FNSPriceOracle is IPriceOracle {
    using StringUtils for *;
    using SafeMath for *;

    // Rent in base price units by length
    uint256 public immutable price1Letter;
    uint256 public immutable price2Letter;
    uint256 public immutable price3Letter;
    uint256 public immutable price4Letter;
    uint256 public immutable price5Letter;

    uint256 immutable GRACE_PERIOD = 90 days;

    event RentPriceChanged(uint256[] prices);

    constructor(
        uint256[] memory _rentPrices,
        address delegationRegistry,
        address initialDelegate
    ) {
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
        price1Letter = _rentPrices[0];
        price2Letter = _rentPrices[1];
        price3Letter = _rentPrices[2];
        price4Letter = _rentPrices[3];
        price5Letter = _rentPrices[4];
    }

    function price(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view override returns (IPriceOracle.Price memory) {
        uint256 len = name.strlen();
        uint256 basePrice;

        if (len >= 5) {
            basePrice = price5Letter * duration;
        } else if (len == 4) {
            basePrice = price4Letter * duration;
        } else if (len == 3) {
            basePrice = price3Letter * duration;
        } else if (len == 2) {
            basePrice = price2Letter * duration;
        } else {
            basePrice = price1Letter * duration;
        }

        return
            IPriceOracle.Price({
                base: basePrice,
                premium: _premium(name, expires, duration)
            });
    }

    /**
     * @dev Returns the pricing premium in wei.
     */
    function premium(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256) {
        return _premium(name, expires, duration);
    }

    /**
     * @dev Returns the pricing premium in internal base units.
     */
    function _premium(
        string memory name,
        uint256 expires,
        uint256
    ) internal view virtual returns (uint256) {
        if (expires > block.timestamp) {
            // No premium for renewals
            return 0;
        }

        uint256 len = name.strlen();
        uint256 premiumPrice;
        uint256 expiredPeriod = block.timestamp.sub(expires);

        // Max Premium is equal to Grace Period base price
        if (expiredPeriod > GRACE_PERIOD) {
            expiredPeriod = GRACE_PERIOD;
        }

        if (len >= 5) {
            premiumPrice = price5Letter * expiredPeriod;
        } else if (len == 4) {
            premiumPrice = price4Letter * expiredPeriod;
        } else if (len == 3) {
            premiumPrice = price3Letter * expiredPeriod;
        } else if (len == 2) {
            premiumPrice = price2Letter * expiredPeriod;
        } else {
            premiumPrice = price1Letter * expiredPeriod;
        }
        return premiumPrice;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IPriceOracle).interfaceId;
    }
}
