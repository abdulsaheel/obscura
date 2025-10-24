import { ethers } from 'ethers'

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