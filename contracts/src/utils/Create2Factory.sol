// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Deterministic deployer used to place the hook at an address whose low bits encode its v4 permissions.
contract Create2Factory {
    event Deployed(address addr, bytes32 salt);

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address addr) {
        bytes memory code = initCode;
        assembly {
            addr := create2(0, add(code, 32), mload(code), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr, salt);
    }
}
