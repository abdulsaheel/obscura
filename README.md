# Obscura 🔐

**Privacy-Preserving Ethereum Transfers Using Zero-Knowledge Proofs**

A decentralized privacy mixer that enables anonymous ETH transfers on Ethereum using ZK-SNARKs. Beta version now live with distributed indexing.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-yellow)](https://hardhat.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

---

## Overview

Obscura implements a non-custodial privacy solution where users can deposit ETH with cryptographic commitments and withdraw to different addresses using zero-knowledge proofs, ensuring mathematical privacy guarantees.

### Current Status

� **Beta Version Live** - Core functionality deployed to Sepolia testnet with distributed indexing

### Key Features (Implemented)

✅ **Cryptographic Privacy** - ZK-SNARK proofs for mathematical privacy guarantees  
✅ **Non-Custodial** - Users always control their funds  
✅ **Merkle Tree** - Supports up to 2^20 deposits  
✅ **Poseidon Hashing** - ZK-friendly hash function implementation  
✅ **Distributed Indexing** - Codehash-based vault discovery and verification  
✅ **Factory Deployment** - Deterministic bytecode for canonical contracts  
✅ **Sepolia Testnet** - Live deployment with 3 indexed vaults  
✅ **REST API** - Public indexer API for vault discovery

---

## Architecture

### Smart Contracts

```
contracts/
├── PrivateVault.sol         # Main privacy mixer contract
├── Verifier.sol             # Groth16 ZK-SNARK verifier (generated)
├── PoseidonT3.sol           # ZK-friendly hash function
├── ObscuraFactory.sol       # Factory for deterministic deployments
└── IndexerRegistry.sol      # On-chain vault registry with codehash verification
```

### Distributed Indexer

```
indexer/
├── src/index.ts             # Main indexer with P2P networking
├── data/indexer.db          # SQLite database for vault storage
└── API endpoints:
    ├── /health             # System health check
    ├── /vaults/active      # Active vault discovery
    ├── /stats              # Network statistics
    └── /vaults/:address    # Individual vault details
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

# Install indexer dependencies
cd indexer && npm install && cd ..
```

### Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy contracts (in another terminal)
npx hardhat run scripts/deploy-local.js --network localhost

# Build and start indexer
cd indexer
npm run build
npm start

# Check indexer health
curl http://localhost:3001/health
```

### Sepolia Testnet

```bash
# Deploy to Sepolia
npx hardhat run scripts/deploy-fresh.js --network sepolia

# Deploy factory
npx hardhat run scripts/deploy-factory.js --network sepolia

# Start indexer with Sepolia config
cd indexer
npm run build
npm start
```

---

## Distributed Indexing System

### How It Works

1. **Factory Deployment**: `ObscuraFactory` creates vaults with deterministic bytecode using CREATE2
2. **Codehash Verification**: Only vaults with canonical codehash get indexed
3. **On-Chain Registry**: `IndexerRegistry` maintains verified vault list
4. **Distributed Indexers**: Anyone can run an indexer node that returns identical results
5. **Automatic Discovery**: New canonical vaults are detected within 30 seconds

### API Usage

```bash
# Get active vaults
curl http://localhost:3001/vaults/active

# Get network stats
curl http://localhost:3001/stats

# Get vault details
curl http://localhost:3001/vaults/0x1234...abcd

# Health check
curl http://localhost:3001/health
```

### Current Live Deployment

- **Network**: Sepolia Testnet
- **Factory**: `0x5Cd1572B6865D8641615E7C01fB438218616d695`
- **Registry**: `0x098cb0db955Ba6983B1240a1F356252DCB519847`
- **Indexed Vaults**: 3 canonical vaults
- **Canonical Codehash**: `0x98ea1214d9067670163e1937d5696d2e5571578822801d92e48dbf0a724c669b`

---

## Development Progress

### ✅ Completed (Beta)

- [x] Smart contract architecture design
- [x] ZK circuit implementation (Circom)
- [x] Trusted setup ceremony completion
- [x] Contract deployment scripts
- [x] Sepolia testnet deployment
- [x] Factory-based deterministic deployment
- [x] Codehash-based indexing system
- [x] Distributed indexer implementation
- [x] REST API for vault discovery
- [x] On-chain registry with verification
- [x] End-to-end functionality verification
- [x] Gas optimization for contracts

### 🚧 In Progress

- [ ] P2P node communication (needs rewrite)
- [ ] Frontend interface development
- [ ] Relayer system for gas abstraction
- [ ] Multi-amount deposit support
- [ ] Security audit preparation

### 📋 Next Steps

- Fix/rewrite P2P node communication
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
| **License Fee** | 0.1 ETH (factory deployment) |

### Indexing System

| Component | Status | Description |
|-----------|--------|-------------|
| **Factory Deployment** | ✅ Live | Deterministic bytecode creation |
| **Codehash Verification** | ✅ Live | Only canonical contracts indexed |
| **On-Chain Registry** | ✅ Live | 3 vaults currently indexed |
| **REST API** | ✅ Live | Public vault discovery |
| **P2P Networking** | 🚧 TODO | Needs rewrite/fix |

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
│   ├── PoseidonT3.sol          # Poseidon hash
│   ├── ObscuraFactory.sol      # Deterministic factory
│   └── IndexerRegistry.sol     # On-chain registry
├── indexer/                     # Distributed indexer
│   ├── src/index.ts            # Main indexer logic
│   ├── data/indexer.db         # SQLite database
│   └── API endpoints           # REST API
├── scripts/                     # Deployment & testing
│   ├── deploy-fresh.js         # Fresh deployment
│   ├── deploy-factory.js       # Factory deployment
│   └── deploy-final-test.js    # Testing scripts
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

⚠️ **Beta Software** - This project is in beta and has not been audited. Use only for testing purposes.

### Trusted Setup

The ZK-SNARK trusted setup ceremony has been completed with proper contribution rounds and beacon finalization.

### Canonical Contract Security

- Only vaults deployed through `ObscuraFactory` have canonical bytecode
- Codehash verification prevents modified contracts from being indexed
- Factory enforces deterministic deployment for consistent indexing

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
**Status:** Beta Version Live 🚀

**Live Demo:** [Sepolia Testnet](https://sepolia.etherscan.io/) - Check indexed vaults at the registry contract
