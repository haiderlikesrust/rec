// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";

import {ILaunchpad, LaunchInfo} from "./interfaces/ILaunchpad.sol";

/// @title CookRouter
/// @notice Minimal exact-input buy/sell router for launch pools, plus revert-based quoting for the UI.
///         Tells the hook who the trader is so snipe exemptions and trade attribution are exact.
contract CookRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SwapData {
        bool quoteOnly;
        address token;
        bool isBuy;
        uint256 amountIn;
        uint256 minOut;
        address payer;
        address recipient;
    }

    IPoolManager public immutable poolManager;
    ILaunchpad public immutable launchpad;

    error NotPoolManager();
    error Expired();
    error Slippage();
    error WrongValue();
    error UnknownCoin();
    error QuoteResult(uint256 amountOut);

    constructor(IPoolManager poolManager_, ILaunchpad launchpad_) {
        poolManager = poolManager_;
        launchpad = launchpad_;
    }

    /// @notice Spend `quoteIn` of the coin's quote asset (send ETH as value for ETH pairs). 3% tax included.
    function buy(address token, uint256 quoteIn, uint256 minTokensOut, address recipient, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        if (block.timestamp > deadline) revert Expired();
        LaunchInfo memory l = _launch(token);
        if (msg.value != (l.quote.isAddressZero() ? quoteIn : 0)) revert WrongValue();
        return _run(SwapData(false, token, true, quoteIn, minTokensOut, msg.sender, recipient));
    }

    /// @notice Sell `tokensIn` coins for the quote asset; 3% tax comes out of the proceeds.
    function sell(address token, uint256 tokensIn, uint256 minQuoteOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256)
    {
        if (block.timestamp > deadline) revert Expired();
        _launch(token);
        return _run(SwapData(false, token, false, tokensIn, minQuoteOut, msg.sender, recipient));
    }

    /// @notice Simulate a trade (call with eth_call). Returns what `buy`/`sell` would deliver right now.
    function quote(address token, bool isBuy, uint256 amountIn) external returns (uint256 amountOut) {
        _launch(token);
        try poolManager.unlock(abi.encode(SwapData(true, token, isBuy, amountIn, 0, msg.sender, msg.sender))) {}
        catch (bytes memory reason) {
            if (reason.length == 36 && bytes4(reason) == QuoteResult.selector) {
                assembly {
                    amountOut := mload(add(reason, 36))
                }
                return amountOut;
            }
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        SwapData memory s = abi.decode(data, (SwapData));
        LaunchInfo memory l = launchpad.getLaunch(s.token);

        // buying == quote in; quote is currency0 iff the coin is currency1
        bool zeroForOne = s.isBuy ? !l.tokenIsCurrency0 : l.tokenIsCurrency0;
        BalanceDelta d = poolManager.swap(
            l.key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(s.amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            abi.encode(s.payer)
        );
        uint256 owed = uint256(int256(-(zeroForOne ? d.amount0() : d.amount1())));
        uint256 out = uint256(int256(zeroForOne ? d.amount1() : d.amount0()));
        if (s.quoteOnly) revert QuoteResult(out);
        if (out < s.minOut) revert Slippage();

        Currency input = zeroForOne ? l.key.currency0 : l.key.currency1;
        Currency output = zeroForOne ? l.key.currency1 : l.key.currency0;
        if (input.isAddressZero()) {
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(input);
            IERC20(Currency.unwrap(input)).safeTransferFrom(s.payer, address(poolManager), owed);
            poolManager.settle();
        }
        poolManager.take(output, s.recipient, out);
        return abi.encode(out);
    }

    function _run(SwapData memory s) internal returns (uint256) {
        return abi.decode(poolManager.unlock(abi.encode(s)), (uint256));
    }

    function _launch(address token) internal view returns (LaunchInfo memory l) {
        l = launchpad.getLaunch(token);
        if (l.creator == address(0)) revert UnknownCoin();
    }
}
