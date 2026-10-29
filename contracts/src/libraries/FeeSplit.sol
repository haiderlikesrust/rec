// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The 3% trade tax and how every unit of it is split. One place to change the economics.
library FeeSplit {
    uint256 internal constant BPS = 10_000;

    /// @dev 3% of the quote side of every buy and sell.
    uint256 internal constant TAX_BPS = 300;

    uint256 internal constant MAIN_BUYBACK_BPS = 1_000; // 10% buy back + burn the platform token
    uint256 internal constant COIN_BUYBACK_BPS = 1_000; // 10% buy back + burn the coin itself
    uint256 internal constant OTC_RESERVE_BPS = 3_000; // 30% to the OTC reserve (converted to ETH)
    uint256 internal constant PROTECTION_BPS = 4_000; // 40% to the protection fund (converted to ETH)
    uint256 internal constant AIRDROP_BPS = 1_000; // 10% airdropped to high-entry holders

    /// @dev Launch-window anti-snipe surcharge on buys, halving every second: 99%, 51%, 27%, 15%, 9%, 6%, then 3%.
    uint256 internal constant SNIPE_START_EXTRA_BPS = 9_600;
    uint256 internal constant SNIPE_SECONDS = 6;

    function split(uint256 amount)
        internal
        pure
        returns (uint256 mainBuyback, uint256 coinBuyback, uint256 otc, uint256 protection, uint256 airdrop)
    {
        mainBuyback = amount * MAIN_BUYBACK_BPS / BPS;
        coinBuyback = amount * COIN_BUYBACK_BPS / BPS;
        otc = amount * OTC_RESERVE_BPS / BPS;
        airdrop = amount * AIRDROP_BPS / BPS;
        // rounding dust lands in the protection fund so nothing is ever stranded
        protection = amount - mainBuyback - coinBuyback - otc - airdrop;
    }

    function snipeExtraBps(uint256 secondsSinceLaunch) internal pure returns (uint256) {
        return secondsSinceLaunch < SNIPE_SECONDS ? SNIPE_START_EXTRA_BPS >> secondsSinceLaunch : 0;
    }
}
