// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Owner (multisig) plus a set of keeper bots allowed to run routine jobs.
abstract contract KeeperAuth is Ownable2Step {
    mapping(address => bool) public isKeeper;

    event KeeperSet(address indexed keeper, bool allowed);

    error NotKeeper();

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _;
    }

    constructor(address owner_) Ownable(owner_) {}

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }
}
