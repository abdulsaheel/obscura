'use strict';

/**
 * Proof + commitment helpers shared by tests and scripts.
 * Commitment / nullifier hashing must match the circuit (poseidon-lite is
 * circomlib-compatible) and the contract's PoseidonT3.
 */

const path = require('path');
const fs = require('fs');
const { poseidon2, poseidon3 } = require('poseidon-lite');
const snarkjs = require('snarkjs');

const ROOT = path.join(__dirname, '..', '..');

// Resolve circuit artifacts from circuits/ (after a local build) or fall back to
// the tracked copies under frontend/public/circuits (so CI can run proof tests
// even though the circuits/ build artifacts are gitignored).
function resolveArtifact(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const WASM_PATH = resolveArtifact([
  path.join(ROOT, 'circuits', 'private-transfer_js', 'private-transfer.wasm'),
  path.join(ROOT, 'frontend', 'public', 'circuits', 'private-transfer.wasm'),
]);
const ZKEY_PATH = resolveArtifact([
  path.join(ROOT, 'circuits', 'private-transfer_final.zkey'),
  path.join(ROOT, 'frontend', 'public', 'circuits', 'private-transfer_final.zkey'),
]);

function commitment(secret, nullifier, amount) {
  return poseidon3([BigInt(secret), BigInt(nullifier), BigInt(amount)]);
}

function nullifierHash(secret, nullifier) {
  return poseidon2([BigInt(secret), BigInt(nullifier)]);
}

/**
 * Generate a Groth16 proof for a withdrawal.
 * @param {object} p
 * @param {bigint|string} p.secret
 * @param {bigint|string} p.nullifier
 * @param {bigint|string} p.amount       wei
 * @param {string|bigint} p.recipient    0x-address or decimal
 * @param {bigint|string} p.protocolFee  wei
 * @param {bigint|string} p.root         merkle root
 * @param {(bigint|string)[]} p.pathElements
 * @param {(number|string)[]} p.pathIndices
 */
async function generateProof(p) {
  const input = {
    nullifierHash: nullifierHash(p.secret, p.nullifier).toString(),
    root: BigInt(p.root).toString(),
    recipient: BigInt(p.recipient).toString(),
    protocolFee: BigInt(p.protocolFee).toString(),
    amount: BigInt(p.amount).toString(),
    secret: BigInt(p.secret).toString(),
    nullifier: BigInt(p.nullifier).toString(),
    pathElements: p.pathElements.map((x) => BigInt(x).toString()),
    pathIndices: p.pathIndices.map((x) => x.toString()),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
  return { proof, publicSignals, input };
}

/** Format a snarkjs proof into the (pA, pB, pC) tuple the Verifier expects. */
function formatProof(proof) {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
  };
}

module.exports = {
  commitment,
  nullifierHash,
  generateProof,
  formatProof,
  WASM_PATH,
  ZKEY_PATH,
};
