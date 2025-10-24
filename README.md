# Obscura 🔐

**Privacy-Preserving Ethereum Transfers Using Zero-Knowledge Proofs**

A decentralized privacy mixer that enables anonymous ETH transfers on Ethereum using ZK-SNARKs. Beta software with a distributed, on-chain-verified indexer.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-yellow)](https://hardhat.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

---

## Overview

Obscura implements a non-custodial privacy solution where users can deposit ETH with cryptographic commitments and withdraw to different addresses using zero-knowledge proofs, ensuring mathematical privacy guarantees.

### Current Status

**Beta software — not audited.** Core functionality works end-to-end and runs on the Sepolia testnet. The previously published Sepolia addresses are now **STALE** following the contract/circuit rewrite; a redeploy is pending. See [Deployment](#deployment).

### Key Features (Implemented)

- **Cryptographic Privacy** — Groth16 ZK-SNARK proofs for mathematical privacy guarantees
- **Non-Custodial** — users always control their funds
- **Merkle Tree** — supports up to 2^20 deposits
- **Poseidon Hashing** — ZK-friendly hash function (PoseidonT3)
- **Distributed Indexing** — codehash-based vault discovery with an on-chain registry
- **Factory Deployment** — deterministic bytecode for canonical contracts
- **REST API** — public indexer API for vault discovery and Merkle-proof retrieval

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
├── src/index.ts             # Indexer: on-chain event polling + REST API
├── data/indexer.db          # SQLite database for vault storage
└── API endpoints:
    ├── /health             # System health check
    ├── /vaults/active      # Active vault discovery
    ├── /stats              # Network statistics
    └── /vaults/:address    # Individual vault details
```

The indexer discovers canonical vaults by polling the on-chain `IndexerRegistry`
for `VaultIndexed` events (every ~30s). Experimental, opt-in libp2p P2P gossip is
also present in the codebase but is not required for operation.

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
git clone https://github.com/abdulsaheel/obscura.git
cd obscura

# Install dependencies (root + circuits + frontend workspaces)
npm install

# Install indexer dependencies (standalone subproject)
cd indexer && npm install && cd ..
```

### Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy the full canonical stack (in another terminal)
# Deploys Verifier + PoseidonT3 + ObscuraFactory + a canonical PrivateVault
# + IndexerRegistry, indexes the vault, and writes deployments/localhost.json
npx hardhat run scripts/deploy.js --network localhost

# Build and start indexer
cd indexer
npm run build
npm start

# Check indexer health
curl http://localhost:3001/health
```

### Sepolia Testnet

```bash
# Deploy the full canonical stack to Sepolia (writes deployments/sepolia.json)
npx hardhat run scripts/deploy.js --network sepolia

# Start indexer with Sepolia config (see indexer/.env.example)
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

<a name="deployment"></a>
### Deployment

`scripts/deploy.js` is the single canonical deployment script. It deploys
`Groth16Verifier` + `PoseidonT3` + `ObscuraFactory` + a canonical `PrivateVault`
+ `IndexerRegistry`, derives the vault's runtime codehash, pins the registry to
it, indexes the vault, and writes the result to `deployments/<network>.json`.

```bash
npx hardhat run scripts/deploy.js --network sepolia    # or --network localhost
```

After deploying, the addresses and canonical codehash are read from
`deployments/<network>.json` and wired into the indexer/frontend env files
(see the script's printed "Next steps").

> ⚠️ **STALE — redeploy pending.** The contracts and circuit were rewritten
> (new Verifier, new constraint system). Any previously published Sepolia
> addresses and canonical codehash are **no longer valid** and have been
> removed from this README. Redeploy with the command above and consult the
> generated `deployments/sepolia.json` for the current addresses.

---

## Development Progress

### ✅ Completed (Beta)

- [x] Smart contract architecture (MIT-licensed)
- [x] ZK circuit implementation (Circom / Groth16)
- [x] Trusted setup (PPOT #0080 + phase-2 contribution + beacon)
- [x] Single canonical deployment script (`scripts/deploy.js`)
- [x] Factory-based deterministic deployment
- [x] Codehash-based indexing system
- [x] Distributed indexer with on-chain event polling
- [x] REST API for vault discovery + Merkle-proof retrieval
- [x] On-chain registry with codehash verification
- [x] Contract + proof test suite (Hardhat)
- [x] Gas optimization for contracts

### 🚧 In Progress

- [ ] Redeploy to Sepolia after the contract/circuit rewrite
- [ ] Relayer system for gas abstraction
- [ ] Multi-amount deposit support
- [ ] Security audit preparation
- [ ] Experimental P2P gossip hardening (opt-in)

### 📋 Next Steps

- Publish fresh Sepolia addresses in `deployments/sepolia.json`
- Expand the test suite
- Performance optimizations
- Documentation completion

---

## Technical Specifications

### Circuit Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Merkle Tree Depth** | 20 levels | Supports 2^20 = 1,048,576 deposits |
| **Hash Function** | Poseidon (t=3) | ZK-friendly |
| **Proof System** | Groth16 | Constant-size proofs |
| **Constraints** | ~12,077 total (5,975 non-linear) | Circuit complexity |
| **Public Signals** | `[nullifierHash, root, recipient, protocolFee, amount]` | Order is consensus-critical |

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
| **Factory Deployment** | Implemented | Deterministic bytecode creation |
| **Codehash Verification** | Implemented | Only canonical contracts indexed |
| **On-Chain Registry** | Implemented | Registry pinned to the canonical codehash |
| **On-Chain Event Polling** | Implemented | Indexer polls `VaultIndexed` events (~30s) |
| **REST API** | Implemented | Vault discovery + Merkle-proof retrieval |
| **P2P Gossip** | Experimental | libp2p, opt-in, not required for operation |

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
├── deployments/                 # Per-network deployment manifests (tracked)
│   └── <network>.json          # Addresses + canonical codehash
├── scripts/                     # Deployment & operations
│   ├── deploy.js               # Canonical full-stack deployment
│   ├── deploy-factory.js       # Standalone factory deployment
│   ├── setup-canonical.js      # Canonical vault / codehash helpers
│   └── lib/                    # Shared merkle + proof helpers
├── hardhat.config.js           # Hardhat configuration
└── package.json                # Dependencies
```

### Building Circuits & Trusted Setup

The circuit and its proving/verifying keys are reproducible — the large
artifacts (`*.ptau`, `*.zkey`, `*.r1cs`, `*.sym`, `private-transfer_js/`) are
**gitignored** and rebuilt locally. Only the runtime artifacts under
`frontend/public/circuits/` (`private-transfer.wasm`, `private-transfer_final.zkey`,
`witness_calculator.js`) are tracked, because the frontend and CI proof tests
need them at runtime.

```bash
cd circuits

# One command: compile + fetch ptau + groth16 setup + contribute + beacon
#              + export Verifier.sol + copy runtime artifacts to frontend
npm run build-all
```

`build-all` runs the full setup pipeline:

1. **Compile** — `circom private-transfer.circom --r1cs --wasm --sym`
2. **Powers of Tau** — downloads the PSE Perpetual Powers of Tau contribution
   **#0080**, degree 14 (`ppot_0080_14.ptau`), a community ceremony with
   thousands of independent participants
3. **Phase-2 setup** — `groth16 setup` against the circuit's R1CS
4. **Phase-2 contribution** — one fresh Obscura contribution with random entropy
5. **Beacon** — finalizes the proving key (`private-transfer_final.zkey`) with a
   public verifiable-delay beacon
6. **Export verifier** — regenerates `contracts/Verifier.sol`
7. **Copy artifacts** — copies the wasm + final zkey + witness calculator into
   `frontend/public/circuits/`

Verify the final key against the ptau + R1CS at any time:

```bash
npm run verify-setup
```

---

## Security Notes

⚠️ **Beta Software** - This project is in beta and has not been audited. Use only for testing purposes.

### Trusted Setup

The Groth16 proving key is derived from the PSE **Perpetual Powers of Tau**
ceremony (contribution **#0080**, degree 14), followed by one Obscura phase-2
contribution and a public beacon finalization. The phase-1 powers come from a
large multi-party ceremony, so a single honest participant anywhere in that
chain (including PSE's many contributors) is sufficient for soundness. The
phase-2 transcript can be re-verified with `npm run verify-setup` in `circuits/`.

### Canonical Contract Security

- Only vaults deployed through `ObscuraFactory` have canonical bytecode
- Codehash verification prevents modified contracts from being indexed
- Factory enforces deterministic deployment for consistent indexing

---

## Contributing

This is an active development project. Contributions and feedback welcome!

---

## License

Licensed under the [MIT License](./LICENSE). Copyright (c) 2026 Abdul Saheel.

---

## Acknowledgments

- Tornado Cash for pioneering privacy on Ethereum
- Iden3 for Circom and circomlibjs
- PSE for the Perpetual Powers of Tau ceremony
- ZCash for ZK-SNARK research
- Ethereum Foundation for privacy research

---

**Developer:** Abdul Saheel
**Status:** Beta — not audited. Sepolia addresses pending redeploy (see [Deployment](#deployment)).
**Repository:** https://github.com/abdulsaheel/obscura
