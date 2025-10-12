# Obscura 🔐

**Privacy-Preserving Ethereum Transfers Using Zero-Knowledge Proofs**

A decentralized privacy mixer that enables anonymous ETH transfers on Ethereum using ZK-SNARKs. Currently in active development.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-yellow)](https://hardhat.org/)

---

## Overview

Obscura implements a non-custodial privacy solution where users can deposit ETH with cryptographic commitments and withdraw to different addresses using zero-knowledge proofs, ensuring mathematical privacy guarantees.

### Current Status

🚧 **Under Active Development** - Core functionality implemented and tested locally

### Key Features (Implemented)

✅ **Cryptographic Privacy** - ZK-SNARK proofs for mathematical privacy guarantees  
✅ **Non-Custodial** - Users always control their funds  
✅ **Merkle Tree** - Supports up to 2^20 deposits  
✅ **Poseidon Hashing** - ZK-friendly hash function implementation  
✅ **Local Testing** - End-to-end functionality verified

---

## Architecture

### Smart Contracts

```
contracts/
├── PrivateVault.sol      # Main privacy mixer contract
├── Verifier.sol          # Groth16 ZK-SNARK verifier (generated)
├── PoseidonT3.sol        # ZK-friendly hash function
└── ObscuraFactory.sol    # Factory for deployments
```

### ZK Circuits

```
circuits/
├── private-transfer.circom      # Main circuit for private transfers
├── merkletree.circom            # Merkle tree membership proof
└── private-transfer_js/         # Compiled circuit artifacts
```

---

## Quick Start

### Prerequisites

- Node.js v18+
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repository-url>
cd obscura

# Install dependencies
npm install

# Install circuit dependencies
cd circuits && npm install && cd ..
```

### Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy contracts (in another terminal)
npx hardhat run scripts/deploy-local.js --network localhost

# Run end-to-end test
npx hardhat run scripts/test-local.js --network localhost
```

---

## Development Progress

### ✅ Completed

- [x] Smart contract architecture design
- [x] ZK circuit implementation (Circom)
- [x] Trusted setup ceremony completion
- [x] Contract deployment scripts
- [x] Local testing infrastructure
- [x] End-to-end functionality verification
- [x] Gas optimization for contracts

### 🚧 In Progress

- [ ] Sepolia testnet deployment
- [ ] Frontend interface development
- [ ] Relayer system for gas abstraction
- [ ] Multi-amount deposit support
- [ ] Security audit preparation

### 📋 Next Steps

- Deploy to Sepolia testnet
- Build user interface
- Add comprehensive test suite
- Performance optimizations
- Documentation completion

---

## Technical Specifications

### Circuit Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Merkle Tree Depth** | 20 levels | Supports 2^20 = 1,048,576 deposits |
| **Hash Function** | Poseidon (t=3) | ZK-friendly with 2 inputs |
| **Proof System** | Groth16 | Constant-size proofs |
| **Constraints** | ~11,000 | Circuit complexity |

### Contract Limits

| Parameter | Value |
|-----------|-------|
| **Min Deposit** | 0.001 ETH |
| **Max Deposit** | 100 ETH |
| **Tree Capacity** | 1,048,576 deposits |

---

## Development

### Project Structure

```
obscura/
├── circuits/                    # Circom circuits
│   ├── private-transfer.circom  # Main circuit
│   ├── merkletree.circom        # Merkle proof verification
│   └── private-transfer_js/     # Compiled artifacts
├── contracts/                   # Solidity contracts
│   ├── PrivateVault.sol        # Main mixer contract
│   ├── Verifier.sol            # ZK verifier
│   └── PoseidonT3.sol          # Poseidon hash
├── scripts/                     # Deployment & testing
│   ├── deploy-local.js          # Local deployment
│   └── test-local.js           # E2E testing
├── hardhat.config.js           # Hardhat configuration
└── package.json                # Dependencies
```

### Building Circuits

```bash
cd circuits

# Compile circuit
circom private-transfer.circom --r1cs --wasm --sym

# Run trusted setup (already completed)
# Files: pot16_final.ptau, private-transfer_final.zkey
```

---

## Security Notes

⚠️ **Development Stage** - This project is in active development and has not been audited. Use only for testing purposes.

### Trusted Setup

The ZK-SNARK trusted setup ceremony has been completed with proper contribution rounds and beacon finalization.

---

## Contributing

This is an active development project. Contributions and feedback welcome!

---

## License

MIT License - see LICENSE file for details.

---

## Acknowledgments

- Tornado Cash for pioneering privacy on Ethereum
- Iden3 for Circom and circomlibjs
- ZCash for ZK-SNARK research
- Ethereum Foundation for privacy research

---

**Developer:** Abdul Saheel
**Status:** Active Development 🚧
