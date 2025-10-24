/**
 * Obscura Indexer Tests
 *
 * The indexer source is TypeScript ESM. Tests run against the COMPILED output
 * in ../dist (built via `npm run build`, which `npm test` runs first). Importing
 * the module no longer starts the HTTP server / DB because main() is guarded to
 * only run when the module is executed directly.
 *
 * Run with: NODE_OPTIONS=--experimental-vm-modules jest  (wired into `npm test`)
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { app, initializeDatabase } from '../dist/index.js';

describe('Obscura Indexer API', () => {
  // Initialize the (real, on-disk) SQLite DB once. main() no longer runs on
  // import, so routes that read the DB would otherwise see it uninitialized.
  beforeAll(async () => {
    await initializeDatabase();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('GET /vaults/active', () => {
    it('should return active vaults', async () => {
      const response = await request(app)
        .get('/vaults/active')
        .expect(200);

      expect(response.body).toHaveProperty('vaults');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.vaults)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/vaults/active?limit=10')
        .expect(200);

      expect(response.body.vaults.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /stats', () => {
    it('should return network statistics', async () => {
      const response = await request(app)
        .get('/stats')
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('historical');
    });
  });

  describe('GET /vaults/:address', () => {
    it('should return 404 for non-existent vault', async () => {
      await request(app)
        .get('/vaults/0x0000000000000000000000000000000000000000')
        .expect(404);
    });
  });

  describe('GET /vaults/:address/merkle-proof', () => {
    const validVault = '0x0000000000000000000000000000000000000001';

    it('should return 400 when leafIndex is missing', async () => {
      const response = await request(app)
        .get(`/vaults/${validVault}/merkle-proof`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for a non-numeric leafIndex', async () => {
      const response = await request(app)
        .get(`/vaults/${validVault}/merkle-proof?leafIndex=abc`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for an invalid vault address', async () => {
      const response = await request(app)
        .get('/vaults/not-an-address/merkle-proof?leafIndex=0')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
