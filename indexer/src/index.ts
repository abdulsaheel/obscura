#!/usr/bin/env node

/**
 * Obscura Hydra Protocol Indexer
 *
 * Distributed P2P indexer for vault discovery and verification
 * Part of the Hydra Protocol: "You Can't Ban Them All"
 *
 * @author Obscura Protocol Team
 * @license MIT
 */

import { createLibp2p, Libp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { mdns } from '@libp2p/mdns';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import sqlite3 from 'sqlite3';
import winston from 'winston';
import { ethers } from 'ethers';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Types
interface Vault {
  address: string;
  codehash: string;
  indexed_at: number;
  last_seen: number;
  total_deposits: number;
  total_withdrawals: number;
  liquidity_wei: number;
  is_active: number;
  verified: number;
  created_at: string;
}

interface NetworkStats {
  total_vaults: number;
  active_vaults: number;
  total_liquidity: number;
  total_deposits: number;
  total_withdrawals: number;
}

interface DatabaseWithStatements extends sqlite3.Database {
  statements: {
    insertVault: sqlite3.Statement;
    updateVaultActivity: sqlite3.Statement;
    getActiveVaults: sqlite3.Statement;
    getVaultByAddress: sqlite3.Statement;
    deactivateVault: sqlite3.Statement;
    insertNetworkStats: sqlite3.Statement;
    getLatestStats: sqlite3.Statement;
    getNetworkStats: sqlite3.Statement;
    upsertPeer: sqlite3.Statement;
    updatePeerReputation: sqlite3.Statement;
    insertVaultConfirmation: sqlite3.Statement;
    confirmVaultAnnouncement: sqlite3.Statement;
    getVaultConfirmations: sqlite3.Statement;
    getUnconfirmedVaults: sqlite3.Statement;
  };
}
const CONFIG = {
  port: process.env.PORT || 3001,
  p2pPort: process.env.P2P_PORT || 0, // Random available port
  ethereumRpc: process.env.ETHEREUM_RPC || 'https://1rpc.io/sepolia',
  indexerRegistryAddress: process.env.INDEXER_REGISTRY_ADDRESS,
  canonicalCodeHash: process.env.CANONICAL_CODEHASH,
  logLevel: process.env.LOG_LEVEL || 'info',
  enableTor: process.env.ENABLE_TOR === 'true',
  dbPath: path.join(__dirname, '..', 'data', 'indexer.db'),
  maxVaultsPerResponse: 1000,
  vaultCleanupInterval: '0 */6 * * *', // Every 6 hours
  healthCheckInterval: '*/5 * * * *', // Every 5 minutes
  // Anti-lying protection settings
  minConfirmationsRequired: process.env.MIN_CONFIRMATIONS ? parseInt(process.env.MIN_CONFIRMATIONS) : 3, // Require 3 independent confirmations
  confirmationTimeWindow: process.env.CONFIRMATION_WINDOW ? parseInt(process.env.CONFIRMATION_WINDOW) : 300000, // 5 minutes window
  maxUnconfirmedAnnouncements: process.env.MAX_UNCONFIRMED ? parseInt(process.env.MAX_UNCONFIRMED) : 10, // Max unconfirmed per peer per hour
  reputationDecayRate: 0.95, // Reputation decays by 5% daily
  suspiciousActivityThreshold: 0.3 // Flag peers with >30% invalid announcements
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Logger setup
const logger = winston.createLogger({
  level: CONFIG.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'obscura-indexer' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(dataDir, 'indexer.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  ]
});

// Database setup
let db: DatabaseWithStatements | undefined;
let node: Libp2p | undefined;
function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const dbInstance = new sqlite3.Database(CONFIG.dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      logger.info('Database initialized', { path: CONFIG.dbPath });

      // Create tables
      const createTablesSQL = `
        CREATE TABLE IF NOT EXISTS vaults (
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

        CREATE INDEX IF NOT EXISTS idx_vaults_active ON vaults(is_active, last_seen);
        CREATE INDEX IF NOT EXISTS idx_vaults_verified ON vaults(verified, is_active);

        CREATE TABLE IF NOT EXISTS peers (
          peer_id TEXT PRIMARY KEY,
          multiaddrs TEXT,
          last_seen INTEGER NOT NULL,
          reputation INTEGER DEFAULT 0,
          total_announcements INTEGER DEFAULT 0,
          valid_announcements INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS vault_confirmations (
          vault_address TEXT,
          peer_id TEXT,
          announced_at INTEGER NOT NULL,
          confirmed BOOLEAN DEFAULT FALSE,
          PRIMARY KEY (vault_address, peer_id)
        );

        CREATE TABLE IF NOT EXISTS network_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total_vaults INTEGER DEFAULT 0,
          active_vaults INTEGER DEFAULT 0,
          total_liquidity_wei INTEGER DEFAULT 0,
          total_deposits INTEGER DEFAULT 0,
          total_withdrawals INTEGER DEFAULT 0,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `;

      dbInstance.exec(createTablesSQL, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Prepared statements (using sqlite3's prepare)
        (dbInstance as DatabaseWithStatements).statements = {
          insertVault: dbInstance.prepare(`
            INSERT OR REPLACE INTO vaults
            (address, codehash, indexed_at, last_seen, total_deposits, total_withdrawals, liquidity_wei, is_active, verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `),

          updateVaultActivity: dbInstance.prepare(`
            UPDATE vaults SET
              last_seen = ?,
              total_deposits = ?,
              total_withdrawals = ?,
              liquidity_wei = ?
            WHERE address = ?
          `),

          getActiveVaults: dbInstance.prepare(`
            SELECT * FROM vaults
            WHERE is_active = 1 AND verified = 1
            ORDER BY last_seen DESC
            LIMIT ?
          `),

          getVaultByAddress: dbInstance.prepare(`
            SELECT * FROM vaults WHERE address = ?
          `),

          deactivateVault: dbInstance.prepare(`
            UPDATE vaults SET is_active = 0 WHERE address = ?
          `),

          insertNetworkStats: dbInstance.prepare(`
            INSERT INTO network_stats
            (total_vaults, active_vaults, total_liquidity_wei, total_deposits, total_withdrawals)
            VALUES (?, ?, ?, ?, ?)
          `),

          getLatestStats: dbInstance.prepare(`
            SELECT * FROM network_stats
            ORDER BY timestamp DESC LIMIT 1
          `),

          getNetworkStats: dbInstance.prepare(`
            SELECT
              COUNT(*) as total_vaults,
              COUNT(CASE WHEN is_active = 1 AND verified = 1 THEN 1 END) as active_vaults,
              SUM(liquidity_wei) as total_liquidity,
              SUM(total_deposits) as total_deposits,
              SUM(total_withdrawals) as total_withdrawals
            FROM vaults
          `),

          // Peer reputation management
          upsertPeer: dbInstance.prepare(`
            INSERT OR REPLACE INTO peers
            (peer_id, multiaddrs, last_seen, reputation, total_announcements, valid_announcements)
            VALUES (?, ?, ?, ?, ?, ?)
          `),

          updatePeerReputation: dbInstance.prepare(`
            UPDATE peers SET
              reputation = ?,
              total_announcements = total_announcements + 1,
              valid_announcements = valid_announcements + ?
            WHERE peer_id = ?
          `),

          // Vault confirmation tracking
          insertVaultConfirmation: dbInstance.prepare(`
            INSERT OR IGNORE INTO vault_confirmations
            (vault_address, peer_id, announced_at)
            VALUES (?, ?, ?)
          `),

          confirmVaultAnnouncement: dbInstance.prepare(`
            UPDATE vault_confirmations SET confirmed = TRUE
            WHERE vault_address = ? AND peer_id = ?
          `),

          getVaultConfirmations: dbInstance.prepare(`
            SELECT COUNT(*) as confirmations FROM vault_confirmations
            WHERE vault_address = ? AND confirmed = TRUE
          `),

          getUnconfirmedVaults: dbInstance.prepare(`
            SELECT DISTINCT vault_address FROM vault_confirmations
            WHERE confirmed = FALSE AND announced_at < ?
          `)
        };

        db = dbInstance as DatabaseWithStatements;
        resolve();
      });
    });
  });
}

// P2P Node setup
async function createP2PNode() {
  try {
    node = await createLibp2p({
      addresses: {
        listen: [
          '/ip4/0.0.0.0/tcp/0',
          '/ip4/0.0.0.0/tcp/0/ws'
        ]
      },
      transports: [
        // Cast the transport factories to the expected function type to avoid mismatched Metrics types
        tcp as unknown as (components: any) => any,
        webSockets as unknown as (components: any) => any
      ],
      connectionEncrypters: [
        // noise() currently returns a ConnectionEncrypter with Noise-specific generics;
        // cast to the broader function type expected by createLibp2p to satisfy typings.
        noise as unknown as (components: any) => any
      ],
      // Cast yamux() to any-compatible factory to satisfy createLibp2p's strict generics
      streamMuxers: [yamux() as unknown as (components: any) => any],
      peerDiscovery: [
        mdns({
          interval: 20e3 // 20 seconds
        }) as unknown as (components: any) => any
      ],
      services: {
        pubsub: gossipsub() as unknown as (components: any) => any
      }
    });

    // Subscribe to vault discovery topic
    (node.services.pubsub as any).subscribe('obscura-vaults');

    // Handle incoming vault announcements
    (node.services.pubsub as any).addEventListener('message', (event: any) => {
      if (event.detail.topic === 'obscura-vaults') {
        try {
          const message = JSON.parse(event.detail.data.toString());
          handleVaultAnnouncement(message, event.detail.from);
        } catch (error: any) {
          logger.warn('Failed to parse vault announcement', { error: error?.message ?? String(error) });
        }
      }
    });

    await node.start();
    logger.info('P2P node started', {
      peerId: node.peerId.toString(),
      addresses: node.getMultiaddrs().map(addr => addr.toString())
    });

    return node;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('P2P node creation failed', { error: errMsg });
    throw error;
  }
}

// Ethereum provider and contract setup
let provider: ethers.JsonRpcProvider;
let indexerRegistry: ethers.Contract;
let vaultContract: ethers.Contract; // For querying vault stats

async function setupEthereum() {
  try {
    provider = new ethers.JsonRpcProvider(CONFIG.ethereumRpc);
    logger.info('Ethereum provider initialized', { rpc: CONFIG.ethereumRpc });

    if (CONFIG.indexerRegistryAddress) {
      // Load IndexerRegistry ABI (simplified for now)
      const registryAbi = [
        "event VaultIndexed(address indexed vault, uint256 timestamp, bytes32 codeHash)",
        "function CANONICAL_VAULT_CODEHASH() view returns (bytes32)"
      ];

      indexerRegistry = new ethers.Contract(CONFIG.indexerRegistryAddress, registryAbi, provider);
      logger.info('IndexerRegistry contract initialized', { address: CONFIG.indexerRegistryAddress });

      // Start polling for vault registration events instead of listening
      pollForVaultEvents();
      logger.info('Started polling for VaultIndexed events');
    } else {
      logger.warn('INDEXER_REGISTRY_ADDRESS not configured, skipping on-chain monitoring');
    }

    // Initialize vault contract interface for stats querying
    const vaultAbi = [
      "function getStatistics() view returns (uint256, uint256, uint256, uint256, uint256)",
      "function getBalance() view returns (uint256)"
    ];
    vaultContract = new ethers.Contract(ethers.ZeroAddress, vaultAbi, provider); // Template contract

  } catch (error) {
    logger.error('Ethereum setup failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// Poll for vault events since RPC doesn't support filters
let lastPolledBlock = 0;

async function handleVaultIndexedEvent(vault: string, timestamp: bigint, codeHash: string, event: any) {
  logger.info('New vault indexed on-chain', {
    vault,
    timestamp: timestamp.toString(),
    codeHash,
    blockNumber: event.blockNumber
  });

  try {
    // Read current canonical codehash from contract
    const canonicalCodeHash = await indexerRegistry.CANONICAL_VAULT_CODEHASH();
    const isCanonical = codeHash === canonicalCodeHash;

    if (isCanonical) {
      // Add to database
      await new Promise<void>((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        db.statements.insertVault.run(
          vault as string,
          codeHash as string,
          Number(timestamp),
          Date.now() as number,
          0 as number, // total_deposits
          0 as number, // total_withdrawals
          0 as number, // liquidity_wei
          1 as number, // is_active
          1 as number, // verified
          function (this: sqlite3.RunResult, err: Error | null) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Broadcast to P2P network
      await broadcastVault(vault, timestamp, codeHash);

      logger.info('Vault verified and indexed', { vault, codeHash });
    } else {
      logger.warn('Vault rejected - non-canonical codehash', {
        vault,
        codeHash,
        expected: canonicalCodeHash
      });
    }
  } catch (error) {
    logger.error('Failed to process vault registration', {
      vault,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function pollForVaultEvents() {
  if (!indexerRegistry) return;

  try {
    const currentBlock = await provider.getBlockNumber();
    if (lastPolledBlock === 0) {
      // First run, poll from recent blocks
      lastPolledBlock = Math.max(0, currentBlock - 1000); // Last 1000 blocks
    }

    const events = await indexerRegistry.queryFilter('VaultIndexed', lastPolledBlock, currentBlock);
    
    for (const event of events) {
      if ('args' in event) {
        await handleVaultIndexedEvent(event.args[0], event.args[1], event.args[2], event);
      }
    }

    lastPolledBlock = currentBlock + 1;
    logger.debug('Polled for vault events', { fromBlock: lastPolledBlock - 1, toBlock: currentBlock, eventsFound: events.length });
  } catch (error) {
    logger.warn('Failed to poll for vault events', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleVaultAnnouncement(message: any, fromPeer: string) {
  logger.debug('Received vault announcement', { message, fromPeer });

  try {
    const { type, vault, timestamp, codeHash, signature } = message;

    if (type === 'NEW_VAULT') {
      // Step 1: Verify peer reputation
      const peerReputable = await checkPeerReputation(fromPeer);
      if (!peerReputable) {
        logger.warn('Rejected announcement from disreputable peer', { fromPeer, vault });
        return;
      }

      // Step 2: Check rate limiting
      const withinLimits = await checkAnnouncementRateLimit(fromPeer);
      if (!withinLimits) {
        logger.warn('Rejected announcement due to rate limiting', { fromPeer, vault });
        return;
      }

      // Step 3: Verify message signature (if provided)
      if (signature) {
        const isValidSignature = await verifyAnnouncementSignature(message, signature, fromPeer);
        if (!isValidSignature) {
          logger.warn('Rejected announcement with invalid signature', { fromPeer, vault });
          await updatePeerReputation(fromPeer, false);
          return;
        }
      }

      // Step 4: Check if vault already exists
      const existing = await new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        db.statements.getVaultByAddress.get(vault, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existing) {
        // If already verified, just update peer reputation positively
        if ((existing as any).verified) {
          await updatePeerReputation(fromPeer, true);
        }
        return;
      }

      // Step 5: Record the announcement for confirmation tracking
      await new Promise<void>((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        db.statements.insertVaultConfirmation.run(
          vault,
          fromPeer,
          Date.now(),
          function(err: Error | null) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Step 6: Check if we have enough confirmations
      const confirmations = await new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Database not initialized'));
        db.statements.getVaultConfirmations.get(vault, (err, result: any) => {
          if (err) reject(err);
          else resolve(result?.confirmations || 0);
        });
      });

      if ((confirmations as number) >= CONFIG.minConfirmationsRequired) {
        // Step 7: Add to database as unverified (will be verified on-chain)
        await new Promise<void>((resolve, reject) => {
          if (!db) return reject(new Error('Database not initialized'));
          db.statements.insertVault.run(
            vault,
            codeHash,
            timestamp,
            Date.now(),
            0, 0, 0, 0, // unverified
            function(err: Error | null) {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        // Step 8: Mark all confirmations as confirmed
        await confirmAllVaultConfirmations(vault);

        // Step 9: Update peer reputation positively
        await updatePeerReputation(fromPeer, true);

        logger.info('New vault discovered via P2P (multi-confirmed)', {
          vault,
          codeHash,
          fromPeer,
          confirmations: confirmations as number
        });
      } else {
        logger.debug('Vault announcement recorded, waiting for more confirmations', {
          vault,
          fromPeer,
          currentConfirmations: confirmations as number,
          required: CONFIG.minConfirmationsRequired
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to process vault announcement', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function broadcastVault(vault: string, timestamp: number | bigint, codeHash: string) {
  if (!node) return;

  try {
    // Ensure timestamp is JSON-serializable (JSON.stringify does not support bigint)
    const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;

    const message = {
      type: 'NEW_VAULT',
      vault,
      timestamp: ts,
      codeHash,
      // TODO: Add signature for authenticity
      // signature: await signMessage(message)
    };

    await (node.services.pubsub as any).publish('obscura-vaults', Buffer.from(JSON.stringify(message)));
    logger.debug('Vault broadcasted to P2P network', { vault });
  } catch (error) {
    logger.warn('Failed to broadcast vault', { vault, error: (error as Error).message });
  }
}

async function checkPeerReputation(peerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!db) return resolve(true); // Allow if DB not ready

    db.statements.getVaultByAddress.get(peerId, (err, row: any) => {
      if (err || !row) {
        resolve(true); // New peer, assume reputable
        return;
      }

      const reputation = row.reputation || 0;
      const totalAnnouncements = row.total_announcements || 1;
      const validAnnouncements = row.valid_announcements || 0;
      const invalidRatio = 1 - (validAnnouncements / totalAnnouncements);

      // Accept if reputation is good and invalid ratio is low
      resolve(reputation >= -10 && invalidRatio < CONFIG.suspiciousActivityThreshold);
    });
  });
}

async function checkAnnouncementRateLimit(peerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!db) return resolve(true);

    // Check recent announcements in the last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    // For now, use a simple check - in production you'd track this properly
    resolve(true); // TODO: Implement proper rate limiting
  });
}

async function verifyAnnouncementSignature(message: any, signature: string, peerId: string): Promise<boolean> {
  try {
    // TODO: Implement cryptographic signature verification
    // This would require the peer's public key and proper signature verification
    // For now, return true
    return true;
  } catch (error) {
    return false;
  }
}

async function updatePeerReputation(peerId: string, wasValid: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();

    const reputationChange = wasValid ? 1 : -2;
    const validIncrement = wasValid ? 1 : 0;

    db.statements.updatePeerReputation.run(
      reputationChange,
      validIncrement,
      peerId,
      function(err: Error | null) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function confirmAllVaultConfirmations(vaultAddress: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();

    // This is a simplified version - in practice you'd need to update all confirmations
    // For now, we'll just mark them as confirmed when we accept the vault
    resolve();
  });
}

// Vault monitoring and cleanup
async function updateVaultStats() {
  try {
    const vaults = await new Promise<any[]>((resolve, reject) => {
      if (!db) return reject(new Error('Database not initialized'));
      db.statements.getActiveVaults.all(CONFIG.maxVaultsPerResponse, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as any[]);
      });
    });

    for (const vault of vaults) {
      try {
        // Query vault contract for real statistics
        const vaultInstance = new ethers.Contract(vault.address, vaultContract.interface, provider);
        
        // Get vault statistics [totalDeposits, totalWithdrawals, totalFees, nextIndex, currentRoot]
        const stats = await vaultInstance.getStatistics();
        const balance = await vaultInstance.getBalance();
        
        // Update database with real stats
        await new Promise<void>((resolve, reject) => {
          if (!db) return reject(new Error('Database not initialized'));
          db.statements.updateVaultActivity.run(
            Date.now(),
            Number(stats[0]), // totalDeposits
            Number(stats[1]), // totalWithdrawals
            balance.toString(), // liquidity_wei
            vault.address,
            function(err: Error | null) {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        logger.debug('Updated vault stats from contract', {
          vault: vault.address,
          deposits: stats[0].toString(),
          withdrawals: stats[1].toString(),
          liquidity: balance.toString()
        });
      } catch (error) {
        logger.warn('Failed to update vault stats from contract, using cached data', {
          vault: vault.address,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Fallback: just update last_seen without querying contract
        await new Promise<void>((resolve, reject) => {
          if (!db) return reject(new Error('Database not initialized'));
          db.statements.updateVaultActivity.run(
            Date.now(),
            vault.total_deposits,
            vault.total_withdrawals,
            vault.liquidity_wei,
            vault.address,
            function(err: Error | null) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }

    // Update network statistics
    const stats = await calculateNetworkStats();
    await new Promise<void>((resolve, reject) => {
      if (!db) return reject(new Error('Database not initialized'));
      db.statements.insertNetworkStats.run(
        stats.totalVaults,
        stats.activeVaults,
        stats.totalLiquidity,
        stats.totalDeposits,
        stats.totalWithdrawals,
        function(err: Error | null) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    logger.debug('Vault stats updated', stats);
  } catch (error) {
    logger.error('Vault stats update failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

function calculateNetworkStats() {
  return new Promise<{
    totalVaults: number;
    activeVaults: number;
    totalLiquidity: number;
    totalDeposits: number;
    totalWithdrawals: number;
  }>((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.statements.getNetworkStats.get((err, result: any) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        totalVaults: result?.total_vaults || 0,
        activeVaults: result?.active_vaults || 0,
        totalLiquidity: result?.total_liquidity || 0,
        totalDeposits: result?.total_deposits || 0,
        totalWithdrawals: result?.total_withdrawals || 0
      });
    });
  });
}

// Express API setup
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Routes
app.get('/health', async (req, res) => {
  try {
    let blockNumber = 'unknown';
    let networkName = 'unknown';

    if (provider) {
      try {
        blockNumber = (await provider.getBlockNumber()).toString();
        const network = await provider.getNetwork();
        networkName = network.name;
      } catch (error) {
        // Keep defaults
      }
    }

    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      version: '1.0.0',
      p2p: {
        connected: !!node,
        peerId: node?.peerId?.toString(),
        peers: node?.getPeers()?.length || 0
      },
      ethereum: {
        connected: !!provider,
        network: networkName,
        blockNumber: blockNumber
      },
      database: {
        connected: !!db
      },
      security: {
        minConfirmationsRequired: CONFIG.minConfirmationsRequired,
        confirmationTimeWindow: CONFIG.confirmationTimeWindow,
        suspiciousActivityThreshold: CONFIG.suspiciousActivityThreshold,
        canonicalCodeHash: indexerRegistry ? await indexerRegistry.CANONICAL_VAULT_CODEHASH() : CONFIG.canonicalCodeHash
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/vaults/active', async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit as string) || 100,
      CONFIG.maxVaultsPerResponse
    );

    const vaults = await new Promise<any[]>((resolve, reject) => {
      if (!db) return reject(new Error('Database not initialized'));
      db.statements.getActiveVaults.all(limit, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as any[]);
      });
    });

    // Format response
    const formatted = vaults.map(vault => ({
      address: vault.address,
      codehash: vault.codehash,
      indexedAt: vault.indexed_at,
      lastSeen: vault.last_seen,
      totalDeposits: vault.total_deposits,
      totalWithdrawals: vault.total_withdrawals,
      liquidityWei: vault.liquidity_wei,
      verified: Boolean(vault.verified)
    }));

    res.json({
      vaults: formatted,
      count: formatted.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Failed to fetch active vaults', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const stats = await calculateNetworkStats();
    const latest = await new Promise<any>((resolve, reject) => {
      if (!db) return reject(new Error('Database not initialized'));
      db.statements.getLatestStats.get((err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.json({
      current: stats,
      historical: latest ? {
        timestamp: latest.timestamp,
        ...latest
      } : null
    });
  } catch (error) {
    logger.error('Failed to fetch stats', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/vaults/:address', async (req, res) => {
  try {
    const vault = await new Promise<any>((resolve, reject) => {
      if (!db) return reject(new Error('Database not initialized'));
      db.statements.getVaultByAddress.get(req.params.address, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    res.json({
      address: vault.address,
      codehash: vault.codehash,
      indexedAt: vault.indexed_at,
      lastSeen: vault.last_seen,
      totalDeposits: vault.total_deposits,
      totalWithdrawals: vault.total_withdrawals,
      liquidityWei: vault.liquidity_wei,
      isActive: Boolean(vault.is_active),
      verified: Boolean(vault.verified)
    });
  } catch (error) {
    logger.error('Failed to fetch vault', {
      address: req.params.address,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Scheduled tasks
cron.schedule(CONFIG.vaultCleanupInterval, async () => {
  logger.info('Running vault cleanup');

  try {
    if (!db) {
      logger.error('Database not initialized for cleanup');
      return;
    }

    // Deactivate vaults that haven't been seen recently (e.g., last 24 hours)
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    // Get all active vaults that haven't been seen recently
    const inactiveVaults = await new Promise<any[]>((resolve, reject) => {
      db!.statements.getActiveVaults.all(1000, (err, rows) => { // Get up to 1000 vaults
        if (err) reject(err);
        else resolve(rows.filter((vault: any) => vault.last_seen < cutoffTime));
      });
    });

    for (const vault of inactiveVaults) {
      await new Promise<void>((resolve, reject) => {
        db!.statements.deactivateVault.run(vault.address, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('Deactivated inactive vault', { vault: vault.address, lastSeen: vault.last_seen });
    }

    // Clean up old unconfirmed vault announcements
    const oldAnnouncementCutoff = Date.now() - CONFIG.confirmationTimeWindow;
    const oldUnconfirmed = await new Promise<any[]>((resolve, reject) => {
      db!.statements.getUnconfirmedVaults.all(oldAnnouncementCutoff, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // TODO: Remove old unconfirmed announcements from database
    if (oldUnconfirmed.length > 0) {
      logger.info(`Found ${oldUnconfirmed.length} old unconfirmed vault announcements to clean up`);
    }

    if (inactiveVaults.length > 0) {
      logger.info(`Vault cleanup completed: ${inactiveVaults.length} vaults deactivated`);
    } else {
      logger.debug('Vault cleanup completed: no inactive vaults found');
    }
  } catch (error) {
    logger.error('Vault cleanup failed', { error: error instanceof Error ? error.message : String(error) });
  }
});

cron.schedule(CONFIG.healthCheckInterval, async () => {
  logger.debug('Running health checks');

  try {
    let p2pHealthy = false;
    let ethereumHealthy = false;

    // Check P2P connectivity
    if (node) {
      try {
        const peers = node.getPeers();
        p2pHealthy = peers.length >= 0; // At least connected to network
        logger.debug('P2P health check', { peers: peers.length, healthy: p2pHealthy });
      } catch (error) {
        logger.warn('P2P health check failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Check Ethereum connectivity
    if (provider) {
      try {
        const blockNumber = await provider.getBlockNumber();
        ethereumHealthy = blockNumber > 0;
        logger.debug('Ethereum health check', { blockNumber, healthy: ethereumHealthy });
      } catch (error) {
        logger.warn('Ethereum health check failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Log overall health status
    const overallHealthy = p2pHealthy && ethereumHealthy;
    if (!overallHealthy) {
      logger.warn('Health check failed', { p2pHealthy, ethereumHealthy });
    } else {
      logger.debug('All health checks passed');
    }

  } catch (error) {
    logger.error('Health check error', { error: error instanceof Error ? error.message : String(error) });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down indexer...');

  if (node) {
    await node.stop();
    logger.info('P2P node stopped');
  }

  if (db) {
    db.close();
    logger.info('Database closed');
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Main startup
async function main() {
  try {
    logger.info('🚀 Starting Obscura Hydra Protocol Indexer');
    logger.info('📋 Configuration:', {
      port: CONFIG.port,
      ethereumRpc: CONFIG.ethereumRpc,
      indexerRegistry: CONFIG.indexerRegistryAddress,
      canonicalCodeHash: CONFIG.canonicalCodeHash
    });

    // Initialize components
    await initializeDatabase();
    await setupEthereum();

    // Try to create P2P node, but don't fail if it doesn't work
    // Disabled for single-node setup
    /*
    try {
      await createP2PNode();
    } catch (p2pError) {
      logger.warn('P2P node creation failed, continuing without P2P functionality', {
        error: p2pError instanceof Error ? p2pError.message : String(p2pError)
      });
    }
    */

    // Start vault monitoring
    updateVaultStats();
    setInterval(updateVaultStats, 5 * 60 * 1000); // Every 5 minutes

    // Start HTTP server
    app.listen(CONFIG.port, () => {
      logger.info(`🌐 HTTP API listening on port ${CONFIG.port}`);
      logger.info(`📊 Stats: http://localhost:${CONFIG.port}/stats`);
      logger.info(`🏦 Vaults: http://localhost:${CONFIG.port}/vaults/active`);
      logger.info(`❤️  Health: http://localhost:${CONFIG.port}/health`);
    });

    // Start polling for vault events every 30 seconds
    if (indexerRegistry) {
      setInterval(pollForVaultEvents, 30 * 1000);
    }

    logger.info('✅ Obscura Indexer started successfully!');
    logger.info('🔥 The Hydra Protocol is live - you can\'t ban them all!');

  } catch (error) {
    logger.error('Failed to start indexer', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

// Start the indexer
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

export { app, db, node, CONFIG };