// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Obscura Indexer Registry
 * @dev On-chain registry for indexing verified private vaults
 * @notice Allows vaults to register themselves for discovery by distributed indexers
 * @author Obscura Protocol Team
 * @custom:security-contact security@obscura.protocol
 * @custom:license BUSL-1.1 - Commercial use requires license
 */
contract IndexerRegistry is Ownable {
    /// @notice Canonical codehash for verified vaults
    bytes32 public CANONICAL_VAULT_CODEHASH;

    /// @notice Mapping of indexed vaults
    mapping(address => bool) public indexedVaults;

    /// @notice Total number of indexed vaults
    uint256 public totalIndexedVaults;

    /// @notice Event emitted when a vault is successfully indexed
    event VaultIndexed(
        address indexed vault,
        uint256 timestamp,
        bytes32 codeHash
    );

    /// @notice Event emitted when canonical codehash is updated
    event CanonicalCodeHashUpdated(
        bytes32 oldCodeHash,
        bytes32 newCodeHash,
        uint256 timestamp
    );

    /// @dev Constructor sets initial canonical codehash
    constructor(bytes32 _canonicalCodeHash) Ownable(msg.sender) {
        CANONICAL_VAULT_CODEHASH = _canonicalCodeHash;
        emit CanonicalCodeHashUpdated(bytes32(0), _canonicalCodeHash, block.timestamp);
    }

    /**
     * @dev Index a vault by verifying its codehash matches canonical
     * @param vault Address of the vault to index
     * @notice Can be called by anyone, but only vaults with correct codehash will be indexed
     */
    function indexVault(address vault) external {
        require(vault != address(0), "Invalid vault address");
        require(!indexedVaults[vault], "Vault already indexed");

        bytes32 vaultCodeHash = vault.codehash;
        require(vaultCodeHash == CANONICAL_VAULT_CODEHASH, "Vault codehash does not match canonical");

        indexedVaults[vault] = true;
        totalIndexedVaults++;

        emit VaultIndexed(vault, block.timestamp, vaultCodeHash);
    }

    /**
     * @dev Update the canonical vault codehash
     * @param newCodeHash New canonical codehash
     * @notice Only owner can update
     */
    function setCanonicalCodeHash(bytes32 newCodeHash) external onlyOwner {
        require(newCodeHash != bytes32(0), "Invalid codehash");

        bytes32 oldCodeHash = CANONICAL_VAULT_CODEHASH;
        CANONICAL_VAULT_CODEHASH = newCodeHash;

        emit CanonicalCodeHashUpdated(oldCodeHash, newCodeHash, block.timestamp);
    }

    /**
     * @dev Check if a vault is indexed
     * @param vault Address to check
     * @return bool True if indexed
     */
    function isVaultIndexed(address vault) external view returns (bool) {
        return indexedVaults[vault];
    }

    /**
     * @dev Get registry statistics
     * @return _totalIndexed Total indexed vaults
     * @return _canonicalCodeHash Current canonical codehash
     */
    function getRegistryStats() external view returns (uint256 _totalIndexed, bytes32 _canonicalCodeHash) {
        return (totalIndexedVaults, CANONICAL_VAULT_CODEHASH);
    }
}