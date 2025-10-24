'use strict';

/**
 * Canonical incremental Merkle tree for Obscura, in plain JS.
 *
 * It MUST reproduce the exact root/proof semantics of PrivateVault.sol:
 *   - Poseidon(t=3) two-input hash (circomlib-compatible, via poseidon-lite)
 *   - zero chain: zeros[0] = 0, zeros[i+1] = poseidon2(zeros[i], zeros[i])
 *   - each tree level pads a missing right sibling with that level's zero value
 *
 * A full rebuild with per-level zero padding yields the same root as the
 * contract's incremental insertion, so this is used by tests, the indexer
 * (/merkle-proof), and as the reference for the frontend implementation.
 */

const { poseidon2 } = require('poseidon-lite');

const TREE_LEVELS = 20;

function computeZeros(levels) {
  const zeros = [0n];
  for (let i = 1; i <= levels; i++) {
    zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

class IncrementalMerkleTree {
  constructor(levels = TREE_LEVELS) {
    this.levels = levels;
    this.zeros = computeZeros(levels);
    this.leaves = [];
  }

  insert(leaf) {
    this.leaves.push(BigInt(leaf));
    return this.leaves.length - 1;
  }

  get nextIndex() {
    return this.leaves.length;
  }

  root() {
    let level = this.leaves.length ? this.leaves.map((l) => BigInt(l)) : [this.zeros[0]];
    for (let l = 0; l < this.levels; l++) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : this.zeros[l];
        next.push(poseidon2([left, right]));
      }
      level = next.length ? next : [this.zeros[l + 1]];
    }
    return level[0];
  }

  /**
   * Build a Merkle proof for the leaf at `index`.
   * @returns {{ pathElements: bigint[], pathIndices: number[], root: bigint }}
   */
  proof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`leaf index ${index} out of range (have ${this.leaves.length})`);
    }
    const pathElements = [];
    const pathIndices = [];
    let level = this.leaves.map((l) => BigInt(l));
    let idx = index;

    for (let l = 0; l < this.levels; l++) {
      const isLeft = idx % 2 === 0;
      pathIndices.push(isLeft ? 0 : 1);
      const siblingIdx = isLeft ? idx + 1 : idx - 1;
      const sibling = siblingIdx < level.length ? level[siblingIdx] : this.zeros[l];
      pathElements.push(sibling);

      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : this.zeros[l];
        next.push(poseidon2([left, right]));
      }
      level = next.length ? next : [this.zeros[l + 1]];
      idx = Math.floor(idx / 2);
    }

    return { pathElements, pathIndices, root: level[0] };
  }
}

module.exports = { IncrementalMerkleTree, computeZeros, TREE_LEVELS };
