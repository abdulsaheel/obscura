import * as snarkjs from 'snarkjs'
import { ethers } from 'ethers'
import { poseidon2, poseidon3 } from 'poseidon-lite'

// Simple Poseidon hash implementation for commitment generation
export async function simplePoseidon(inputs: bigint[]): Promise<bigint> {
  // Use poseidon-lite which is browser-compatible
  if (inputs.length === 2) {
    const hash = poseidon2(inputs)
    return BigInt(hash.toString())
  } else if (inputs.length === 3) {
    const hash = poseidon3(inputs)
    return BigInt(hash.toString())
  } else {
    throw new Error(`Unsupported input length: ${inputs.length}`)
  }
}

// Generate REAL ZK proof for withdrawal using snarkjs
export async function generateWithdrawalProof(
  secret: string,
  nullifier: string,
  amount: string,
  recipient: string,
  protocolFee: string,
  merkleRoot: string,
  pathElements: string[],
  pathIndices: number[]
): Promise<{
  proof: {
    pi_a: [string, string]
    pi_b: [[string, string], [string, string]]
    pi_c: [string, string]
  }
  publicSignals: string[]
}> {
  try {
    // Convert inputs to appropriate formats
    const secretBigInt = BigInt(secret)
    const nullifierBigInt = BigInt(nullifier)
    const amountBigInt = ethers.parseEther(amount)
    const protocolFeeBigInt = ethers.parseEther(protocolFee)
    const rootBigInt = BigInt(merkleRoot)

    // Handle recipient address - ensure it's a valid Ethereum address
    let recipientBigInt: bigint
    if (recipient.startsWith('0x')) {
      // Convert hex address to BigInt
      recipientBigInt = BigInt(recipient)
    } else {
      // Assume it's already a decimal string
      recipientBigInt = BigInt(recipient)
    }

    // Validate recipient is within Ethereum address range
    if (recipientBigInt >= BigInt(2) ** BigInt(160)) {
      throw new Error('Recipient address is invalid or too large')
    }
    if (recipientBigInt < 0) {
      throw new Error('Recipient address cannot be negative')
    }

    // Calculate nullifier hash: Poseidon(secret, nullifier)
    const nullifierHash = await simplePoseidon([secretBigInt, nullifierBigInt])

    // Prepare circuit inputs
    const input = {
      // Public inputs (must match contract expectations: [nullifierHash, root, recipient, protocolFee, amount])
      nullifierHash: nullifierHash.toString(),
      root: rootBigInt.toString(),
      recipient: recipientBigInt.toString(),
      protocolFee: protocolFeeBigInt.toString(),
      amount: amountBigInt.toString(),

      // Private inputs
      secret: secretBigInt.toString(),
      nullifier: nullifierBigInt.toString(),
      pathElements: pathElements.map(x => x.toString()),
      pathIndices: pathIndices.map(x => x.toString())
    }

    console.log('🔍 Circuit input validation:')
    console.log('   nullifierHash:', nullifierHash.toString())
    console.log('   root:', rootBigInt.toString())
    console.log('   recipient:', recipientBigInt.toString(), `(hex: 0x${recipientBigInt.toString(16)})`)
    console.log('   protocolFee:', protocolFeeBigInt.toString())
    console.log('   amount:', amountBigInt.toString())
    console.log('   secret:', secretBigInt.toString().substring(0, 20) + '...')
    console.log('   nullifier:', nullifierBigInt.toString().substring(0, 20) + '...')
    console.log('   pathElements length:', pathElements.length)
    console.log('   pathIndices length:', pathIndices.length)

    // Load the WASM file and zkey file
    const wasmResponse = await fetch('/circuits/private-transfer.wasm')
    const wasmBuffer = await wasmResponse.arrayBuffer()

    const zkeyResponse = await fetch('/circuits/private-transfer_final.zkey')
    const zkeyBuffer = await zkeyResponse.arrayBuffer()

    // Generate the proof using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    )

    console.log('Generated ZK proof:', { proof, publicSignals })

    // Format the proof to match contract expectations
    const formattedProof = {
      pi_a: proof.pi_a as [string, string],
      pi_b: proof.pi_b as [[string, string], [string, string]],
      pi_c: proof.pi_c as [string, string]
    }

    return { proof: formattedProof, publicSignals }

  } catch (error) {
    console.error('REAL ZK proof generation failed:', error)
    throw new Error('Failed to generate ZK proof: ' + (error as Error).message)
  }
}