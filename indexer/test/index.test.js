/**
 * Obscura Indexer Tests
 */

const request = require('supertest');
const { app } = require('../src/index');

describe('Obscura Indexer API', () => {
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
});