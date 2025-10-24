pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./merkletree.circom";

/*
 * PrivateTransfer
 * ----------------
 * Proves, in zero knowledge, that the prover knows (secret, nullifier) for a
 * commitment that is a member of the Merkle tree with the given `root`, without
 * revealing which commitment.
 *
 * Public signals (ORDER MATTERS — must match PrivateVault.withdraw):
 *   [nullifierHash, root, recipient, protocolFee, amount]
 *
 * Soundness / safety properties enforced here:
 *   1. commitment      = Poseidon(secret, nullifier, amount)   -> binds the
 *      withdrawn `amount` to the deposited commitment, so a prover can only
 *      withdraw exactly what was deposited.
 *   2. nullifierHash   = Poseidon(secret, nullifier)           -> deterministic,
 *      revealing it does not reveal the commitment.
 *   3. Merkle membership of the commitment under `root`.
 *   4. `recipient` and `protocolFee` are public inputs and are range/relation
 *      constrained, so a relayer cannot tamper with them after proof creation
 *      (prevents fund redirection / fee inflation front-running).
 *   5. secret and nullifier are non-zero.
 *
 * NOTE on amounts: deposit values are denominated in wei. 100 ETH = 1e20 wei
 * which is ~2^66.5, so the previous GreaterThan(64)/LessEqThan(64) gadgets
 * overflowed (Num2Bits assertion failure) for any deposit above ~18.44 ETH
 * (2^64 wei). We use 128-bit gadgets, which safely cover the full 0.001–100 ETH
 * range with large headroom. The exact "fee <= 1%" policy is enforced on-chain
 * with real integer division; here we only enforce `protocolFee <= amount`
 * (in-circuit `/` is a field inverse, NOT integer division, so a 1% check in
 * the circuit would be meaningless).
 */
template PrivateTransfer(levels) {
    // ---- Public inputs ----
    signal input nullifierHash;
    signal input root;
    signal input recipient;
    signal input protocolFee;
    signal input amount;

    // ---- Private inputs ----
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1. commitment = Poseidon(secret, nullifier, amount)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== amount;

    // 2. nullifierHash = Poseidon(secret, nullifier) and must match public input
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== nullifier;
    nullifierHash === nullifierHasher.out;

    // 3. Merkle membership of commitment under root
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitmentHasher.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 4a. amount fits in 128 bits (range bound; prevents field-wrap ambiguity)
    component amountBits = Num2Bits(128);
    amountBits.in <== amount;

    // 4b. amount must be strictly positive
    component amountIsZero = IsZero();
    amountIsZero.in <== amount;
    amountIsZero.out === 0;

    // 4c. recipient must be a valid 160-bit Ethereum address
    component recipientBits = Num2Bits(160);
    recipientBits.in <== recipient;

    // 4d. protocolFee fits in 128 bits and cannot exceed amount
    component feeBits = Num2Bits(128);
    feeBits.in <== protocolFee;

    component feeLeqAmount = LessEqThan(128);
    feeLeqAmount.in[0] <== protocolFee;
    feeLeqAmount.in[1] <== amount;
    feeLeqAmount.out === 1;

    // 5. secret and nullifier must be non-zero
    component secretIsZero = IsZero();
    secretIsZero.in <== secret;
    secretIsZero.out === 0;

    component nullifierIsZero = IsZero();
    nullifierIsZero.in <== nullifier;
    nullifierIsZero.out === 0;
}

component main {public [nullifierHash, root, recipient, protocolFee, amount]} = PrivateTransfer(20);
