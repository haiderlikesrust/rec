// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {KeeperAuth} from "./libraries/KeeperAuth.sol";
import {IProtectionFund} from "./interfaces/ISinks.sol";

/// @title ProtectionFund
/// @notice ETH fund fed by 40% of every coin's tax. Each epoch the keeper publishes a Merkle root of loss-coverage
///         claims (realized losses x coverage tier, computed from public trade data and published at `uri`).
///         The contract, not the keeper, enforces solvency: an epoch can never commit more than `maxEpochBps` of the
///         uncommitted balance, and epochs can't be published faster than `minEpochInterval`.
contract ProtectionFund is IProtectionFund, KeeperAuth, ReentrancyGuard {
    uint256 internal constant BPS = 10_000;

    struct Epoch {
        bytes32 root;
        uint256 total;
        uint256 claimed;
        uint40 publishedAt;
        string uri;
    }

    address public immutable feeRouter;

    uint256 public maxEpochBps = 1_500;
    uint40 public minEpochInterval = 6 days;
    uint40 public claimWindow = 60 days;

    uint256 public epochCount;
    uint40 public lastPublished;
    uint256 public reserved;
    uint256 public totalContributed;
    uint256 public totalPaid;

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(address token => uint256) public contributedBy;

    event Contributed(address indexed token, uint256 amount);
    event EpochPublished(uint256 indexed epoch, bytes32 root, uint256 total, string uri);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);
    event Swept(uint256 indexed epoch, uint256 released);
    event ParamsSet(uint256 maxEpochBps, uint40 minEpochInterval, uint40 claimWindow);

    error NotFeeRouter();
    error TooSoon();
    error OverBudget();
    error AlreadyClaimed();
    error BadProof();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error TransferFailed();

    constructor(address feeRouter_, address owner_) KeeperAuth(owner_) {
        feeRouter = feeRouter_;
    }

    function setParams(uint256 maxEpochBps_, uint40 minEpochInterval_, uint40 claimWindow_) external onlyOwner {
        require(maxEpochBps_ <= 5_000, "cap");
        maxEpochBps = maxEpochBps_;
        minEpochInterval = minEpochInterval_;
        claimWindow = claimWindow_;
        emit ParamsSet(maxEpochBps_, minEpochInterval_, claimWindow_);
    }

    function deposit(address token) external payable {
        if (msg.sender != feeRouter) revert NotFeeRouter();
        contributedBy[token] += msg.value;
        totalContributed += msg.value;
        emit Contributed(token, msg.value);
    }

    /// @notice ETH not yet committed to any epoch.
    function available() public view returns (uint256) {
        return address(this).balance - reserved;
    }

    /// @notice Most the next epoch may commit.
    function epochBudget() public view returns (uint256) {
        return available() * maxEpochBps / BPS;
    }

    function publishEpoch(bytes32 root, uint256 total, string calldata uri) external onlyKeeper returns (uint256 id) {
        if (lastPublished != 0 && block.timestamp < uint256(lastPublished) + minEpochInterval) revert TooSoon();
        if (total > epochBudget()) revert OverBudget();
        id = ++epochCount;
        epochs[id] = Epoch({root: root, total: total, claimed: 0, publishedAt: uint40(block.timestamp), uri: uri});
        reserved += total;
        lastPublished = uint40(block.timestamp);
        emit EpochPublished(id, root, total, uri);
    }

    function claim(uint256 epoch, address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Epoch storage e = epochs[epoch];
        if (block.timestamp > uint256(e.publishedAt) + claimWindow) revert ClaimWindowClosed();
        if (claimed[epoch][account]) revert AlreadyClaimed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, epoch, amount))));
        if (!MerkleProof.verify(proof, e.root, leaf)) revert BadProof();
        if (e.claimed + amount > e.total) revert OverBudget();

        claimed[epoch][account] = true;
        e.claimed += amount;
        reserved -= amount;
        totalPaid += amount;
        (bool ok,) = account.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(epoch, account, amount);
    }

    /// @notice Return an expired epoch's unclaimed ETH to the fund.
    function sweep(uint256 epoch) external {
        Epoch storage e = epochs[epoch];
        if (block.timestamp <= uint256(e.publishedAt) + claimWindow) revert ClaimWindowOpen();
        uint256 released = e.total - e.claimed;
        e.total = e.claimed;
        reserved -= released;
        emit Swept(epoch, released);
    }

    receive() external payable {}
}
