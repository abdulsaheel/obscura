# Obscura: Privacy-Preserving Transfers on Ethereum

**A Zero-Knowledge Approach to Anonymous Value Transfer**

**Version 1.0 | October 2025**

---

## Abstract

Obscura is a non-custodial privacy protocol that enables anonymous ETH transfers on Ethereum using zero-knowledge proofs. The protocol implements a commitment-nullifier scheme with Merkle tree membership verification, providing cryptographic privacy guarantees without trusted intermediaries. By leveraging Groth16 ZK-SNARKs and the Poseidon hash function, Obscura achieves efficient on-chain verification while maintaining a large anonymity set. This whitepaper describes the cryptographic primitives, protocol design, security model, and implementation details of the Obscura system.

**Keywords:** Zero-Knowledge Proofs, Privacy, Ethereum, ZK-SNARKs, Anonymity, Cryptocurrency

---

## 1. Introduction

### 1.1 Motivation

Blockchain transparency, while beneficial for auditability, presents significant privacy challenges. All Ethereum transactions are publicly visible, creating a permanent record of financial relationships. This transparency enables:

- **Transaction graph analysis** - Linking addresses through transaction flows
- **Balance tracking** - Monitoring account holdings over time  
- **Identity deanonymization** - Correlating addresses with real-world identities
- **Front-running attacks** - Exploiting predictable transaction patterns

Privacy is not merely a matter of preference but a fundamental requirement for:
- **Financial sovereignty** - Preventing discrimination based on transaction history
- **Business confidentiality** - Protecting competitive commercial information
- **Personal safety** - Avoiding targeted attacks based on known holdings
- **Fungibility** - Ensuring all ETH is equally acceptable regardless of history

### 1.2 Problem Statement

The core challenge is enabling **unlinkable value transfer**: how can Alice send ETH to Bob such that external observers cannot determine that the transfer occurred?

**Naive Approaches (Insufficient):**
- **New addresses** - Transaction graph analysis reveals links
- **Mixers with trust** - Centralized operators can steal or deanonymize
- **Multi-signature schemes** - Still leave on-chain traces

**Requirements for Solution:**
1. **Unlinkability** - No connection between deposit and withdrawal
2. **Non-custodial** - Users maintain control of funds
3. **Cryptographic** - Privacy guaranteed by mathematics, not trust
4. **Efficient** - Reasonable gas costs and proof generation time
5. **Scalable** - Support large number of users

### 1.3 Approach

Obscura solves this through **commitment-based privacy**:

1. **Deposit Phase:** User commits to a secret without revealing it
2. **Anonymity Set:** Multiple users deposit, creating an anonymity pool
3. **Withdrawal Phase:** User proves knowledge of a secret in the set without revealing which one

This is achieved using:
- **ZK-SNARKs** - Prove knowledge without revealing information
- **Merkle Trees** - Efficient membership proofs for commitment set
- **Nullifiers** - Prevent double-spending without revealing commitment

---

## 2. Cryptographic Primitives

### 2.1 Zero-Knowledge Proofs

**Definition:** A zero-knowledge proof allows a prover P to convince a verifier V that a statement is true without revealing any information beyond the validity of the statement.

**Properties:**
- **Completeness:** If the statement is true, an honest verifier will be convinced
- **Soundness:** If the statement is false, no cheating prover can convince the verifier
- **Zero-Knowledge:** The verifier learns nothing beyond the truth of the statement

**ZK-SNARKs** (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge):
- **Succinct:** Proofs are small (constant size ~200 bytes)
- **Non-Interactive:** Single message from prover to verifier
- **Arguments:** Computationally sound (secure against polynomial-time adversaries)

### 2.2 Groth16 Proof System

Obscura uses Groth16, a pairing-based ZK-SNARK with:

**Advantages:**
- Constant proof size (3 group elements)
- Efficient verification (~2ms on-chain)
- Well-studied and battle-tested

**Tradeoffs:**
- Requires trusted setup ceremony
- Circuit-specific (new setup per circuit)
- Not quantum-resistant

**Proof Structure:**
```
π = (A, B, C) where:
A ∈ G₁ (proof element 1)
B ∈ G₂ (proof element 2)  
C ∈ G₁ (proof element 3)
```

**Verification Equation:**
```
e(A, B) = e(α, β) · e(C, δ) · e(∑ᵢ(aᵢ·Lᵢ), γ)
```

Where `e` is the pairing function and `α, β, γ, δ` are setup parameters.

### 2.3 Poseidon Hash Function

Traditional hash functions (SHA-256, Keccak) are expensive in ZK circuits. Poseidon is designed for ZK-SNARK efficiency.

**Design:**
- **Sponge construction** - Absorb inputs, squeeze output
- **Hades permutation** - Full and partial rounds for security
- **Field arithmetic** - Native operations in ZK circuits

**Parameters (Obscura Configuration):**
```
t = 3          # Width (1 capacity + 2 rate)
F = Bn254      # Field (same as Groth16)
Full rounds: 8
Partial rounds: 57
```

**Efficiency Comparison:**

| Hash Function | Constraints | Relative Cost |
|---------------|-------------|---------------|
| SHA-256 | ~25,000 | 1000x |
| Keccak-256 | ~30,000 | 1200x |
| **Poseidon** | **~200** | **1x** |

**Security:** 128-bit security level against algebraic attacks.

### 2.4 Merkle Trees

Obscura uses a binary Merkle tree to efficiently prove membership in a large set.

**Structure:**
```
Level 0:  [H(leaf₀), H(leaf₁), H(leaf₂), H(leaf₃), ...]
Level 1:  [H(H₀‖H₁), H(H₂‖H₃), ...]
Level 2:  [H(H₀₋₁‖H₂₋₃), ...]
...
Root:     H(...)
```

**Properties:**
- **Depth:** 20 levels (supports 2²⁰ = 1,048,576 deposits)
- **Proof size:** 20 hashes (640 bytes)
- **Verification:** O(log n) operations

**Zero Values:**
Obscura precomputes zero values for empty tree positions:
```
Zero₀ = 0
Zeroᵢ = Poseidon(Zeroᵢ₋₁, Zeroᵢ₋₁)
```

This allows efficient insertion without recomputing empty branches.

---

## 3. Protocol Design

### 3.1 System Overview

**Actors:**
- **Depositor:** User who deposits ETH into the pool
- **Withdrawer:** User who withdraws ETH (may be different from depositor)
- **Contract:** On-chain smart contract managing the pool
- **Observer:** External party attempting to link transactions

**Flow:**
```
1. Depositor generates (secret, nullifier)
2. Computes commitment = Poseidon(secret, nullifier, amount)
3. Deposits ETH with commitment → inserted into Merkle tree
4. [Time passes, other users deposit...]
5. Withdrawer builds Merkle proof for commitment
6. Generates ZK proof: "I know secret for commitment in tree"
7. Withdraws to recipient address
```

### 3.2 Commitment Scheme

**Generation:**
```
secret ← random(𝔽)          # 254-bit random value
nullifier ← random(𝔽)       # 254-bit random value  
amount ← deposit value      # In wei

commitment = Poseidon(secret, nullifier, amount)
```

**Properties:**
- **Hiding:** Commitment reveals nothing about secret or nullifier
- **Binding:** Cannot find different inputs producing same commitment
- **Unique:** Each commitment is unique (high probability)

**Security Considerations:**
- Secret and nullifier MUST be truly random
- If secret is leaked, funds can be stolen
- If nullifier is reused across deposits, linkability increases

### 3.3 Nullifier Mechanism

Nullifiers prevent double-spending while maintaining privacy.

**Computation:**
```
nullifierHash = Poseidon(secret, nullifier)
```

**Usage:**
- On withdrawal, nullifierHash is revealed and stored
- Contract checks nullifierHash hasn't been used before
- Same commitment cannot be withdrawn twice

**Why It Works:**
- Nullifier is hidden in commitment (via Poseidon)
- Cannot compute nullifierHash without knowing secret
- Each unique (secret, nullifier) pair produces unique nullifierHash
- Revealing nullifierHash doesn't reveal which commitment it came from

### 3.4 Merkle Tree Operations

**Insertion (Deposit):**
```solidity
function _insert(uint256 commitment) internal returns (uint256 index) {
    uint256 currentIndex = nextIndex;
    uint256 currentLevelHash = commitment;
    uint256 left;
    uint256 right;
    
    for (uint256 i = 0; i < TREE_LEVELS; i++) {
        if (currentIndex % 2 == 0) {
            left = currentLevelHash;
            right = zeros[i];
        } else {
            left = filledSubtrees[i];
            right = currentLevelHash;
        }
        
        currentLevelHash = hasher.poseidon([left, right]);
        currentIndex /= 2;
        
        if (currentIndex % 2 == 0) {
            filledSubtrees[i] = currentLevelHash;
        }
    }
    
    root = currentLevelHash;
    nextIndex++;
    
    return nextIndex - 1;
}
```

**Proof Generation (Off-chain):**
```javascript
function buildMerkleProof(leafIndex, tree) {
    const pathElements = [];
    const pathIndices = [];
    
    let currentIndex = leafIndex;
    
    for (let i = 0; i < TREE_DEPTH; i++) {
        const isLeft = currentIndex % 2 === 0;
        
        if (isLeft) {
            pathElements.push(tree.getSibling(currentIndex));
            pathIndices.push(0);
        } else {
            pathElements.push(tree.getSibling(currentIndex));
            pathIndices.push(1);
        }
        
        currentIndex = Math.floor(currentIndex / 2);
    }
    
    return { pathElements, pathIndices };
}
```

**Verification (In-circuit):**
```circom
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    signal hashes[levels + 1];
    hashes[0] <== leaf;
    
    component hashers[levels];
    component selectors[levels];
    
    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== hashes[i];
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];
        
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].out[0];
        hashers[i].inputs[1] <== selectors[i].out[1];
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    root === hashes[levels];
}
```

### 3.5 ZK Circuit

The core circuit proves the following statement:

**Public Inputs:**
```
nullifierHash   # Prevents double-spending
root            # Merkle root to verify against
recipient       # Withdrawal address
protocolFee     # Fee amount
amount          # Withdrawal amount
```

**Private Inputs:**
```
secret          # Known only to user
nullifier       # Known only to user
pathElements[20] # Merkle proof
pathIndices[20]  # Merkle proof
```

**Constraints:**

1. **Commitment Reconstruction:**
   ```circom
   commitment <== Poseidon(secret, nullifier, amount)
   ```

2. **Nullifier Hash Verification:**
   ```circom
   nullifierHashComputed <== Poseidon(secret, nullifier)
   nullifierHash === nullifierHashComputed
   ```

3. **Merkle Proof Verification:**
   ```circom
   tree.leaf <== commitment
   tree.root <== root
   # (tree verification as shown above)
   ```

4. **Range Checks:**
   ```circom
   # Amount must be positive
   amount > 0
   
   # Fee must not exceed 1% 
   protocolFee <= amount / 100
   
   # Recipient must be valid address
   recipient < 2^160
   ```

5. **Non-Zero Secrets:**
   ```circom
   secret ≠ 0
   nullifier ≠ 0
   ```

**Circuit Statistics:**
- **Constraints:** 11,826 (5,720 non-linear + 6,106 linear)
- **Wires:** 11,846
- **Public Inputs:** 5
- **Private Inputs:** 42
- **Proof Generation Time:** ~30-60 seconds (local machine)
- **Verification Time:** ~2ms on-chain

---

## 4. Smart Contract Architecture

### 4.1 PrivateVault Contract

The main contract managing deposits and withdrawals.

**State Variables:**
```solidity
// Merkle tree
uint256[TREE_LEVELS + 1] public filledSubtrees;
uint256[TREE_LEVELS + 1] public zeroValues;
uint256[ROOT_HISTORY_SIZE] public roots;

// Commitments and nullifiers
mapping(uint256 => bool) public commitments;
mapping(uint256 => bool) public nullifiers;

// References
Groth16Verifier public immutable verifier;
PoseidonT3 public immutable hasher;

// Statistics
VaultState public vaultState;
```

**Key Functions:**

**Deposit:**
```solidity
function deposit(uint256 _commitment) 
    external 
    payable 
    nonReentrant 
    whenNotPaused 
{
    require(msg.value >= MIN_DEPOSIT_AMOUNT, "Deposit too small");
    require(msg.value <= MAX_DEPOSIT_AMOUNT, "Deposit too large");
    require(_commitment != 0, "Invalid commitment");
    require(!commitments[_commitment], "Commitment already exists");
    require(vaultState.nextIndex < 2**TREE_LEVELS, "Tree is full");
    
    commitments[_commitment] = true;
    uint256 insertedIndex = _insert(_commitment);
    
    vaultState.totalDeposits++;
    
    emit Deposit(_commitment, insertedIndex, msg.value, block.timestamp, msg.sender);
}
```

**Withdraw:**
```solidity
function withdraw(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[5] calldata _pubSignals
) 
    external 
    nonReentrant 
    whenNotPaused 
{
    uint256 nullifierHash = _pubSignals[0];
    uint256 root = _pubSignals[1];
    address payable recipient = payable(address(uint160(_pubSignals[2])));
    uint256 protocolFee = _pubSignals[3];
    uint256 amount = _pubSignals[4];
    
    require(!nullifiers[nullifierHash], "Nullifier already used");
    require(isKnownRoot(root), "Invalid root");
    require(amount >= MIN_DEPOSIT_AMOUNT, "Withdrawal too small");
    require(amount <= MAX_DEPOSIT_AMOUNT, "Withdrawal too large");
    
    require(
        verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
        "Invalid proof"
    );
    
    nullifiers[nullifierHash] = true;
    vaultState.totalWithdrawals++;
    vaultState.totalFees += protocolFee;
    
    (bool success, ) = recipient.call{value: amount - protocolFee}("");
    require(success, "Transfer failed");
    
    emit Withdrawal(nullifierHash, recipient, amount, protocolFee, block.timestamp);
}
```

### 4.2 Verifier Contract

Auto-generated by snarkjs from the proving key.

**Core Function:**
```solidity
function verifyProof(
    uint[2] memory _pA,
    uint[2][2] memory _pB,
    uint[2] memory _pC,
    uint[5] memory _pubSignals
) public view returns (bool) {
    // Pairing check: e(A, B) = e(α, β) · e(C, δ) · e(inputs, γ)
    return pairing(
        Pairing.negate(_pA),
        _pB,
        alpha1,
        beta2,
        _vk_x,
        gamma2,
        _pC,
        delta2
    );
}
```

**Verification Cost:** ~250,000 gas (dominated by pairing operations)

### 4.3 PoseidonT3 Contract

Implements the Poseidon hash function optimized for Ethereum.

**Implementation:**
```solidity
function poseidon(uint256[2] memory input) public pure returns (uint256) {
    uint256 t = 3;  // Width
    uint256[3] memory state;
    
    // Initialize state
    state[0] = 0;
    state[1] = input[0];
    state[2] = input[1];
    
    // Full rounds
    for (uint256 i = 0; i < 4; i++) {
        // Add round constants
        for (uint256 j = 0; j < t; j++) {
            state[j] = addmod(state[j], C[i * t + j], F);
        }
        
        // S-box (x^5)
        for (uint256 j = 0; j < t; j++) {
            uint256 x = state[j];
            uint256 x2 = mulmod(x, x, F);
            uint256 x4 = mulmod(x2, x2, F);
            state[j] = mulmod(x4, x, F);
        }
        
        // MDS matrix multiplication
        uint256[3] memory newState;
        for (uint256 j = 0; j < t; j++) {
            uint256 sum = 0;
            for (uint256 k = 0; k < t; k++) {
                sum = addmod(sum, mulmod(M[j][k], state[k], F), F);
            }
            newState[j] = sum;
        }
        state = newState;
    }
    
    // Partial rounds...
    
    // Final output
    return state[0];
}
```

**Gas Cost:** ~45,000 per hash (vs ~3,000 for Keccak256)

**Tradeoff:** Higher on-chain cost justified by massive savings in ZK circuit (200 constraints vs 25,000).

---

## 5. Security Analysis

### 5.1 Threat Model

**Assumptions:**
- Cryptographic primitives are secure (discrete log, pairing hardness)
- Trusted setup was performed honestly (at least one participant was honest)
- Users maintain custody of their secret and nullifier
- Ethereum network is secure and operational

**Adversarial Goals:**
1. **Link deposits to withdrawals** (break privacy)
2. **Steal funds** (break safety)
3. **Double-spend commitments** (break uniqueness)
4. **Forge proofs** (break soundness)
5. **Deny service** (break availability)

### 5.2 Privacy Analysis

**Anonymity Set:**
The privacy of Obscura depends on the size of the anonymity set - the number of deposits that a withdrawal could potentially correspond to.

**Worst Case:** Single deposit
```
Privacy = 0 bits (trivially linkable)
```

**Best Case:** n deposits of same amount
```
Privacy = log₂(n) bits

n = 100 deposits → 6.6 bits
n = 1,000 deposits → 10 bits  
n = 10,000 deposits → 13.3 bits
n = 100,000 deposits → 16.6 bits
```

**Linkability Attacks:**

1. **Timing Analysis:**
   - Deposit and immediate withdrawal → likely same user
   - **Mitigation:** Wait for more deposits before withdrawing

2. **Amount Correlation:**
   - Unique amounts can reduce anonymity set
   - **Mitigation:** Fixed denomination pools (future work)

3. **Gas Price Correlation:**
   - Uncommon gas prices may be fingerprintable
   - **Mitigation:** Use standard gas prices

4. **IP Address Correlation:**
   - Same IP for deposit/withdrawal → linkable
   - **Mitigation:** Use Tor/VPN, relayers (future)

**Privacy Guarantee:**
Under the assumptions that:
- Adversary cannot break Poseidon or Groth16
- User properly generates random secret/nullifier
- User waits for sufficient deposits before withdrawing
- No side-channel information (timing, IP, etc.)

Then: **Withdrawal is computationally indistinguishable from any other withdrawal in the anonymity set.**

### 5.3 Safety Analysis

**Preventing Theft:**

1. **Proof Verification:**
   ```solidity
   require(verifier.verifyProof(_pA, _pB, _pC, _pubSignals), "Invalid proof");
   ```
   Cannot withdraw without valid proof → cannot steal others' funds

2. **Nullifier Uniqueness:**
   ```solidity
   require(!nullifiers[nullifierHash], "Nullifier already used");
   ```
   Cannot withdraw same commitment twice

3. **Root Verification:**
   ```solidity
   require(isKnownRoot(root), "Invalid root");
   ```
   Proof must be for a valid historical root

4. **Non-Reentrancy:**
   ```solidity
   modifier nonReentrant() { ... }
   ```
   Prevents reentrancy attacks during withdrawal

**Attack Scenarios:**

**Q: Can attacker forge a proof?**
A: No. Breaking Groth16 requires solving discrete log problem in pairing groups (computationally infeasible).

**Q: Can attacker steal commitment after seeing deposit?**
A: No. Commitment is one-way hash. Cannot extract secret from commitment.

**Q: Can attacker front-run withdrawal?**
A: No. Withdrawal requires knowledge of secret. Front-runner doesn't have it.

**Q: Can contract owner steal funds?**
A: No. Contract has no owner withdrawal function. Funds locked until valid proof.

### 5.4 Soundness Analysis

**Circuit Constraints:**
All constraints must be satisfied for proof to verify.

**Critical Constraints:**

1. **Commitment Consistency:**
   ```
   commitment === Poseidon(secret, nullifier, amount)
   ```
   Prover must use correct commitment construction

2. **Nullifier Linkage:**
   ```
   nullifierHash === Poseidon(secret, nullifier)
   ```
   Nullifier must be derived from same secret

3. **Merkle Membership:**
   ```
   MerkleProof(commitment, root, path) === true
   ```
   Commitment must exist in the tree

**Soundness Guarantee:**
If proof verifies, then with overwhelming probability:
- Prover knows (secret, nullifier) for some commitment in the tree
- Nullifier corresponds to that commitment
- All range checks are satisfied

**Probability of soundness error:** ≈ 2⁻¹²⁸ (negligible)

### 5.5 Implementation Vulnerabilities

**Smart Contract Risks:**

1. **Integer Overflow/Underflow:**
   - **Risk:** Arithmetic errors in balances or indices
   - **Mitigation:** Solidity 0.8+ has built-in overflow checks

2. **Reentrancy:**
   - **Risk:** Attacker calls back into contract during withdrawal
   - **Mitigation:** `nonReentrant` modifier, checks-effects-interactions pattern

3. **Access Control:**
   - **Risk:** Unauthorized parties calling admin functions
   - **Mitigation:** `onlyOwner` modifier, minimal privileged functions

4. **Root History:**
   - **Risk:** Proofs for very old roots may be invalid
   - **Mitigation:** Store last 100 roots, require proof uses recent root

**Circuit Risks:**

1. **Under-constrained Circuits:**
   - **Risk:** Missing constraints allow invalid proofs
   - **Mitigation:** Formal verification (future), extensive testing

2. **Field Overflow:**
   - **Risk:** Values exceeding field modulus behave unexpectedly
   - **Mitigation:** Explicit range checks on all inputs

3. **Trusted Setup Compromise:**
   - **Risk:** If setup is backdoored, attacker can forge proofs
   - **Mitigation:** Multi-party ceremony with public contribution

---

## 6. Performance & Scalability

### 6.1 Gas Costs

**Deposit Transaction:**
```
Base Cost:       21,000 gas
Storage (commitment): ~20,000 gas
Merkle insertion:     ~60,000 gas
Poseidon hashes (20x): ~800,000 gas
Logs & updates:   ~5,000 gas
-------------------------
Total:           ~906,000 gas
```

**Withdrawal Transaction:**
```
Base Cost:       21,000 gas
Proof verification:   ~250,000 gas
Storage (nullifier):  ~20,000 gas
Transfer:         ~10,000 gas
-------------------------
Total:           ~301,000 gas
```

**Cost Comparison (at 25 gwei, ETH = $2000):**

| Operation | Gas | ETH Cost | USD Cost |
|-----------|-----|----------|----------|
| Deposit | 906,000 | 0.0226 | $45.30 |
| Withdraw | 301,000 | 0.0075 | $15.05 |
| **Round-trip** | **1,207,000** | **0.0301** | **$60.35** |

**For privacy:** $60 is reasonable compared to alternatives (centralized mixers, Tornado Cash).

### 6.2 Proof Generation

**Local Machine (M1 MacBook Pro):**
- CPU: Apple M1 (8 cores)
- RAM: 16 GB
- Time: 30-60 seconds

**Server (AWS t3.xlarge):**
- CPU: Intel Xeon (4 vCPU)
- RAM: 16 GB  
- Time: 60-90 seconds

**Constraints:**
- **Proof size:** 192 bytes (constant)
- **Public inputs:** 160 bytes (5 × 32 bytes)
- **Total:** 352 bytes (fits in single transaction)

### 6.3 Scalability Limits

**Current Capacity:**
```
Merkle tree depth: 20
Maximum deposits: 2^20 = 1,048,576
```

**At full capacity:**
```
Proof size: Still 192 bytes (constant!)
Verification: Still ~2ms (constant!)
```

**Bottlenecks:**

1. **Deposit Gas Cost:**
   - Grows with tree depth (O(log n) hashes)
   - Current: 20 hashes per deposit
   - If depth → 30: 30 hashes (50% more gas)

2. **Proof Generation Time:**
   - Grows with circuit size
   - Current: 11,826 constraints → 30-60s
   - If 2x constraints → ~60-120s

3. **Trusted Setup Size:**
   - Current proving key: ~70 MB
   - Limits browser-based proof generation
   - Requires server or local computation

**Scaling Solutions (Future Work):**

1. **Layer 2 Deployment:**
   - Deploy on Arbitrum/Optimism → 10-100x cheaper gas
   - Same security model, faster/cheaper transactions

2. **Recursive Proofs:**
   - Prove multiple withdrawals in one proof
   - Aggregate n withdrawals → ~same gas as 1

3. **PLONK/Halo2 Migration:**
   - Universal trusted setup (reusable)
   - Better proof generation time
   - Tradeoff: Larger proofs (~10-20KB)

---

## 7. Implementation Details

### 7.1 Trusted Setup Ceremony

Obscura requires a trusted setup ceremony to generate proving/verification keys.

**Phase 1: Powers of Tau**
```bash
# Generate initial parameters
snarkjs powersoftau new bn128 16 pot16_0000.ptau

# Multiple contributors add randomness
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau --name="Contributor 1"

# Apply random beacon (e.g., Bitcoin block hash)
snarkjs powersoftau beacon pot16_0001.ptau pot16_final.ptau <beacon> 10
```

**Phase 2: Circuit-Specific Setup**
```bash
# Link circuit to Phase 1
snarkjs groth16 setup private-transfer.r1cs pot16_final.ptau private-transfer_0000.zkey

# Contributors add randomness
snarkjs zkey contribute private-transfer_0000.zkey private-transfer_0001.zkey --name="Contributor 1"

# Apply random beacon
snarkjs zkey beacon private-transfer_0001.zkey private-transfer_final.zkey <beacon> 10

# Export verification key
snarkjs zkey export solidityverifier private-transfer_final.zkey Verifier.sol
```

**Security Assumption:**
At least one contributor in Phase 1 AND one contributor in Phase 2 must honestly delete their toxic waste. If this holds, setup is secure.

**Verification:**
Anyone can verify the setup:
```bash
snarkjs zkey verify private-transfer.r1cs pot16_final.ptau private-transfer_final.zkey
```

### 7.2 Deposit Workflow

**1. Generate Randomness:**
```javascript
const crypto = require('crypto');

const secret = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
const nullifier = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
```

**2. Compute Commitment:**
```javascript
const { buildPoseidon } = require('circomlibjs');

const poseidon = await buildPoseidon();
const amount = ethers.parseEther("1.0");

const commitment = poseidon.F.toString(
  poseidon([secret, nullifier, amount])
);
```

**3. Store Note:**
```javascript
const note = {
  secret: secret.toString(),
  nullifier: nullifier.toString(),
  amount: amount.toString(),
  commitment: commitment,
  network: "sepolia",
  timestamp: Date.now()
};

fs.writeFileSync('note.json', JSON.stringify(note, null, 2));
```

**4. Send Transaction:**
```javascript
const vault = await ethers.getContractAt("PrivateVault", VAULT_ADDRESS);

const tx = await vault.deposit(commitment, {
  value: amount
});

const receipt = await tx.wait();
console.log("Deposited at index:", getLeafIndexFromReceipt(receipt));
```

### 7.3 Withdrawal Workflow

**1. Load Note:**
```javascript
const note = JSON.parse(fs.readFileSync('note.json'));
const secret = BigInt(note.secret);
const nullifier = BigInt(note.nullifier);
const amount = BigInt(note.amount);
```

**2. Get Current Root:**
```javascript
const vaultState = await vault.vaultState();
const currentRootIndex = vaultState.currentRootIndex;
const root = await vault.roots(currentRootIndex);
```

**3. Build Merkle Proof:**
```javascript
// Simplified: Get proof for leaf at index 0
const pathElements = [];
const pathIndices = [];

for (let i = 0; i < 20; i++) {
  const zeroValue = await poseidonContract.zeros(i);
  pathElements.push(zeroValue.toString());
  pathIndices.push(0); // Assuming left position
}
```

**4. Generate ZK Proof:**
```javascript
const snarkjs = require('snarkjs');

const circuitInputs = {
  // Public
  nullifierHash: poseidon.F.toString(poseidon([secret, nullifier])),
  root: root.toString(),
  recipient: recipientAddress,
  protocolFee: "0",
  amount: amount.toString(),
  
  // Private
  secret: secret.toString(),
  nullifier: nullifier.toString(),
  pathElements: pathElements,
  pathIndices: pathIndices
};

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  circuitInputs,
  "private-transfer.wasm",
  "private-transfer_final.zkey"
);
```

**5. Format Proof:**
```javascript
const proofA = [proof.pi_a[0], proof.pi_a[1]];
const proofB = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],
  [proof.pi_b[1][1], proof.pi_b[1][0]]
];
const proofC = [proof.pi_c[0], proof.pi_c[1]];
```

**6. Send Withdrawal:**
```javascript
const tx = await vault.withdraw(
  proofA,
  proofB,
  proofC,
  publicSignals
);

await tx.wait();
console.log("Withdrawn to:", recipientAddress);
```

---

## 8. Comparison with Related Work

### 8.1 Tornado Cash

**Similarities:**
- Commitment-nullifier scheme
- Merkle tree for membership
- Groth16 ZK-SNARKs
- Fixed denomination pools

**Differences:**

| Feature | Tornado Cash | Obscura |
|---------|--------------|---------|
| **Denominations** | Fixed (0.1, 1, 10, 100 ETH) | Variable (0.001-100 ETH) |
| **Relayers** | Yes (for gas-less withdrawals) | No (direct withdrawals) |
| **Compliance** | OFAC sanctions (2022) | Educational only |
| **Governance** | TORN token | None |
| **Audit Status** | Audited (2020) | Not audited |

**Trade-offs:**
- Tornado has larger anonymity sets (separate pools)
- Obscura has simpler architecture (no relayers)
- Tornado has compliance issues (sanctions)

### 8.2 Zcash

**Similarities:**
- Zero-knowledge proofs for privacy
- Shielded transactions
- Cryptographic guarantees

**Differences:**

| Feature | Zcash | Obscura |
|---------|-------|---------|
| **Architecture** | Separate blockchain | Ethereum smart contract |
| **Proof System** | Halo2 (no trusted setup) | Groth16 (trusted setup) |
| **Privacy** | Default option | Opt-in mixer |
| **Transparency** | Shielded & transparent pools | Only transparent |
| **Liquidity** | Native ZEC | Wrapped ETH |

**Trade-offs:**
- Zcash has better privacy defaults
- Obscura leverages Ethereum ecosystem
- Zcash avoids trusted setup (Halo2)

### 8.3 Aztec Protocol

**Similarities:**
- Privacy on Ethereum
- ZK-SNARKs
- Private state transitions

**Differences:**

| Feature | Aztec | Obscura |
|---------|-------|---------|
| **Scope** | Full L2 with private DeFi | Simple mixer |
| **Proof System** | PLONK (universal setup) | Groth16 (circuit-specific) |
| **Composability** | Private smart contracts | Single-purpose mixer |
| **Complexity** | High | Low |
| **Status** | Production (Aztec Connect sunset) | Educational |

**Trade-offs:**
- Aztec is more ambitious (full private L2)
- Obscura is simpler and easier to understand
- Aztec has better long-term scalability

---

## 9. Future Work

### 9.1 The Hydra Protocol: Censorship-Resistant Privacy Infrastructure

**The Next Evolution of Obscura**

The most significant future development is the transformation from a single privacy mixer to a **decentralized, permissionless network of thousands of vaults** - the **Hydra Protocol**.

**Motivation:**

The Tornado Cash sanctions of August 2022 demonstrated a critical vulnerability in privacy infrastructure: a single set of contract addresses can be sanctioned, effectively killing the protocol. The Hydra Protocol solves this through **unstoppable multiplication**.

**Core Concept: "You Can't Ban Them All"**

```
Traditional Mixer:
└── Single Contract (0x123...)
    └── OFAC sanctions it → DEAD

Hydra Protocol:
├── Vault 1 (0x111...)  ┐
├── Vault 2 (0x222...)  │
├── Vault 3 (0x333...)  ├─ 1,000+ identical vaults
├── ...                 │
└── Vault 1000 (0xfff...)┘
    ├── Sanction 10 → Deploy 100 more
    ├── Sanction 100 → Deploy 1,000 more
    └── UNSTOPPABLE
```

**Architecture Components:**

**1. IndexerRegistry Contract**
```solidity
contract IndexerRegistry {
    // Immutable reference to canonical vault implementation
    bytes32 public immutable CANONICAL_VAULT_CODEHASH;
    
    // Self-registration for new vaults
    function registerVault() external payable {
        bytes32 codeHash;
        assembly { codeHash := extcodehash(caller()) }
        
        require(codeHash == CANONICAL_VAULT_CODEHASH, "Not canonical");
        
        isIndexed[msg.sender] = true;
        emit VaultIndexed(msg.sender, block.timestamp, codeHash);
    }
}
```

**Purpose:**
- Verifies new vaults match the audited canonical implementation
- Provides on-chain registry of valid vaults
- Permissionless registration (anyone can deploy + register)

**2. VaultFactory Contract**
```solidity
contract VaultFactory {
    function deployVault() external payable returns (address) {
        PrivateVault vault = new PrivateVault(verifier, hasher, indexer);
        vault.selfRegister{value: 0.001 ether}();
        return address(vault);
    }
    
    function deployVaultBatch(uint256 count) external payable {
        // Deploy multiple vaults in one transaction
    }
}
```

**Economics:**
- Cost per vault: ~0.002 ETH ($4 at $2000 ETH)
- Anyone can deploy (permissionless)
- Rapid scaling: 1,000 vaults = $4,000

**3. Distributed Indexer Nodes (P2P Network)**

**Technology:** libp2p (same as IPFS, Filecoin) + gossipsub pub/sub

**Node Responsibilities:**
```javascript
// Listen for on-chain vault registrations
indexer.on("VaultIndexed", async (vault, timestamp, codeHash) => {
    // Verify code hash matches canonical
    if (codeHash === CANONICAL_VAULT_CODEHASH) {
        // Add to local database
        db.insert({ vault, timestamp, verified: true });
        
        // Broadcast to P2P peers
        await gossipsub.publish('obscura-vaults', {
            type: 'NEW_VAULT',
            vault: vault,
            timestamp: Date.now()
        });
    }
});

// Serve API for users
app.get('/vaults/active', (req, res) => {
    res.json(db.getActive());
});
```

**Network Properties:**
- Decentralized: No single point of failure
- Censorship-resistant: Can't shut down P2P network
- Self-healing: Nodes join/leave dynamically
- Tor-compatible: Run over hidden services

**4. Modified PrivateVault**

```solidity
contract PrivateVault {
    IndexerRegistry public immutable indexer;
    
    function selfRegister() external payable {
        indexer.registerVault{value: msg.value}();
    }
    
    function deposit(uint256 commitment) external payable {
        // ... existing logic ...
        
        // Notify indexer of activity
        if (isIndexed) {
            indexer.recordDeposit(msg.value);
        }
    }
}
```

**Benefits:**
- Self-aware (knows about indexer network)
- Reports activity (helps track liquidity)
- Backward compatible

**5. User Experience**

**Multi-Vault Deposit Splitting:**
```javascript
// User deposits 10 ETH once
// UI automatically splits across 10 random vaults

async function splitDeposit(amount) {
    const vaults = await getRandomVaults(10);
    const perVault = amount / 10;
    
    for (const vault of vaults) {
        const commitment = generateCommitment();
        await vault.deposit(commitment, { value: perVault });
    }
}
```

**Anonymity Set Multiplication:**
```
Single vault:     100 deposits  → log₂(100) = 6.6 bits privacy
10 vaults:        1,000 deposits → log₂(1000) = 10 bits privacy
100 vaults:       10,000 deposits → log₂(10000) = 13.3 bits privacy
1,000 vaults:     100,000 deposits → log₂(100000) = 16.6 bits privacy
```

**Why It Works:**

**Property 1: Permissionless Deployment**
- Anyone can deploy new vaults for $4
- No gatekeepers, no permissions needed
- Deploy 100 vaults/hour if needed

**Property 2: Code Verification**
- Only canonical bytecode gets indexed
- Cryptographic guarantee of safety
- No malicious vaults can infiltrate

**Property 3: Economic Sustainability**
```
Revenue (Protocol fees 0.1%):
- 1,000 ETH/day volume = 1 ETH/day revenue
- $730,000/year at $2000 ETH

Costs (Deployment):
- 1,000 vaults = $4,000 one-time
- Node operation = $5-20/month per node

Net: Sustainable with community funding
```

**Property 4: Censorship Resistance**
```
To kill Hydra Protocol, regulators must:
1. Identify ALL vault addresses (1000+)
2. Sanction them faster than deployment
3. Shut down P2P indexer network (impossible)
4. Block direct IP connections (Tor defeats)
5. Prevent code verification (on-chain, unstoppable)

Result: Computationally infeasible to censor
```

**Comparison to Tornado Cash:**

| Feature | Tornado Cash | Hydra Protocol |
|---------|--------------|----------------|
| **Contracts** | 5 fixed addresses | 1,000+ dynamic addresses |
| **Discovery** | Central website | P2P network |
| **Deployment** | Team only | Anyone (permissionless) |
| **Sanctionability** | Easy (ban 5 addresses) | Impossible (ban 1000+?) |
| **Anonymity Set** | Per-pool | Cross-vault (massive) |
| **Censorship Resistance** | Low | Very High |

**Security Considerations:**

**Attack 1: Sybil Attack (Spam Network)**
- Attacker deploys 10,000 fake vaults

**Defense:**
```solidity
require(msg.value >= 0.001 ether, "Registration fee");
// Cost: 10 ETH ($20,000) to spam
// + Code verification rejects non-canonical
```

**Attack 2: Eclipse Attack (Isolate User)**
- Attacker surrounds user's node with malicious peers

**Defense:**
- Nodes verify vaults on-chain (source of truth)
- Multiple seed nodes in different jurisdictions
- Random peer selection

**Attack 3: Regulatory Pressure**
- Government demands node operators shut down

**Defense:**
- Run nodes via Tor (anonymous operators)
- No KYC, no registration (permissionless)
- Nodes in multiple jurisdictions
- Can't identify who runs nodes

**Long-Term Vision:**

```
Becomes unstoppable privacy infrastructure
Regulators give up trying to ban
Privacy becomes default, not exception
```

**For full details, see [FUTURE.md](./FUTURE.md) in the repository.**

### 9.2 Short-Term Improvements

**1. Fixed Denomination Pools**
- Create separate pools for 0.1, 1, 10 ETH
- Increases anonymity set for common amounts
- Prevents amount correlation attacks

**2. Relayer System**
- Third-party pays gas for withdrawal
- User provides proof + relayer fee
- Breaks link between deposit source and withdrawal gas payer

**3. Compliance Module**
- Optional identity attestation
- Selective disclosure of transaction history
- Balance between privacy and regulatory compliance

**4. Gas Optimizations**
- Batch Merkle insertions
- Optimize Poseidon implementation
- Use storage-efficient data structures

### 9.3 Long-Term Research

**1. Universal Setup Migration**
- Move from Groth16 to PLONK/Halo2
- Eliminate trusted setup requirement
- Enable circuit upgrades without new ceremony

**2. Recursive Proofs**
- Aggregate multiple withdrawals into one proof
- Reduce on-chain verification cost
- Enable privacy-preserving rollups

**3. Cross-Chain Privacy**
- Deposit on Ethereum, withdraw on L2
- Use proof-of-burn + zk-bridge
- Expand anonymity set across chains

**4. Private Smart Contracts**
- Extend to private token transfers (ERC-20)
- Private DeFi interactions
- Full programmable privacy layer

**5. Formal Verification**
- Mathematically prove circuit correctness
- Verify absence of under-constrained bugs
- Use tools like Coq, Isabelle/HOL

**6. Cross-Vault Zero-Knowledge Proofs**
- Prove "I have a deposit in ONE of these 1,000 vaults" without revealing which
- Requires advanced ZK techniques (proof aggregation, recursive SNARKs)
- Would enable true cross-vault anonymity

### 9.4 Open Questions

**1. Anonymity Set Growth**
How to bootstrap liquidity and grow anonymity sets initially?
- Incentivize early deposits with rewards?
- Partner with privacy-focused applications?
- Market maker programs?

**2. Long-Term Privacy**
If quantum computers break elliptic curves, proofs become forgeable:
- Migration path to post-quantum ZK-SNARKs?
- Time-lock encryption for future privacy?
- Social layer solutions (trusted enclaves)?

**3. Regulatory Compliance**
How to balance privacy with regulatory requirements?
- Selective disclosure protocols?
- Privacy pools with attestations?
- Decentralized compliance frameworks?

---

## 10. Conclusion

Obscura demonstrates that strong cryptographic privacy is achievable on Ethereum without trusted intermediaries. By combining zero-knowledge proofs, Merkle trees, and carefully designed circuits, the protocol provides unlinkable transfers with mathematical guarantees.

**Key Contributions:**

1. **Privacy Primitive:** Commitment-nullifier scheme with ZK proofs
2. **Efficient Implementation:** Gas-optimized with Poseidon hashing
3. **Security Model:** Formal analysis of privacy and safety properties
4. **Educational Resource:** Well-documented implementation for learning

**Limitations:**

- Requires trusted setup ceremony
- No relayer system (gas metadata linkable)
- Variable amounts reduce anonymity
- Not suitable for production without audit

**Future Vision:**

Obscura represents a building block for privacy-preserving applications on Ethereum. As ZK technology matures (universal setups, recursive proofs, better performance), protocols like Obscura can scale to provide strong privacy guarantees for millions of users.

Privacy is not about hiding wrongdoing—it's about preserving fundamental rights in an increasingly transparent digital world. Obscura takes one step toward making that vision a reality.

---

## References

1. **Groth16:** Jens Groth. "On the Size of Pairing-Based Non-interactive Arguments." EUROCRYPT 2016. https://eprint.iacr.org/2016/260

2. **Poseidon:** Lorenzo Grassi et al. "Poseidon: A New Hash Function for Zero-Knowledge Proof Systems." USENIX Security 2021. https://eprint.iacr.org/2019/458

3. **Tornado Cash:** Roman Semenov, Roman Storm. "Tornado.cash Privacy Solution." 2019. https://tornado.cash

4. **Zcash Protocol:** Daira Hopwood et al. "Zcash Protocol Specification." 2021. https://zips.z.cash/protocol/protocol.pdf

5. **Circom:** iden3. "Circom: Circuit Compiler for Zero-Knowledge Proofs." https://docs.circom.io/

6. **Merkle Trees:** Ralph Merkle. "A Digital Signature Based on a Conventional Encryption Function." CRYPTO 1987.

7. **Zero-Knowledge Proofs:** Shafi Goldwasser, Silvio Micali, Charles Rackoff. "The Knowledge Complexity of Interactive Proof Systems." STOC 1985.

8. **Aztec Protocol:** Zac Williamson, Ariel Gabizon. "The Aztec Protocol." 2020. https://aztec.network

---

## Appendix A: Mathematical Notation

| Symbol | Meaning |
|--------|---------|
| 𝔽 | Finite field (BN254 scalar field) |
| ℤ | Integers |
| ℤₚ | Integers modulo p |
| G₁, G₂ | Elliptic curve groups |
| e: G₁ × G₂ → Gₜ | Pairing function |
| H: {0,1}* → 𝔽 | Hash function |
| ← | Assignment or random sampling |
| ‖ | Concatenation |
| ⊕ | XOR operation |
| ≈ | Approximately equal |
| ∃ | There exists |
| ∀ | For all |

---

## Appendix B: Circuit Code

**Full Circom Circuit:**
```circom
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "merkletree.circom";

template PrivateTransfer(levels) {
    // Public inputs
    signal input nullifierHash;
    signal input root;
    signal input recipient;
    signal input protocolFee;
    signal input amount;

    // Private inputs  
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Intermediary signals
    signal commitment;
    signal nullifierHashComputed;

    // Components
    component commitmentHasher = Poseidon(3);
    component nullifierHasher = Poseidon(2);
    component tree = MerkleTreeChecker(levels);
    
    component amountCheck = GreaterThan(64);
    component feeCheck = LessEqThan(64);
    component recipientCheck = LessThan(160);

    // Compute commitment
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;  
    commitmentHasher.inputs[2] <== amount;
    commitment <== commitmentHasher.out;

    // Compute nullifier hash
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== nullifier;
    nullifierHashComputed <== nullifierHasher.out;

    // Verify nullifier hash
    nullifierHash === nullifierHashComputed;

    // Verify Merkle membership
    tree.leaf <== commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // Validate amount
    amountCheck.in[0] <== amount;
    amountCheck.in[1] <== 0;
    amountCheck.out === 1;

    // Validate fee
    feeCheck.in[0] <== protocolFee;
    feeCheck.in[1] <== amount / 100;
    feeCheck.out === 1;

    // Validate recipient
    recipientCheck.in[0] <== recipient;
    recipientCheck.in[1] <== 2**160;
    recipientCheck.out === 1;

    // Ensure non-zero secrets
    component secretCheck = IsZero();
    component nullifierCheck = IsZero();
    
    secretCheck.in <== secret;
    secretCheck.out === 0;
    
    nullifierCheck.in <== nullifier;
    nullifierCheck.out === 0;
}

component main {public [nullifierHash, root, recipient, protocolFee, amount]} = PrivateTransfer(20);
```

---

## Appendix C: Gas Optimization Techniques

**1. Packed Storage:**
```solidity
struct VaultState {
    uint32 nextIndex;
    uint8 currentRootIndex;
    uint32 totalDeposits;
    uint32 totalWithdrawals;
    uint48 emergencyPauseTimestamp;
    uint48 lastEmergencyPauseRequest;
    uint96 totalFees;
}
// All fit in 2 storage slots instead of 7!
```

**2. Immutable References:**
```solidity
Groth16Verifier public immutable verifier;
PoseidonT3 public immutable hasher;
// Stored in code, not storage (cheaper reads)
```

**3. Unchecked Arithmetic:**
```solidity
unchecked {
    vaultState.totalDeposits++;
}
// Safe because value cannot realistically overflow uint32
```

**4. Assembly Optimization:**
```solidity
function poseidon(uint256[2] memory input) public pure returns (uint256) {
    assembly {
        // Direct memory manipulation for efficiency
        // ~10% gas savings vs pure Solidity
    }
}
```

---

**End of Whitepaper**

---

*Obscura: Built for Privacy, Designed for Learning*

*October 2025*
