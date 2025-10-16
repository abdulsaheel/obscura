pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./merkletree.circom";

template PrivateTransfer(levels) {
    // Public inputs (must match contract expectations: [nullifierHash, root, recipient, protocolFee, amount])
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
    signal leafIndex;

    // Components
    component commitmentHasher = Poseidon(3);
    component nullifierHasher = Poseidon(2);
    component tree = MerkleTreeChecker(levels);
    
    // Range checks
    component amountCheck = GreaterThan(64);
    component feeCheck = LessEqThan(64);
    component recipientCheck = LessThan(160);

    // 1. Calculate commitment from secret, nullifier, amount
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;  
    commitmentHasher.inputs[2] <== amount;
    commitment <== commitmentHasher.out;

    // 2. Calculate nullifier hash from secret and nullifier
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== nullifier;
    nullifierHashComputed <== nullifierHasher.out;

    // 3. Verify nullifier hash matches public input
    nullifierHash === nullifierHashComputed;

    // 4. Verify commitment exists in Merkle tree
    tree.leaf <== commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 5. Amount validation - must be positive and within bounds
    amountCheck.in[0] <== amount;
    amountCheck.in[1] <== 0;
    amountCheck.out === 1;

    // 6. Protocol fee validation - max 1% (100 basis points)
    feeCheck.in[0] <== protocolFee;
    feeCheck.in[1] <== amount / 100; // 1% max fee
    feeCheck.out === 1;

    // 7. Recipient validation - must be valid address
    recipientCheck.in[0] <== recipient;
    recipientCheck.in[1] <== 2**160; // Max address value
    recipientCheck.out === 1;

    // 8. Ensure secret and nullifier are non-zero
    component secretCheck = IsZero();
    component nullifierCheck = IsZero();
    
    secretCheck.in <== secret;
    secretCheck.out === 0;
    
    nullifierCheck.in <== nullifier;
    nullifierCheck.out === 0;
}

component main {public [nullifierHash, root, recipient, protocolFee, amount]} = PrivateTransfer(20); 