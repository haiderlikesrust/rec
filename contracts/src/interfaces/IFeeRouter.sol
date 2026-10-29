// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IFeeRouter {
    function accrue(address token, uint256 baseFee, uint256 snipeExtra) external;
    function depositLaunchFee() external payable;
}
