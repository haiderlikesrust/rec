// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Currency} from "v4-core/types/Currency.sol";

import {KeeperAuth} from "./libraries/KeeperAuth.sol";
import {IHolderAirdrop} from "./interfaces/ISinks.sol";
import {ILaunchpad} from "./interfaces/ILaunchpad.sol";

/// @title HolderAirdrop
/// @notice Holds each coin's 10% airdrop bucket (in its quote asset) and pushes it to the coin's high-entry holders:
///         wallets whose average entry is above the current price, weighted by how far underwater they are.
///         Recipients are recomputed every epoch, so they rotate as the price moves.
contract HolderAirdrop is IHolderAirdrop, KeeperAuth, ReentrancyGuard {
    address public immutable feeRouter;
    ILaunchpad public immutable launchpad;

    mapping(address token => uint256) public balanceOf;
    mapping(address token => uint256) public totalDeposited;
    mapping(address token => uint256) public totalDistributed;
    mapping(address token => mapping(uint256 epoch => mapping(uint256 batch => bool))) public batchPaid;
    mapping(address account => mapping(Currency => uint256)) public unclaimed;

    event Deposited(address indexed token, uint256 amount);
    event Airdropped(address indexed token, uint256 indexed epoch, address indexed recipient, uint256 amount);
    event Deferred(address indexed recipient, Currency indexed quote, uint256 amount);

    error NotFeeRouter();
    error BatchAlreadyPaid();
    error LengthMismatch();
    error OverBalance();
    error NothingToClaim();
    error TransferFailed();

    constructor(address feeRouter_, ILaunchpad launchpad_, address owner_) KeeperAuth(owner_) {
        feeRouter = feeRouter_;
        launchpad = launchpad_;
    }

    function notifyDeposit(address token, uint256 amount) external {
        if (msg.sender != feeRouter) revert NotFeeRouter();
        balanceOf[token] += amount;
        totalDeposited[token] += amount;
        emit Deposited(token, amount);
    }

    function distribute(
        address token,
        uint256 epoch,
        uint256 batch,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyKeeper nonReentrant {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (batchPaid[token][epoch][batch]) revert BatchAlreadyPaid();
        batchPaid[token][epoch][batch] = true;

        uint256 sum;
        for (uint256 i; i < amounts.length; ++i) {
            sum += amounts[i];
        }
        if (sum > balanceOf[token]) revert OverBalance();
        balanceOf[token] -= sum;
        totalDistributed[token] += sum;

        Currency quote = launchpad.getLaunch(token).quote;
        for (uint256 i; i < recipients.length; ++i) {
            if (!_push(quote, recipients[i], amounts[i])) {
                unclaimed[recipients[i]][quote] += amounts[i];
                emit Deferred(recipients[i], quote, amounts[i]);
            }
            emit Airdropped(token, epoch, recipients[i], amounts[i]);
        }
    }

    /// @notice Pull an airdrop that could not be pushed (contract wallets that reject ETH, blocklisted tokens...).
    function claimUnclaimed(Currency quote) external nonReentrant {
        uint256 amount = unclaimed[msg.sender][quote];
        if (amount == 0) revert NothingToClaim();
        unclaimed[msg.sender][quote] = 0;
        if (!_push(quote, msg.sender, amount)) revert TransferFailed();
    }

    function _push(Currency quote, address to, uint256 amount) internal returns (bool ok) {
        if (quote.isAddressZero()) {
            (ok,) = to.call{value: amount, gas: 50_000}("");
        } else {
            bytes memory ret;
            (ok, ret) = Currency.unwrap(quote).call(abi.encodeWithSelector(0xa9059cbb, to, amount));
            ok = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        }
    }

    receive() external payable {}
}
