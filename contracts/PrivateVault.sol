// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Verifier.sol";
import "./PoseidonT3.sol";
import "./IndexerRegistry.sol";

/**
 * @title Obscura PrivateVault
 * @notice Non-custodial privacy pool for ETH using Groth16 ZK-SNARKs.
 *         Users deposit with a Poseidon commitment and later withdraw to any
 *         address by proving membership in the Merkle tree without revealing
 *         which commitment is theirs.
 * @dev Commitment-nullifier scheme with a 20-level Poseidon Merkle tree and a
 *      rolling history of recent roots. Off-chain clients (frontend/indexer)
 *      reconstruct Merkle proofs from `Deposit` events; the contract does not
 *      store leaves on-chain.
 */
contract PrivateVault is ReentrancyGuard, Pausable, Ownable {
    using Address for address payable;

    // ============ CONSTANTS ============

    /// @notice Tree depth (2^20 = 1,048,576 deposit capacity)
    uint256 public constant TREE_LEVELS = 20;

    /// @notice Maximum deposit amount (100 ETH)
    uint256 public constant MAX_DEPOSIT_AMOUNT = 100 ether;

    /// @notice Minimum deposit amount (0.001 ETH)
    uint256 public constant MIN_DEPOSIT_AMOUNT = 0.001 ether;

    /// @notice Number of historical roots retained for proof validity
    uint256 public constant MAX_ROOTS = 30;

    /// @notice Delay between an emergency pause request and activation
    uint256 public constant EMERGENCY_PAUSE_DELAY = 24 hours;

    /// @notice Minimum gas that must remain when entering withdraw()
    uint256 public constant MIN_WITHDRAWAL_GAS = 500000;

    /// @notice Maximum commitments per batch deposit
    uint256 public constant MAX_DEPOSITS_PER_TX = 10;

    /// @notice Maximum protocol fee, in basis points of the amount (1%)
    uint256 public constant MAX_FEE_BASIS_POINTS = 100;

    /// @notice Minimum delay between successive emergency pause requests
    uint256 public constant MIN_EMERGENCY_PAUSE_REQUEST_DELAY = 12 hours;

    // ============ IMMUTABLES ============

    /// @notice Groth16 ZK-SNARK verifier
    Groth16Verifier public immutable verifier;

    /// @notice Poseidon (t=3) hash contract
    PoseidonT3 public immutable hasher;

    // ============ PACKED STATE ============

    struct VaultState {
        uint32 nextIndex;                 // Next leaf index
        uint8 currentRootIndex;           // Index of the latest root in `roots`
        uint32 totalDeposits;             // Lifetime deposit count
        uint32 totalWithdrawals;          // Lifetime withdrawal count
        uint48 emergencyPauseTimestamp;   // When an emergency pause becomes active
        uint48 lastEmergencyPauseRequest; // Timestamp of the last pause request
        uint96 totalFees;                 // Accrued, not-yet-withdrawn protocol fees
    }

    VaultState public vaultState;

    // ============ MAPPINGS ============

    /// @notice Merkle tree filled subtrees per level
    mapping(uint256 => uint256) public filledSubtrees;

    /// @notice Rolling history of recent Merkle roots
    mapping(uint256 => uint256) public roots;

    /// @notice Pre-computed zero values per tree level
    mapping(uint256 => uint256) public zeroValues;

    /// @notice Spent nullifiers (double-spend protection)
    mapping(bytes32 => bool) public nullifierSpent;

    /// @notice Existing commitments (duplicate-deposit protection)
    mapping(uint256 => bool) public commitments;

    /// @notice Addresses that have requested an emergency pause
    mapping(address => bool) public emergencyPauseRequests;

    // ============ EVENTS ============

    event Deposit(
        uint256 indexed commitment,
        uint256 leafIndex,
        uint256 amount,
        uint256 timestamp,
        address indexed depositor
    );

    event Withdrawal(
        bytes32 indexed nullifierHash,
        address indexed recipient,
        address indexed relayer,
        uint256 amount,
        uint256 fee,
        uint256 timestamp
    );

    event RootUpdated(uint256 indexed rootIndex, uint256 root, uint256 timestamp);

    event EmergencyPauseRequested(address indexed requester, uint256 timestamp);

    event EmergencyPauseActivated(uint256 timestamp);

    event FeesWithdrawn(address indexed owner, uint256 amount, uint256 timestamp);

    // ============ MODIFIERS ============

    modifier onlyEmergencyPauseRequester() {
        require(emergencyPauseRequests[msg.sender], "Not emergency pause requester");
        _;
    }

    modifier notEmergencyPaused() {
        require(!isEmergencyPaused(), "Contract emergency paused");
        _;
    }

    modifier validGas() {
        require(gasleft() >= MIN_WITHDRAWAL_GAS, "Insufficient gas");
        _;
    }

    // ============ CONSTRUCTOR ============

    /**
     * @param _verifier     Address of the Groth16 verifier contract
     * @param _hasher       Address of the Poseidon (t=3) hash contract
     * @param _initialOwner Initial owner (fee recipient / admin)
     */
    constructor(address _verifier, address _hasher, address _initialOwner) Ownable(_initialOwner) {
        require(_verifier != address(0), "Invalid verifier address");
        require(_hasher != address(0), "Invalid hasher address");
        require(_initialOwner != address(0), "Invalid owner address");

        verifier = Groth16Verifier(_verifier);
        hasher = PoseidonT3(_hasher);

        // Initialize subtrees and zero values from the Poseidon zero chain
        for (uint256 i = 0; i <= TREE_LEVELS; i++) {
            uint256 z = hasher.zeros(i);
            filledSubtrees[i] = z;
            zeroValues[i] = z;
        }

        // Initial root is the empty-tree root
        roots[0] = hasher.zeros(TREE_LEVELS);
    }

    // ============ DEPOSIT ============

    /**
     * @notice Deposit ETH with a commitment
     * @param _commitment Poseidon(secret, nullifier, amount)
     */
    function deposit(uint256 _commitment)
        external
        payable
        nonReentrant
        whenNotPaused
        notEmergencyPaused
    {
        require(msg.value >= MIN_DEPOSIT_AMOUNT, "Deposit too small");
        require(msg.value <= MAX_DEPOSIT_AMOUNT, "Deposit too large");
        require(_commitment != 0, "Invalid commitment");
        require(!commitments[_commitment], "Commitment already exists");
        require(vaultState.nextIndex < 2 ** TREE_LEVELS, "Merkle tree is full");

        commitments[_commitment] = true;
        uint256 insertedIndex = _insert(_commitment);

        unchecked {
            vaultState.totalDeposits++;
        }

        emit Deposit(_commitment, insertedIndex, msg.value, block.timestamp, msg.sender);
    }

    /**
     * @notice Deposit multiple equal-value commitments in one transaction
     * @param _commitments Array of commitment hashes; msg.value is split evenly
     */
    function batchDeposit(uint256[] calldata _commitments)
        external
        payable
        nonReentrant
        whenNotPaused
        notEmergencyPaused
    {
        uint256 n = _commitments.length;
        require(n > 0, "Empty commitments array");
        require(n <= MAX_DEPOSITS_PER_TX, "Too many deposits");

        uint256 depositAmount = msg.value / n;
        require(depositAmount * n == msg.value, "Indivisible deposit amount");
        require(depositAmount >= MIN_DEPOSIT_AMOUNT, "Deposit too small");
        require(depositAmount <= MAX_DEPOSIT_AMOUNT, "Deposit too large");
        require(vaultState.nextIndex + n <= 2 ** TREE_LEVELS, "Merkle tree is full");

        for (uint256 i = 0; i < n; i++) {
            uint256 commitment = _commitments[i];
            require(commitment != 0, "Invalid commitment");
            require(!commitments[commitment], "Commitment already exists");

            commitments[commitment] = true;
            uint256 insertedIndex = _insert(commitment);

            emit Deposit(commitment, insertedIndex, depositAmount, block.timestamp, msg.sender);
        }

        unchecked {
            vaultState.totalDeposits += uint32(n);
        }
    }

    // ============ WITHDRAW ============

    /**
     * @notice Withdraw ETH using a Groth16 proof
     * @param _pA         Proof component A
     * @param _pB         Proof component B
     * @param _pC         Proof component C
     * @param _pubSignals [nullifierHash, root, recipient, protocolFee, amount]
     * @dev Anyone may submit a valid proof (enables relaying); `recipient` is
     *      bound inside the proof, so the submitter cannot redirect funds.
     */
    function withdraw(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals
    )
        external
        nonReentrant
        whenNotPaused
        notEmergencyPaused
        validGas
    {
        bytes32 nullifierHash = bytes32(_pubSignals[0]);
        uint256 root = _pubSignals[1];
        address payable recipient = payable(address(uint160(_pubSignals[2])));
        uint256 protocolFee = _pubSignals[3];
        uint256 amount = _pubSignals[4];

        // --- Checks (ordered most-specific first; nullifier before balance) ---
        require(recipient != address(0), "Invalid recipient");
        require(nullifierHash != bytes32(0), "Invalid nullifier");
        require(!nullifierSpent[nullifierHash], "Nullifier already spent");
        require(root != 0, "Invalid root");
        require(isKnownRoot(root), "Unknown Merkle root");
        require(amount >= MIN_DEPOSIT_AMOUNT, "Withdrawal too small");
        require(amount <= MAX_DEPOSIT_AMOUNT, "Withdrawal too large");
        require(protocolFee <= (amount * MAX_FEE_BASIS_POINTS) / 10000, "Protocol fee too high");
        require(amount <= address(this).balance, "Insufficient contract balance");
        require(
            verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Invalid ZK proof"
        );

        // --- Effects ---
        nullifierSpent[nullifierHash] = true;
        unchecked {
            vaultState.totalWithdrawals++;
            vaultState.totalFees += uint96(protocolFee);
        }

        // --- Interactions ---
        uint256 recipientAmount = amount - protocolFee;
        recipient.sendValue(recipientAmount);
        if (protocolFee > 0) {
            payable(owner()).sendValue(protocolFee);
        }

        emit Withdrawal(nullifierHash, recipient, msg.sender, recipientAmount, protocolFee, block.timestamp);
    }

    // ============ MERKLE TREE ============

    /**
     * @dev Insert a leaf into the incremental Merkle tree and update the root
     */
    function _insert(uint256 _leaf) internal returns (uint256 index) {
        uint256 _nextIndex = vaultState.nextIndex;
        require(_nextIndex != 2 ** TREE_LEVELS, "Merkle tree is full");

        uint256 currentIndex = _nextIndex;
        uint256 currentLevelHash = _leaf;
        uint256 left;
        uint256 right;

        for (uint256 i = 0; i < TREE_LEVELS; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeroValues[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hasher.poseidon([left, right]);
            currentIndex /= 2;
        }

        uint8 newRootIndex = uint8((vaultState.currentRootIndex + 1) % MAX_ROOTS);
        roots[newRootIndex] = currentLevelHash;

        vaultState.currentRootIndex = newRootIndex;
        vaultState.nextIndex = uint32(_nextIndex + 1);

        emit RootUpdated(newRootIndex, currentLevelHash, block.timestamp);

        return _nextIndex;
    }

    /// @notice Zero value for a given tree level
    function getZeroValue(uint256 _level) public view returns (uint256) {
        require(_level <= TREE_LEVELS, "Level exceeds tree depth");
        return zeroValues[_level];
    }

    /// @notice True if `_root` is in the recent root history
    function isKnownRoot(uint256 _root) public view returns (bool) {
        if (_root == 0) return false;

        uint8 _currentRootIndex = vaultState.currentRootIndex;
        uint8 i = _currentRootIndex;

        do {
            if (_root == roots[i]) return true;
            if (i == 0) {
                i = uint8(MAX_ROOTS - 1);
            } else {
                unchecked { i--; }
            }
        } while (i != _currentRootIndex);

        return false;
    }

    /// @notice The latest Merkle root
    function getLastRoot() public view returns (uint256) {
        return roots[vaultState.currentRootIndex];
    }

    // ============ EMERGENCY / ADMIN ============

    /// @notice Request an emergency pause (activatable after EMERGENCY_PAUSE_DELAY)
    function requestEmergencyPause() external {
        require(
            block.timestamp >= vaultState.lastEmergencyPauseRequest + MIN_EMERGENCY_PAUSE_REQUEST_DELAY,
            "Too soon for new request"
        );

        emergencyPauseRequests[msg.sender] = true;
        vaultState.emergencyPauseTimestamp = uint48(block.timestamp + EMERGENCY_PAUSE_DELAY);
        vaultState.lastEmergencyPauseRequest = uint48(block.timestamp);

        emit EmergencyPauseRequested(msg.sender, block.timestamp);
    }

    /// @notice Activate a previously requested emergency pause after the delay
    function activateEmergencyPause() external onlyEmergencyPauseRequester {
        require(block.timestamp >= vaultState.emergencyPauseTimestamp, "Delay not elapsed");
        _pause();
        emit EmergencyPauseActivated(block.timestamp);
    }

    /// @notice Unpause the contract (owner only)
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw accrued protocol fees (owner only)
    function withdrawFees(uint256 _amount) external onlyOwner {
        require(_amount <= vaultState.totalFees, "Insufficient fees");
        require(_amount <= address(this).balance, "Insufficient contract balance");

        unchecked {
            vaultState.totalFees -= uint96(_amount);
        }
        payable(owner()).sendValue(_amount);

        emit FeesWithdrawn(owner(), _amount, block.timestamp);
    }

    /// @notice Recover all funds while paused (owner only, emergency use)
    function emergencyWithdraw(address payable _recipient) external onlyOwner whenPaused {
        require(_recipient != address(0), "Invalid recipient");
        _recipient.sendValue(address(this).balance);
    }

    // ============ VIEWS ============

    /// @notice Contract ETH balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice True if an emergency pause is currently in effect
    function isEmergencyPaused() public view returns (bool) {
        uint48 pauseTime = vaultState.emergencyPauseTimestamp;
        return pauseTime > 0 && block.timestamp >= pauseTime;
    }

    /**
     * @notice Aggregate statistics
     * @return _totalDeposits    Lifetime deposits
     * @return _totalWithdrawals Lifetime withdrawals
     * @return _totalFees        Accrued protocol fees
     * @return _nextIndex        Next leaf index (current leaf count)
     * @return _currentRoot      Latest Merkle root
     */
    function getStatistics()
        external
        view
        returns (
            uint256 _totalDeposits,
            uint256 _totalWithdrawals,
            uint256 _totalFees,
            uint256 _nextIndex,
            uint256 _currentRoot
        )
    {
        VaultState memory state = vaultState;
        return (state.totalDeposits, state.totalWithdrawals, state.totalFees, state.nextIndex, getLastRoot());
    }

    // ============ INDEXING ============

    /// @notice Register this vault with an IndexerRegistry (owner only)
    function indexWithRegistry(address _indexerRegistry) external onlyOwner {
        require(_indexerRegistry != address(0), "Invalid registry address");
        IndexerRegistry(_indexerRegistry).indexVault(address(this));
    }
}
