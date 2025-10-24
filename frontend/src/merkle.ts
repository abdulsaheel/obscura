/**
 * Canonical incremental Merkle tree for Obscura (TypeScript port).
 *
 * Faithful port of scripts/lib/merkle.js — it MUST reproduce the exact
 * root/proof semantics of PrivateVault.sol and the indexer:
 *   - Poseidon(t=3) two-input hash (circomlib-compatible, via poseidon-lite)
 *   - zero chain: zeros[0] = 0, zeros[i+1] = poseidon2(zeros[i], zeros[i])
 *   - each tree level pads a missing right sibling with that level's zero value
 *
 * A full rebuild with per-level zero padding yields the same root as the
 * contract's incremental insertion, so this is used by the frontend's
 * client-side fallback proof path and to sanity-check computed roots before
 * proving.
 */

import { poseidon2 } from 'poseidon-lite'

export const TREE_LEVELS = 20

export function computeZeros(levels: number): bigint[] {
  const zeros: bigint[] = [0n]
  for (let i = 1; i <= levels; i++) {
    zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]])
  }
  return zeros
}

export interface MerkleProof {
  pathElements: bigint[]
  pathIndices: number[]
  root: bigint
}

export class IncrementalMerkleTree {
  readonly levels: number
  readonly zeros: bigint[]
  readonly leaves: bigint[]

  constructor(levels: number = TREE_LEVELS) {
    this.levels = levels
    this.zeros = computeZeros(levels)
    this.leaves = []
  }

  insert(leaf: bigint | number | string): number {
    this.leaves.push(BigInt(leaf))
    return this.leaves.length - 1
  }

  get nextIndex(): number {
    return this.leaves.length
  }

  root(): bigint {
    let level = this.leaves.length ? this.leaves.map((l) => BigInt(l)) : [this.zeros[0]]
    for (let l = 0; l < this.levels; l++) {
      const next: bigint[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = i + 1 < level.length ? level[i + 1] : this.zeros[l]
        next.push(poseidon2([left, right]))
      }
      level = next.length ? next : [this.zeros[l + 1]]
    }
    return level[0]
  }

  /**
   * Build a Merkle proof for the leaf at `index`.
   */
  proof(index: number): MerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`leaf index ${index} out of range (have ${this.leaves.length})`)
    }
    const pathElements: bigint[] = []
    const pathIndices: number[] = []
    let level = this.leaves.map((l) => BigInt(l))
    let idx = index

    for (let l = 0; l < this.levels; l++) {
      const isLeft = idx % 2 === 0
      pathIndices.push(isLeft ? 0 : 1)
      const siblingIdx = isLeft ? idx + 1 : idx - 1
      const sibling = siblingIdx < level.length ? level[siblingIdx] : this.zeros[l]
      pathElements.push(sibling)

      const next: bigint[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = i + 1 < level.length ? level[i + 1] : this.zeros[l]
        next.push(poseidon2([left, right]))
      }
      level = next.length ? next : [this.zeros[l + 1]]
      idx = Math.floor(idx / 2)
    }

    return { pathElements, pathIndices, root: level[0] }
  }
}
