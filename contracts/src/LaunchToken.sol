// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Fixed-supply coin minted once to the Launchpad, which locks all of it as pool liquidity.
contract LaunchToken is ERC20, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    struct Metadata {
        string image;
        string description;
        string website;
        string twitter;
        string telegram;
    }

    address public immutable creator;
    Metadata internal _meta;

    constructor(string memory name_, string memory symbol_, Metadata memory meta_, address creator_)
        ERC20(name_, symbol_)
    {
        creator = creator_;
        _meta = meta_;
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function getTokenInfo() external view returns (address, Metadata memory) {
        return (creator, _meta);
    }
}
