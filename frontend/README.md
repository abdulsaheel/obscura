# Obscura Frontend

A monochromatic web interface for the Obscura privacy mixer on Sepolia testnet.

## Features

- 🔐 **Privacy-Preserving Deposits** - Deposit ETH with zero-knowledge commitments
- 💰 **Anonymous Withdrawals** - Withdraw to different addresses using secrets
- 🏦 **Vault Selection** - Choose from available privacy vaults
- 📝 **Note Management** - Store and manage your deposit secrets locally
- 🌙 **Monochromatic Design** - Clean dark theme interface

## Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start the indexer** (in a separate terminal):
   ```bash
   cd indexer
   npm install
   npm run build
   npm start
   ```

3. **Start the frontend:**
   ```bash
   npm run dev
   ```

4. **Open** `http://localhost:5173` in your browser

## Usage

### Connecting to Sepolia
1. Click "Connect Wallet"
2. MetaMask will automatically switch to Sepolia testnet
3. If Sepolia is not added to MetaMask, it will be added automatically

### Making a Deposit
1. Select a vault from the dropdown
2. Enter the amount of ETH to deposit (minimum 0.001)
3. Click "Deposit"
4. **Save the secret that appears** - you'll need it to withdraw

### Making a Withdrawal
1. Select the vault you deposited to
2. Enter your secret, nullifier, amount, and recipient address
3. Click "Withdraw" (ZK proof generation required for full functionality)

## Architecture

- **React + TypeScript** - Type-safe frontend framework
- **Ethers.js** - Ethereum blockchain interactions
- **Axios** - API calls to the indexer
- **Local Storage** - Client-side note management
- **Monochromatic CSS** - Custom dark theme

## Security Notes

⚠️ **Testnet Only** - This is for Sepolia testnet testing only

⚠️ **Save Your Secrets** - Always backup your deposit secrets before closing the browser

⚠️ **Local Storage** - Notes are stored locally and will be lost if you clear browser data

## API Integration

The frontend connects to:
- **Indexer API**: `http://localhost:3001` (vault discovery and stats)
- **Sepolia Contracts**: Live Obscura vault contracts

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```
