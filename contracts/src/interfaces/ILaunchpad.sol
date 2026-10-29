// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";

struct LaunchInfo {
    PoolKey key;
    Currency quote;
    address creator;
    uint40 launchedAt;
    bool tokenIsCurrency0;
}

interface ILaunchpad {
    function getLaunch(address token) external view returns (LaunchInfo memory);
    function quoteRoute(Currency quote) external view returns (PoolKey[] memory);
    function mainToken() external view returns (address);
}
