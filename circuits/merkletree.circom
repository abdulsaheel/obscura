pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component selectors[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Ensure pathIndices[i] is binary (0 or 1)
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        
        // Calculate left and right inputs based on path index
        selectors[i] = Selector();
        selectors[i].pathIndex <== pathIndices[i];
        selectors[i].currentHash <== levelHashes[i];
        selectors[i].pathElement <== pathElements[i];

        // Hash the selected left and right values
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].left;
        hashers[i].inputs[1] <== selectors[i].right;
        
        levelHashes[i + 1] <== hashers[i].out;
    }

    // The final hash must equal the provided root
    root === levelHashes[levels];
}

// Helper template to select correct left/right order for hashing
template Selector() {
    signal input pathIndex;
    signal input currentHash;
    signal input pathElement;
    
    signal output left;
    signal output right;

    // If pathIndex == 0: left = currentHash, right = pathElement
    // If pathIndex == 1: left = pathElement, right = currentHash
    left <== currentHash + pathIndex * (pathElement - currentHash);
    right <== pathElement + pathIndex * (currentHash - pathElement);
} 