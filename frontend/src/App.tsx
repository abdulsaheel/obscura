import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import axios from 'axios'
import { generateWithdrawalProof, simplePoseidon } from './proofUtils'
import { generateRandomBytes, formatAddress, formatEther } from './utils'
import { IncrementalMerkleTree, TREE_LEVELS } from './merkle'
import './App.css'

interface Vault {
  address: string
  codehash: string
  indexedAt: number
  lastSeen: number
  totalDeposits: number
  totalWithdrawals: number
  liquidityWei: string
  verified: boolean
}

interface Note {
  secret?: string
  nullifier: string
  amount: string
  commitment: string
  depositor: string
  timestamp: number
  vaultAddress: string
  leafIndex?: number // Add leafIndex to track Merkle tree position
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  duration?: number
}

function App() {
  console.log('🚀 App component STARTED')

  const [account, setAccount] = useState<string>('')
  const [vaults, setVaults] = useState<Vault[]>([])
  const [selectedVault, setSelectedVault] = useState<string>('')
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [toasts, setToasts] = useState<Toast[]>([])

  console.log('📊 App state initialized:', {
    account,
    selectedVault,
    activeTab,
    loading,
    vaultsCount: vaults.length
  })

  // Deposit form state
  const [depositAmount, setDepositAmount] = useState('0.001')
  const [depositSecret, setDepositSecret] = useState('')
  const [depositNullifier, setDepositNullifier] = useState('')

  // Withdraw form state
  const [withdrawSecret, setWithdrawSecret] = useState('')
  const [withdrawNullifier, setWithdrawNullifier] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')

  const INDEXER_URL = import.meta.env.VITE_INDEXER_URL || 'http://localhost:3001'

  // Toast notification functions
  const showToast = (type: 'success' | 'error' | 'info', message: string, duration = 5000) => {
    const id = Date.now().toString()
    const toast: Toast = { id, type, message, duration }
    setToasts(prev => [...prev, toast])
    
    // Auto remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  console.log('🔄 useEffect about to trigger')
  useEffect(() => {
    console.log('🔄 useEffect triggered - calling loadVaults and loadNotes')
    loadVaults()
    loadNotes()
  }, [])

  console.log('📋 Functions defined, about to return JSX')

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        // Request Sepolia testnet
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // Sepolia chainId
        })
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        setAccount(accounts[0])
      } catch (error: any) {
        if (error.code === 4902) {
          // Add Sepolia network if not present
          try {
            await window.ethereum!.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: {
                  name: 'SepoliaETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://1rpc.io/sepolia'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }]
            })
            const accounts = await window.ethereum!.request({ method: 'eth_requestAccounts' })
            setAccount(accounts[0])
          } catch (addError) {
            console.error('Failed to add Sepolia network:', addError)
          }
        } else {
          console.error('Failed to connect wallet:', error)
        }
      }
    } else {
      showToast('error', 'Please install MetaMask!')
    }
  }

  const getContractBalance = async (vaultAddress: string): Promise<string> => {
    if (!window.ethereum) return '0'

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const vault = new ethers.Contract(
        vaultAddress,
        ['function getBalance() view returns (uint256)'],
        provider
      )
      const balance = await vault.getBalance()
      return balance.toString()
    } catch (error) {
      console.error('Failed to get contract balance:', error)
      return '0'
    }
  }

  const loadVaults = async () => {
    console.log('🏦 loadVaults function called')
    try {
      console.log('📡 Making request to:', `${INDEXER_URL}/vaults/active`)
      const response = await axios.get(`${INDEXER_URL}/vaults/active`)
      console.log('✅ Response received:', response.data)

      const vaultsWithBalance = await Promise.all(
        response.data.vaults.map(async (vault: Vault) => {
          console.log('💰 Getting balance for vault:', vault.address)
          const balance = await getContractBalance(vault.address)
          return { ...vault, liquidityWei: balance }
        })
      )
      console.log('📊 Setting vaults:', vaultsWithBalance.length)
      setVaults(vaultsWithBalance)
    } catch (error) {
      console.error('❌ Failed to load vaults:', error)
      // Fallback to indexer data if direct contract call fails
      try {
        console.log('🔄 Trying fallback...')
        const response = await axios.get(`${INDEXER_URL}/vaults/active`)
        setVaults(response.data.vaults)
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError)
      }
    }
  }

  const loadNotes = () => {
    console.log('📝 loadNotes function called')
    const stored = localStorage.getItem('obscura_notes')
    if (stored) {
      const parsed = JSON.parse(stored)
      console.log('📚 Loaded notes from localStorage:', parsed.length)
      setNotes(parsed)
    } else {
      console.log('📭 No notes in localStorage')
    }
  }

  console.log('🎨 About to render JSX')

  const saveNote = (note: Note) => {
    const updated = [...notes, note]
    setNotes(updated)
    localStorage.setItem('obscura_notes', JSON.stringify(updated))
  }

  const generateSecrets = () => {
    const secret = generateRandomBytes(31)
    const nullifier = generateRandomBytes(31)
    return { secret, nullifier }
  }

  const deposit = async () => {
    if (!account || !selectedVault) {
      showToast('error', 'Please connect wallet and select a vault')
      return
    }

    if (!window.ethereum) {
      showToast('error', 'Please install MetaMask!')
      return
    }

    setLoading(true)
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any)
      const signer = await provider.getSigner()

      const { secret, nullifier } = generateSecrets()
      const amount = ethers.parseEther(depositAmount)

      // Generate commitment using proper Poseidon hash (consistent with circuit)
      const commitmentUint256 = await simplePoseidon([
        BigInt('0x' + secret.slice(2)), // Remove 0x prefix
        BigInt('0x' + nullifier.slice(2)),
        amount
      ])

      const vault = new ethers.Contract(
        selectedVault,
        ['function deposit(uint256 commitment) payable'],
        signer
      )

      const tx = await vault.deposit(commitmentUint256, {
        value: amount
      })

      // Wait for transaction and get the receipt to find the Deposit event
      const receipt = await tx.wait()
      
      // Find the Deposit event to get the leafIndex
      let leafIndex = 0
      for (const log of receipt.logs) {
        try {
          const parsedLog = vault.interface.parseLog(log)
          if (parsedLog?.name === 'Deposit') {
            leafIndex = Number(parsedLog.args.leafIndex)
            break
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Save note with leafIndex for Merkle proof generation
      const note: Note = {
        secret,
        nullifier,
        amount: amount.toString(),
        commitment: commitmentUint256.toString(),
        depositor: account,
        timestamp: Date.now(),
        vaultAddress: selectedVault,
        leafIndex
      }
      saveNote(note)

      showToast('success', 'Deposit successful! Save these values to withdraw later.')
      setDepositSecret(secret)
      setDepositNullifier(nullifier)

    } catch (error) {
      console.error('Deposit failed:', error)
      showToast('error', 'Deposit failed: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const withdraw = async () => {
    console.log('🔥 WITHDRAW FUNCTION CALLED!')
    if (!account || !selectedVault) {
      showToast('error', 'Please connect wallet and select a vault')
      return
    }

    if (!window.ethereum) {
      showToast('error', 'Please install MetaMask!')
      return
    }

    // Check if we have the required fields
    if (!withdrawSecret || !withdrawNullifier || !withdrawAmount || !withdrawRecipient) {
      showToast('error', 'Please fill in all withdrawal fields')
      return
    }

    // Validate recipient address
    if (!ethers.isAddress(withdrawRecipient)) {
      showToast('error', 'Please enter a valid Ethereum address for the recipient')
      return
    }

    setLoading(true)
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Create vault contract instance
      const vaultContract = new ethers.Contract(
        selectedVault,
        [
          "event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 amount, uint256 timestamp, address indexed depositor)",
          "function withdraw(uint256[2] memory _pA, uint256[2][2] memory _pB, uint256[2] memory _pC, uint256[5] memory _pubSignals) external",
          "function getLastRoot() external view returns (uint256)",
          "function getMerkleProof(uint256 leafIndex) external view returns (uint256[] memory, uint256[] memory)",
          "function getStatistics() view returns (uint256, uint256, uint256, uint256, uint256)",
          "function getZeroValue(uint256) view returns (uint256)"
        ],
        signer
      )

      // Get current Merkle root from contract
      const merkleRoot = await vaultContract.getLastRoot()
      console.log('Current Merkle root:', merkleRoot.toString())

      // Find the note that matches the withdrawal parameters
      const matchingNote = notes.find(note => 
        note.nullifier === withdrawNullifier && 
        note.vaultAddress === selectedVault &&
        note.amount === ethers.parseEther(withdrawAmount).toString()
      )

      if (!matchingNote) {
        // Provide helpful error message
        const vaultNotes = notes.filter(note => note.vaultAddress === selectedVault)
        console.log('Available notes for this vault:', vaultNotes)
        throw new Error(`Could not find matching deposit note. You have ${vaultNotes.length} deposits in this vault. Make sure you entered the exact nullifier and amount from your deposit.`)
      }

      // Check if the secret matches (if we have it stored)
      if (matchingNote.secret && matchingNote.secret !== withdrawSecret) {
        throw new Error('Secret does not match the stored deposit note. Please use the correct secret from your deposit.')
      }

      // The leaf index is required to build a Merkle proof for this commitment.
      if (matchingNote.leafIndex === undefined || matchingNote.leafIndex === null) {
        throw new Error('Deposit note is missing its leaf index. Cannot build a Merkle proof.')
      }
      const leafIndex = matchingNote.leafIndex
      const onChainRoot = merkleRoot.toString()

      // Build the Merkle proof. Prefer the indexer endpoint; fall back to a full
      // client-side reconstruction from the complete Deposit-event history.
      console.log('🔍 Building Merkle proof for leaf index:', leafIndex)
      let pathElements: string[] | null = null
      let pathIndices: number[] | null = null

      // (a) Try the indexer's merkle-proof endpoint first.
      try {
        const res = await axios.get<{
          leafIndex: number
          pathElements: string[]
          pathIndices: number[]
          root: string
        }>(`${INDEXER_URL}/vaults/${selectedVault}/merkle-proof`, {
          params: { leafIndex }
        })
        const data = res.data
        if (data && Array.isArray(data.pathElements) && Array.isArray(data.pathIndices) && data.root) {
          if (data.root.toString() !== onChainRoot) {
            console.warn('⚠️ Indexer root does not match on-chain getLastRoot(); ignoring indexer response', {
              indexerRoot: data.root.toString(),
              onChainRoot
            })
          } else {
            console.log('✅ Using indexer-provided Merkle path')
            pathElements = data.pathElements.map((p) => BigInt(p).toString())
            pathIndices = data.pathIndices.map((i) => Number(i))
          }
        }
      } catch (idxErr) {
        console.warn('Indexer merkle-proof unavailable, falling back to client reconstruction:', idxErr)
      }

      // (b) Fallback: reconstruct the tree from the FULL Deposit-event history.
      if (pathElements === null || pathIndices === null) {
        console.log('🔧 Reconstructing Merkle tree from full Deposit-event history')

        // Use a read-only public RPC for log queries. Wallet providers often reject
        // wide eth_getLogs ranges; a dedicated JSON-RPC handles full history better.
        const fallbackRpc = import.meta.env.VITE_RPC_URL || 'https://1rpc.io/sepolia'
        let readProvider: ethers.JsonRpcProvider
        try {
          readProvider = new ethers.JsonRpcProvider(fallbackRpc)
        } catch (e) {
          console.warn('Could not construct JsonRpcProvider, using wallet provider', e)
          readProvider = provider as unknown as ethers.JsonRpcProvider
        }

        const readOnlyVault = new ethers.Contract(
          selectedVault,
          vaultContract.interface.fragments,
          readProvider
        )
        const depositFilter = readOnlyVault.filters.Deposit()

        const latestBlock = await readProvider.getBlockNumber()
        let chunkSize = 50000 // stay under common eth_getLogs range limits
        const depositEvents: ethers.EventLog[] = []

        // Scan the FULL history (no recent-window cap), chunked with adaptive backoff.
        let from = 0
        while (from <= latestBlock) {
          const to = Math.min(from + chunkSize - 1, latestBlock)
          try {
            const evs = await readOnlyVault.queryFilter(depositFilter, from, to)
            for (const ev of evs) {
              if ('args' in ev) depositEvents.push(ev as ethers.EventLog)
            }
            from = to + 1
          } catch (err) {
            if (chunkSize <= 1000) {
              throw err
            }
            chunkSize = Math.max(1000, Math.floor(chunkSize / 2))
            console.warn('Reducing eth_getLogs chunk size to', chunkSize, 'and retrying from block', from)
          }
        }

        // Order deposits by their on-chain leaf index and rebuild the tree.
        const sorted = depositEvents
          .map((ev) => ({
            idx: Number(ev.args.leafIndex),
            commitment: BigInt(ev.args.commitment.toString())
          }))
          .sort((a, b) => a.idx - b.idx)

        const tree = new IncrementalMerkleTree(TREE_LEVELS)
        for (const { idx, commitment } of sorted) {
          if (idx !== tree.nextIndex) {
            throw new Error(
              `Deposit events are not contiguous (expected leaf index ${tree.nextIndex}, got ${idx}). Cannot reconstruct the tree reliably.`
            )
          }
          tree.insert(commitment)
        }

        if (leafIndex >= tree.nextIndex) {
          throw new Error(
            `Leaf index ${leafIndex} is beyond the reconstructed tree size (${tree.nextIndex}). The deposit may not be confirmed yet.`
          )
        }

        const reconstructedRoot = tree.root()
        console.log('📊 Reconstructed root:', reconstructedRoot.toString())
        console.log('📊 On-chain root:', onChainRoot)
        if (reconstructedRoot.toString() !== onChainRoot) {
          throw new Error(
            `Merkle root mismatch! Reconstructed: ${reconstructedRoot.toString()}, on-chain: ${onChainRoot}. The client-side tree does not match the contract.`
          )
        }

        const builtProof = tree.proof(leafIndex)
        pathElements = builtProof.pathElements.map((e) => e.toString())
        pathIndices = builtProof.pathIndices
      }

      // Sanity-check the proof against the on-chain root before running snarkjs.
      // Recompute the root from the commitment + supplied path using the canonical
      // poseidon2 ordering, and require it to equal getLastRoot().
      {
        const leafValue = BigInt(matchingNote.commitment)
        let computed = leafValue
        for (let lvl = 0; lvl < TREE_LEVELS; lvl++) {
          const sibling = BigInt(pathElements[lvl])
          computed =
            pathIndices[lvl] === 0
              ? await simplePoseidon([computed, sibling])
              : await simplePoseidon([sibling, computed])
        }
        console.log('🧾 Locally recomputed root:', computed.toString())
        console.log('🔗 On-chain root:', onChainRoot)
        if (computed.toString() !== onChainRoot) {
          throw new Error(
            `Local Merkle root mismatch — aborting before running snarkjs. Recomputed: ${computed.toString()}, on-chain: ${onChainRoot}.`
          )
        }
      }
      console.log('✅ Merkle proof verified against on-chain root')

      // Calculate protocol fee (0.5% for demo) - in wei
      const amountWei = ethers.parseEther(withdrawAmount)
      const protocolFeeWei = (amountWei * BigInt(5)) / BigInt(1000) // 0.5%

      console.log('🔐 Starting REAL ZK-SNARK withdrawal process...')
      console.log('📊 Withdrawal parameters:', {
        secret: withdrawSecret,
        nullifier: withdrawNullifier,
        amount: withdrawAmount,
        recipient: withdrawRecipient,
        protocolFee: ethers.formatEther(protocolFeeWei)
      })

      // Validate all inputs before proof generation
      console.log('🔍 Validating inputs...')
      try {
        const secretBigInt = BigInt(withdrawSecret)
        const nullifierBigInt = BigInt(withdrawNullifier)
        const amountBigInt = ethers.parseEther(withdrawAmount)
        const recipientBigInt = BigInt(withdrawRecipient)
        const protocolFeeBigInt = protocolFeeWei
        const rootBigInt = BigInt(merkleRoot.toString())

        console.log('✅ Input validation passed:', {
          secretBigInt: secretBigInt.toString().substring(0, 20) + '...',
          nullifierBigInt: nullifierBigInt.toString().substring(0, 20) + '...',
          amountBigInt: amountBigInt.toString(),
          recipientBigInt: recipientBigInt.toString(),
          protocolFeeBigInt: protocolFeeBigInt.toString(),
          rootBigInt: rootBigInt.toString().substring(0, 20) + '...'
        })

        // Check recipient is valid Ethereum address
        if (recipientBigInt >= BigInt(2) ** BigInt(160)) {
          throw new Error('Recipient address is too large (must be < 2^160)')
        }

        // Convert recipient to decimal string for circuit
        const recipientDecimal = recipientBigInt.toString()
        console.log('📧 Recipient address (decimal):', recipientDecimal)

      } catch (validationError) {
        console.error('❌ Input validation failed:', validationError)
        throw new Error('Input validation failed: ' + (validationError as Error).message)
      }

      // Generate REAL ZK-SNARK proof
      const { proof, publicSignals } = await generateWithdrawalProof(
        withdrawSecret,
        withdrawNullifier,
        withdrawAmount,
        withdrawRecipient,
        ethers.formatEther(protocolFeeWei),
        onChainRoot,
        pathElements,
        pathIndices
      )

      console.log('✅ ZK proof generated successfully!')
      console.log('🔒 Proof components:', proof)
      console.log('📋 Public signals:', publicSignals)
      console.log('📏 Array lengths check:')
      console.log('   pi_a length:', proof.pi_a.length, '(expected: 2)')
      console.log('   pi_b length:', proof.pi_b.length, '(expected: 2)')
      console.log('   pi_b[0] length:', proof.pi_b[0]?.length, '(expected: 2)')
      console.log('   pi_b[1] length:', proof.pi_b[1]?.length, '(expected: 2)')
      console.log('   pi_c length:', proof.pi_c.length, '(expected: 2)')
      console.log('   publicSignals length:', publicSignals.length, '(expected: 5)')

      // Format proof for Solidity (match test script format)
      const proofA = [proof.pi_a[0], proof.pi_a[1]]
      const proofB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]]
      const proofC = [proof.pi_c[0], proof.pi_c[1]]

      console.log('📝 Formatted proof for contract:')
      console.log('   proofA:', proofA)
      console.log('   proofB:', proofB)
      console.log('   proofC:', proofC)
      console.log('   publicSignals:', publicSignals)

      // Validate formatted proof lengths
      if (proofA.length !== 2 || proofB.length !== 2 || proofB[0].length !== 2 || proofB[1].length !== 2 || proofC.length !== 2 || publicSignals.length !== 5) {
        throw new Error(`Invalid formatted proof structure. proofA: ${proofA.length}, proofB: ${proofB.length}x${proofB[0]?.length}, proofC: ${proofC.length}, publicSignals: ${publicSignals.length}`)
      }

      // Call the real withdraw function with ZK proof
      const tx = await vaultContract.withdraw(
        proofA,
        proofB,
        proofC,
        publicSignals
      )

      console.log('Withdrawal transaction sent:', tx.hash)
      await tx.wait()

      showToast('success', `✅ REAL ZK-SNARK withdrawal successful!\n\nTransaction: ${tx.hash}\n\nThis withdrawal was verified using actual ZK-SNARK cryptography!`)

      // Clear form
      setWithdrawSecret('')
      setWithdrawNullifier('')
      setWithdrawAmount('')
      setWithdrawRecipient('')

      // Refresh vault data
      await loadVaults()

    } catch (error) {
      console.error('REAL ZK withdrawal failed:', error)
      showToast('error', 'REAL ZK withdrawal failed: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  console.log('🎨 About to return JSX from App component')

  return (
    <div className="app">
      <header className="header">
        <h1>🔐 Obscura</h1>
        <p>Privacy-Preserving Ethereum Transfers</p>
        {!account ? (
          <button className="connect-btn" onClick={connectWallet}>
            Connect Wallet
          </button>
        ) : (
          <div className="account">
            Connected: {formatAddress(account)}
          </div>
        )}
      </header>

      <div className="container">
        <div className="tabs">
          <button
            className={activeTab === 'deposit' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('deposit')}
          >
            Deposit
          </button>
          <button
            className={activeTab === 'withdraw' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('withdraw')}
          >
            Withdraw
          </button>
        </div>

        <div className="vault-selector">
          <label>Select Vault:</label>
          <select
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value)}
            className="vault-select"
          >
            <option value="">Choose a vault...</option>
            {vaults.map((vault) => (
              <option key={vault.address} value={vault.address}>
                {formatAddress(vault.address)} - {formatEther(vault.liquidityWei)} ETH
              </option>
            ))}
          </select>
        </div>

        {activeTab === 'deposit' && (
          <div className="form">
            <h2>Deposit ETH</h2>
            <div className="form-group">
              <label>Amount (ETH):</label>
              <input
                type="number"
                step="0.001"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.001"
              />
            </div>
            <button
              className="action-btn"
              onClick={deposit}
              disabled={loading || !account || !selectedVault}
            >
              {loading ? 'Depositing...' : 'Deposit'}
            </button>
            {depositSecret && depositNullifier && (
              <div className="secret-display">
                <p><strong>Save these values to withdraw:</strong></p>
                <div className="secret-values">
                  <div>
                    <strong>Secret:</strong>
                    <code>{depositSecret}</code>
                  </div>
                  <div>
                    <strong>Nullifier:</strong>
                    <code>{depositNullifier}</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'withdraw' && (
          <div className="form">
            <h2>Withdraw ETH</h2>
            <div className="form-group">
              <label>Secret:</label>
              <input
                type="text"
                value={withdrawSecret}
                onChange={(e) => setWithdrawSecret(e.target.value)}
                placeholder="Your deposit secret"
              />
            </div>
            <div className="form-group">
              <label>Nullifier:</label>
              <input
                type="text"
                value={withdrawNullifier}
                onChange={(e) => setWithdrawNullifier(e.target.value)}
                placeholder="Nullifier"
              />
            </div>
            <div className="form-group">
              <label>Amount:</label>
              <input
                type="text"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Amount to withdraw"
              />
            </div>
            <div className="form-group">
              <label>Recipient:</label>
              <input
                type="text"
                value={withdrawRecipient}
                onChange={(e) => setWithdrawRecipient(e.target.value)}
                placeholder="Recipient address"
              />
            </div>
            <button
              className="action-btn"
              onClick={() => {
                console.log('Button clicked!', { loading, account, selectedVault })
                withdraw()
              }}
              disabled={loading || !account || !selectedVault}
            >
              {loading ? 'Withdrawing...' : 'Withdraw'}
            </button>
          </div>
        )}

        <div className="notes-section">
          <h3>Your Notes ({notes.length})</h3>
          {notes.length === 0 ? (
            <p>No notes yet. Make a deposit to create one.</p>
          ) : (
            <div className="notes-list">
              {notes.map((note, index) => (
                <div key={index} className="note">
                  <p><strong>Vault:</strong> {formatAddress(note.vaultAddress)}</p>
                  <p><strong>Amount:</strong> {formatEther(note.amount)} ETH</p>
                  <p><strong>Nullifier:</strong> {note.nullifier.slice(0, 20)}...</p>
                  <p><strong>Time:</strong> {new Date(note.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
            <button 
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
