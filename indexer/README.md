# Obscura Hydra Protocol Indexer

**Distributed P2P Vault Discovery Network**

The indexer is the backbone of the Hydra Protocol, enabling censorship-resistant vault discovery through a decentralized peer-to-peer network. It maintains a distributed database of verified vault contracts and serves discovery requests to users and applications.

## Features

- 🔗 **P2P Networking**: Uses libp2p for decentralized communication
- 📡 **Event Monitoring**: Listens for vault registrations on Ethereum
- ✅ **Code Verification**: Ensures vaults match canonical implementation
- 📊 **Statistics Tracking**: Monitors vault activity and liquidity
- 🌐 **REST API**: Provides vault discovery for users
- 🗄️ **Local Database**: SQLite-based vault storage
- 🔄 **Gossip Protocol**: Broadcasts new vaults across the network

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Indexer Node  │    │   Indexer Node  │    │   Indexer Node  │
│                 │    │                 │    │                 │
│  ┌────────────┐ │    │  ┌────────────┐ │    │  ┌────────────┐ │
│  │ P2P Gossip │◄┼────┼─►│ P2P Gossip │◄┼────┼─►│ P2P Gossip │ │
│  └────────────┘ │    │  └────────────┘ │    │  └────────────┘ │
│                 │    │                 │    │                 │
│  ┌────────────┐ │    │  ┌────────────┐ │    │  ┌────────────┐ │
│  │ Ethereum   │◄┼────┼─►│ Ethereum   │◄┼────┼─►│ Ethereum   │ │
│  │ Listener   │ │    │  │ Listener   │ │    │  │ Listener   │ │
│  └────────────┘ │    │  └────────────┘ │    │  └────────────┘ │
│                 │    │                 │    │                 │
│  ┌────────────┐ │    │  ┌────────────┐ │    │  ┌────────────┐ │
│  │ REST API   │ │    │  │ REST API   │ │    │  │ REST API   │ │
│  └────────────┘ │    │  └────────────┘ │    │  └────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    User Applications   │
                    │                         │
                    │  Wallets, UIs, dApps   │
                    └─────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Access to Ethereum RPC (Sepolia for testing)

### Installation

```bash
# From project root
npm install

# Or install indexer specifically
cd indexer && npm install
```

### Configuration

Create a `.env` file in the indexer directory:

```env
# Server Configuration
PORT=3001
P2P_PORT=0

# Ethereum Configuration
ETHEREUM_RPC=https://1rpc.io/sepolia
INDEXER_REGISTRY_ADDRESS=0x123...  # Deployed IndexerRegistry address
CANONICAL_CODEHASH=0xabc...       # Canonical vault codehash

# Optional
LOG_LEVEL=info
ENABLE_TOR=false
```

### Running

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
```http
GET /health
```
Returns indexer health status and connectivity information.

### Active Vaults
```http
GET /vaults/active?limit=100
```
Returns list of verified, active vaults sorted by recent activity.

**Response:**
```json
{
  "vaults": [
    {
      "address": "0x123...",
      "codehash": "0xabc...",
      "indexedAt": 1699123456,
      "lastSeen": 1699123456,
      "totalDeposits": 45,
      "totalWithdrawals": 40,
      "liquidityWei": "1000000000000000000",
      "verified": true
    }
  ],
  "count": 1,
  "timestamp": 1699123456
}
```

### Vault Details
```http
GET /vaults/0x123...
```
Returns detailed information about a specific vault.

### Network Statistics
```http
GET /stats
```
Returns current and historical network statistics.

## P2P Protocol

### Topics

- `obscura-vaults`: Vault discovery and announcements

### Message Types

#### NEW_VAULT
```json
{
  "type": "NEW_VAULT",
  "vault": "0x123...",
  "timestamp": 1699123456,
  "codeHash": "0xabc..."
}
```

## Database Schema

### vaults table
```sql
CREATE TABLE vaults (
  address TEXT PRIMARY KEY,
  codehash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  total_deposits INTEGER DEFAULT 0,
  total_withdrawals INTEGER DEFAULT 0,
  liquidity_wei INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  verified BOOLEAN DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### peers table
```sql
CREATE TABLE peers (
  peer_id TEXT PRIMARY KEY,
  multiaddrs TEXT,
  last_seen INTEGER NOT NULL,
  reputation INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

## Security Considerations

### Code Verification
- Only vaults with matching canonical codehash are indexed
- Cryptographic guarantee of safety and functionality

### P2P Network
- Gossip protocol ensures message propagation
- No central authority for vault validation
- Sybil resistance through economic costs

### Privacy
- No user data stored (only vault metadata)
- Tor support for anonymous operation
- Decentralized architecture prevents single points of failure

## Development

### Project Structure

```
indexer/
├── src/
│   └── index.js          # Main application
├── test/
│   └── index.test.js     # Unit tests
├── package.json
├── README.md
└── .env.example
```

### Testing

```bash
npm test
```

### Logging

Logs are written to `data/indexer.log` with configurable levels:
- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3001

CMD ["npm", "start"]
```

### Systemd Service

```ini
[Unit]
Description=Obscura Indexer
After=network.target

[Service]
Type=simple
User=obscura
WorkingDirectory=/opt/obscura/indexer
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- **libp2p**: For the P2P networking infrastructure
- **IPFS/Filecoin**: For inspiring the gossip protocol design
- **Ethereum Foundation**: For the underlying blockchain infrastructure

---

**"You can't ban them all." - The Hydra Protocol**