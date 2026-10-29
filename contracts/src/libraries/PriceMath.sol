// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/libraries/FixedPoint96.sol";

/// @notice Converts token amounts to quote amounts at a v4 sqrt price, whichever side the token sits on.
library PriceMath {
    /// @param tokenIsCurrency0 true when price (currency1/currency0) is quote-per-token
    function tokenToQuote(uint256 tokenAmount, uint160 sqrtPriceX96, bool tokenIsCurrency0)
        internal
        pure
        returns (uint256)
    {
        if (tokenIsCurrency0) {
            return FullMath.mulDiv(FullMath.mulDiv(tokenAmount, sqrtPriceX96, FixedPoint96.Q96), sqrtPriceX96, FixedPoint96.Q96);
        }
        return FullMath.mulDiv(FullMath.mulDiv(tokenAmount, FixedPoint96.Q96, sqrtPriceX96), FixedPoint96.Q96, sqrtPriceX96);
    }
}
