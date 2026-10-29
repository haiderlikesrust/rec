// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IOTCReserve {
    function deposit(address token) external payable;
}

interface IProtectionFund {
    function deposit(address token) external payable;
}

interface IHolderAirdrop {
    function notifyDeposit(address token, uint256 amount) external;
}
