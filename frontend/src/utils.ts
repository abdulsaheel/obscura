import { ethers } from 'ethers'

// Simplified Poseidon hash for demo (returns uint256)
export function simplePoseidon(inputs: bigint[]): bigint {
  // This is a simplified hash for demo purposes
  // In production, you'd use the actual Poseidon hash from circomlibjs
  const combined = inputs.reduce((acc, val) => acc + val.toString(), '')
  const hash = ethers.keccak256(ethers.toUtf8Bytes(combined))
  return BigInt(hash)
}

export function generateRandomBytes(length: number): string {
  const bytes = ethers.randomBytes(length)
  return ethers.hexlify(bytes)
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatEther(wei: string): string {
  return ethers.formatEther(wei)
}