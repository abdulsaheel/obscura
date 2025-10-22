// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "./PrivateVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Obscura Official Factory
 * @dev Controls deployment of authorized Obscura PrivateVault instances
 * @notice Only official deployments through this factory are legitimate
 * @author Obscura Protocol Team
 * @custom:license BUSL-1.1 - Commercial use requires license
 * @custom:warning UNAUTHORIZED DEPLOYMENT PROHIBITED
 */
contract ObscuraFactory is Ownable, Pausable {
    
    // ============ STATE VARIABLES ============
    
    /// @notice Counter for deployment tracking
    uint256 public deploymentCounter;
    
    /// @notice Mapping of authorized deployers
    mapping(address => bool) public authorizedDeployers;
    
    /// @notice Mapping of official vault instances  
    mapping(address => bool) public officialVaults;
    
    /// @notice Deployment information
    struct DeploymentInfo {
        address vault;
        address deployer;
        uint256 timestamp;
        bool active;
    }
    
    /// @notice Track all official deployments
    mapping(uint256 => DeploymentInfo) public deployments;
    
    /// @notice License fee for authorized deployment (prevents spam)
    uint256 public licenseFee = 0.1 ether;
    
    /// @notice Maximum deployments per deployer (prevents abuse)
    mapping(address => uint256) public deploymentLimits;
    uint256 public constant MAX_DEPLOYMENTS_PER_ADDRESS = 3;
    
    // ============ EVENTS ============
    
    event AuthorizedDeployer(address indexed deployer, uint256 timestamp);
    event VaultDeployed(address indexed vault, address indexed deployer, uint256 deploymentId);
    event UnauthorizedDeploymentAttempt(address indexed attacker, uint256 timestamp);
    event LicenseFeeUpdated(uint256 newFee);
    
    // ============ MODIFIERS ============
    
    modifier onlyAuthorizedDeployer() {
        require(authorizedDeployers[msg.sender], "Not authorized deployer");
        _;
    }
    
    modifier validLicense() {
        require(msg.value >= licenseFee, "Insufficient license fee");
        _;
    }
    
    modifier deploymentLimitOk() {
        require(deploymentLimits[msg.sender] < MAX_DEPLOYMENTS_PER_ADDRESS, "Deployment limit exceeded");
        _;
    }
    
    // ============ CONSTRUCTOR ============
    
    constructor() Ownable(msg.sender) {
        authorizedDeployers[msg.sender] = true;
        emit AuthorizedDeployer(msg.sender, block.timestamp);
    }
    
    // ============ DEPLOYMENT FUNCTIONS ============
    
    /**
     * @dev Deploy an official PrivateVault instance
     * @param _verifier Address of the ZK-SNARK verifier contract
     * @param _hasher Address of the Poseidon hash contract
     * @return vault Address of the deployed vault
     */
    function deployOfficialVault(
        address _verifier,
        address _hasher
    ) 
        external 
        payable
        onlyAuthorizedDeployer
        validLicense
        deploymentLimitOk
        whenNotPaused
        returns (address vault) 
    {
        // Deploy the vault (simplified - no auth needed for testing)
        PrivateVault newVault = new PrivateVault(_verifier, _hasher);
        vault = address(newVault);
        
        // Register as official
        officialVaults[vault] = true;
        deploymentLimits[msg.sender]++;
        
        // Store deployment info
        deployments[deploymentCounter] = DeploymentInfo({
            vault: vault,
            deployer: msg.sender,
            timestamp: block.timestamp,
            active: true
        });
        
        emit VaultDeployed(vault, msg.sender, deploymentCounter);
        deploymentCounter++;
        
        return vault;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Authorize a new deployer (only owner)
     */
    function authorizeDeployer(address _deployer) external onlyOwner {
        require(_deployer != address(0), "Invalid deployer address");
        authorizedDeployers[_deployer] = true;
        emit AuthorizedDeployer(_deployer, block.timestamp);
    }
    
    /**
     * @dev Revoke deployer authorization
     */
    function revokeDeployer(address _deployer) external onlyOwner {
        authorizedDeployers[_deployer] = false;
    }
    
    /**
     * @dev Update license fee
     */
    function updateLicenseFee(uint256 _newFee) external onlyOwner {
        licenseFee = _newFee;
        emit LicenseFeeUpdated(_newFee);
    }
    
    /**
     * @dev Deactivate a vault (emergency only)
     */
    function deactivateVault(uint256 _deploymentId) external onlyOwner {
        require(deployments[_deploymentId].active, "Vault not active");
        deployments[_deploymentId].active = false;
        officialVaults[deployments[_deploymentId].vault] = false;
    }
    
    /**
     * @dev Withdraw collected license fees
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Fee withdrawal failed");
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @dev Check if a vault is officially deployed
     */
    function isOfficialVault(address _vault) external view returns (bool) {
        return officialVaults[_vault];
    }
    
    /**
     * @dev Get deployment info
     */
    function getDeploymentInfo(uint256 _deploymentId) 
        external 
        view 
        returns (DeploymentInfo memory) 
    {
        return deployments[_deploymentId];
    }
    
    /**
     * @dev Get total official vaults count
     */
    function getTotalDeployments() external view returns (uint256) {
        return deploymentCounter;
    }
}