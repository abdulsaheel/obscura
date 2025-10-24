import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import axios from 'axios'
import { generateWithdrawalProof, simplePoseidon } from './proofUtils'
import { generateRandomBytes, formatAddress, formatEther } from './utils'
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

  const INDEXER_URL = 'http://localhost:3001' // Update this to your deployed indexer URL for production

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
            leafIndex = parsedLog.args.leafIndex.toNumber()
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

      // Update local per-vault leaves cache to speed up later client-side proofs
      try {
        const cacheKey = `vault_leaves_${selectedVault.toLowerCase()}`
        const raw = localStorage.getItem(cacheKey)
        const arr: (string | null)[] = raw ? JSON.parse(raw) : []
        // ensure array length
        if (arr.length <= leafIndex) {
          arr.length = leafIndex + 1
        }
        arr[leafIndex] = commitmentUint256.toString()
        localStorage.setItem(cacheKey, JSON.stringify(arr))
      } catch (e) {
        console.warn('Failed to update local leaves cache', e)
      }

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

      // Build Merkle proof for any deposit by reconstructing the tree from past Deposit events
      console.log('🔍 Building Merkle proof by reconstructing tree from events for leaf index:', matchingNote.leafIndex)
      const levels = 20
      const pathElements: string[] = []
      const pathIndices: number[] = []

      // Fetch nextIndex (number of leaves) from contract statistics
      const stats = await vaultContract.getStatistics()
      const nextIndex = Number(stats[3])

      console.log('📌 Vault nextIndex (leaf count):', nextIndex)

      // Query Deposit events from the vault contract to reconstruct leaves
      // Some RPC providers limit the block range for eth_getLogs. Fetch logs in chunks
      const depositFilter = vaultContract.filters.Deposit()

      // Determine a read-only provider for logs. Wallet providers (window.ethereum) often
      // don't support wide eth_getLogs ranges or may block; use a public JSON-RPC as fallback.
      const fallbackRpc = (window as any).REACT_APP_RPC_URL || 'https://1rpc.io/sepolia'
      let readProvider: any
      try {
        readProvider = new ethers.JsonRpcProvider(fallbackRpc)
      } catch (e) {
        // fallback to contract's provider if JsonRpcProvider can't be constructed
        readProvider = vaultContract.provider || (provider as any)
      }

      const latestBlock = await readProvider.getBlockNumber()
      let chunkSize = 80000 // keep below many providers' 100k limit; adapt on failures

      // Hackathon mode: limit logs to a small recent window for fast demos.
      // NOTE: This will only find deposits in the last ~100 blocks. For full-history
      // proofs you should use the indexer or increase this window.
      const startBlock = Math.max(0, latestBlock - 10000)

      const depositEvents: any[] = []

      let from = startBlock
      while (from <= latestBlock) {
        const to = Math.min(from + chunkSize - 1, latestBlock)
        try {
          // eslint-disable-next-line no-await-in-loop
          // query logs using a read-only contract connected to readProvider to avoid wallet/provider limitations
          const readOnlyVault = new ethers.Contract(selectedVault, vaultContract.interface.fragments, readProvider)
          const evs = await readOnlyVault.queryFilter(depositFilter, from, to)
          depositEvents.push(...evs)
          from = to + 1
        } catch (err) {
          console.warn('Failed to fetch logs for range', from, to, err)
          // If provider rejects large ranges, cut chunk size and retry
          if (chunkSize <= 100000) {
            throw err
          }
          chunkSize = Math.max(100000, Math.floor(chunkSize / 2))
          console.log('Reducing chunkSize to', chunkSize, 'and retrying range', from)
          // retry same `from` with smaller chunk
        }
      }

      // Initialize leaves with zero value for level 0
      const zeroValueLevel0 = BigInt(await vaultContract.getZeroValue(0))
      const leaves: bigint[] = new Array(Math.max(nextIndex, 1)).fill(zeroValueLevel0)

      // Overlay any cached leaves (deposits made by this client) to speed up
      try {
        const cacheKey = `vault_leaves_${selectedVault.toLowerCase()}`
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          const cached: string[] = JSON.parse(raw)
          for (let i = 0; i < cached.length && i < leaves.length; i++) {
            if (cached[i]) {
              try {
                leaves[i] = BigInt(cached[i])
              } catch (e) {
                // ignore parse errors
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to read local leaves cache', e)
      }

      // Overlay leaves from fetched deposit events (fill in missing slots)
      for (const ev of depositEvents) {
        try {
          const args: any = (ev as any).args
          const idx = Number(args.leafIndex)
          const commitment = BigInt(args.commitment.toString())
          if (idx >= 0 && idx < leaves.length) {
            leaves[idx] = commitment
          }
        } catch (e) {
          // ignore parsing errors
        }
      }

      // Quick check: how many leaves did we actually find? If very few, it's likely
      // our short block-window missed earlier deposits (hackathon mode). Try indexer
      // fallback if available before attempting the expensive proof generation.
      try {
        const foundLeaves = leaves.filter(l => l !== zeroValueLevel0).length
        console.log('🔎 Found leaves via events/local-cache:', foundLeaves, 'of', nextIndex)

        if (foundLeaves < nextIndex) {
          console.log('⚠️ Not all leaves found locally — attempting indexer fallback for merkle path')
          try {
            const res = await axios.get(`${INDEXER_URL}/vaults/${selectedVault}/merkle-proof`, { params: { leafIndex: matchingNote.leafIndex } })
            const data = res.data
            if (data && data.pathElements && data.pathIndices && data.root) {
              // validate server root matches on-chain root
              if (data.root !== merkleRoot.toString()) {
                console.warn('Indexer returned root mismatch; ignoring indexer response')
              } else {
                console.log('✅ Using indexer-provided merkle path')
                // Use server-provided path and skip client reconstruction
                // Normalize into expected arrays
                pathElements.length = 0
                pathIndices.length = 0
                for (const pe of data.pathElements) pathElements.push(pe.toString())
                for (const pi of data.pathIndices) pathIndices.push(Number(pi))

                // Skip to proof generation using server path
                console.log('📦 Proceeding to proof generation using indexer path')
                // Jump to proof generation by setting a flag
                ;(window as any).__USE_INDEXER_PATH = true
              }
            }
          } catch (idxErr) {
            console.warn('Indexer fallback failed:', idxErr)
          }
        }
      } catch (e) {
        console.warn('Error while checking found leaves:', e)
      }

      // Pre-fetch zero values for each tree level from contract
      const zeroValues: bigint[] = []
      for (let i = 0; i < levels; i++) {
        const z = BigInt(await vaultContract.getZeroValue(i))
        zeroValues.push(z)
      }

      // Reconstruct tree level-by-level and collect sibling elements for the requested leaf
      let currentLevel = leaves.slice()
      let indexAtLevel = matchingNote.leafIndex!

      for (let lvl = 0; lvl < levels; lvl++) {
        const isLeft = indexAtLevel % 2 === 0
        pathIndices.push(isLeft ? 0 : 1)

        const siblingIndex = isLeft ? indexAtLevel + 1 : indexAtLevel - 1
        let sibling: bigint

        if (siblingIndex >= 0 && siblingIndex < currentLevel.length) {
          sibling = currentLevel[siblingIndex]
        } else {
          sibling = zeroValues[lvl]
        }

        pathElements.push(sibling.toString())

        // Build next level
        const nextLevelSize = Math.ceil(currentLevel.length / 2)
        const nextLevel: bigint[] = new Array(nextLevelSize)
        for (let i = 0; i < nextLevelSize; i++) {
          const left = i * 2 < currentLevel.length ? currentLevel[i * 2] : zeroValues[lvl]
          const right = i * 2 + 1 < currentLevel.length ? currentLevel[i * 2 + 1] : zeroValues[lvl]
          // Hash pair using simplePoseidon
          // eslint-disable-next-line no-await-in-loop
          nextLevel[i] = await simplePoseidon([left, right])
        }

        currentLevel = nextLevel
        indexAtLevel = Math.floor(indexAtLevel / 2)
      }

      // The root is the only element in currentLevel after building all levels
      const computedRoot = currentLevel[0]
      console.log('✅ Merkle path built')
      console.log('📊 Computed root:', computedRoot.toString())
      console.log('📊 Contract root:', merkleRoot.toString())

      if (computedRoot.toString() !== merkleRoot.toString()) {
        throw new Error(`Merkle root mismatch! Computed: ${computedRoot.toString()}, Contract: ${merkleRoot.toString()}. This indicates the client-side tree reconstruction is not matching the contract`) 
      }

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
      // --- Pre-proof local verification ---
      try {
        // Determine the leaf value for this index
        let leafValue: bigint | null = null
        if (matchingNote.commitment) {
          try { leafValue = BigInt(matchingNote.commitment) } catch (e) { leafValue = null }
        }
        if (leafValue === null) {
          // fall back to reconstructed leaves array (from events/cache)
          try {
            const cachedLeaf = leaves[matchingNote.leafIndex!]
            if (cachedLeaf && cachedLeaf !== zeroValueLevel0) {
              leafValue = BigInt(cachedLeaf)
            }
          } catch (e) {
            // ignore
          }
        }

        if (leafValue === null) {
          throw new Error('Could not determine leaf value for the requested leaf index. Ensure the deposit note/commitment or events are available.')
        }

        // Ensure path arrays are the correct length; pad with contract zero values if needed
        if (pathElements.length < levels) {
          console.warn('pathElements shorter than TREE_LEVELS; padding with zero values')
          for (let i = pathElements.length; i < levels; i++) {
            pathElements.push(zeroValues[i].toString())
            pathIndices.push(0)
          }
        }

        // Convert to BigInt arrays
        const pathElemsBig: bigint[] = pathElements.map((p: any) => BigInt(p.toString()))
        const pathIdx: number[] = pathIndices.map((pi: any) => Number(pi))

        // Recompute root locally using the same Poseidon ordering as the contract
        let computed = leafValue
        let idxAtLevel = matchingNote.leafIndex!
        for (let lvl = 0; lvl < levels; lvl++) {
          const isLeft = pathIdx[lvl] === 0
          const sibling = lvl < pathElemsBig.length ? pathElemsBig[lvl] : zeroValues[lvl]
          if (isLeft) {
            computed = await simplePoseidon([computed, sibling])
          } else {
            computed = await simplePoseidon([sibling, computed])
          }
          idxAtLevel = Math.floor(idxAtLevel / 2)
        }

        console.log('🧾 Local recomputed root:', computed.toString())
        console.log('🔗 On-chain root:', merkleRoot.toString())

        if (computed.toString() !== merkleRoot.toString()) {
          // Enhanced diagnostics to help debug mismatch
          try {
            console.error('❌ Local root did not match on-chain root. Collecting diagnostics...')
            const diagnostics: any = {
              leaf: leafValue.toString(),
              leafIndex: matchingNote.leafIndex,
              nextIndex,
              foundLeavesCount: leaves.filter(l => l !== zeroValueLevel0).length,
              depositEventsSample: depositEvents.slice(0, 6).map((ev: any) => {
                try {
                  return { leafIndex: Number(ev.args.leafIndex), commitment: ev.args.commitment.toString() }
                } catch (e) {
                  return { raw: ev }
                }
              }),
              cachedLeaf: (() => {
                try { return leaves[matchingNote.leafIndex!]?.toString() } catch (e) { return null }
              })(),
              firstPathElements: pathElements.slice(0, 12),
              firstPathIndices: pathIndices.slice(0, 12),
              zeroValuesSample: zeroValues.slice(0, 12).map(z => z.toString())
            }

            console.group('Merkle mismatch diagnostics')
            console.log('Diagnostics object (copy this):', diagnostics)

            // Show per-level computation with sibling and ordering to find first divergence
            console.group('Per-level recomputation trace')
            let traceValue = BigInt(diagnostics.leaf)
            let traceIndex = Number(diagnostics.leafIndex)
            for (let lvl = 0; lvl < levels; lvl++) {
              const isLeft = (pathIdx[lvl] === 0)
              const sibling = lvl < pathElemsBig.length ? pathElemsBig[lvl] : zeroValues[lvl]
              const left = isLeft ? traceValue : sibling
              const right = isLeft ? sibling : traceValue
              // eslint-disable-next-line no-await-in-loop
              const hashed = await simplePoseidon([left, right])
              console.log(`lvl=${lvl} idx=${traceIndex} isLeft=${isLeft} left=${left.toString().slice(0,40)} right=${right.toString().slice(0,40)} -> hash=${hashed.toString().slice(0,60)}`)
              traceValue = hashed
              traceIndex = Math.floor(traceIndex / 2)
            }
            console.groupEnd()
            console.log('Final recomputed root (short):', computed.toString())
            console.log('On-chain root (short):', merkleRoot.toString())
            console.groupEnd()

            // Attach diagnostics to window for easy copy/paste
            try { (window as any).__MERKLE_DIAGNOSTICS = diagnostics } catch (e) { /* ignore */ }
          } catch (diagErr) {
            console.error('Failed to collect diagnostics:', diagErr)
          }

          throw new Error('Local Merkle root mismatch — aborting before running snarkjs. Check console for detailed diagnostics (window.__MERKLE_DIAGNOSTICS).')
        }
      } catch (preErr) {
        console.error('Pre-proof verification failed:', preErr)
        throw preErr
      }

      const { proof, publicSignals } = await generateWithdrawalProof(
        withdrawSecret,
        withdrawNullifier,
        withdrawAmount,
        withdrawRecipient,
        ethers.formatEther(protocolFeeWei),
        merkleRoot.toString(),
        pathElements.map((x: any) => x.toString()),
        pathIndices.map((x: any) => x.toString())
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
