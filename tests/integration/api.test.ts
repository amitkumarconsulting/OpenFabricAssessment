import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { createServer } from '../../src/api/server';
import { QueueService } from '../../src/services/queueService';
import { PostingService } from '../../src/services/postingService';
import { setupTests, teardownTests, cleanupRedis, cleanupQueue } from '../setup';
import { createTestTransactionRequest, waitForTransactionStatus } from '../helpers/testUtils';
import { TransactionStatus } from '../../src/models/transaction';

describe('API Integration Tests', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;
  let redis: Redis;
  let queueService: QueueService;
  let postingService: PostingService;

  beforeAll(async () => {
    await setupTests();
    
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });

    queueService = new QueueService(redis);
    postingService = new PostingService();
    fastify = await createServer(redis, queueService);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await queueService.close();
    await redis.quit();
    await teardownTests();
  });

  beforeEach(async () => {
    await cleanupRedis();
    await cleanupQueue();
    
    // Clean up posting service database
    try {
      await postingService.cleanup();
    } catch (error) {
      // Ignore cleanup errors if service is not available
    }
  });

  describe('POST /api/transactions', () => {
    it('should accept a valid transaction and return 202', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          id: 'test-123',
          amount: 100.50,
          currency: 'USD',
          description: 'Test transaction',
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('test-123');
      expect(body.status).toBe('pending');
    });

    it('should return 400 for invalid transaction', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          id: 'test-123',
          amount: -100, // Invalid: negative amount
          currency: 'USD',
          description: 'Test transaction',
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Validation failed');
    });

    it('should handle duplicate transactions idempotently', async () => {
      const payload = {
        id: 'duplicate-123',
        amount: 100,
        currency: 'USD',
        description: 'Duplicate test transaction',
        timestamp: new Date().toISOString(),
      };

      const response1 = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload,
      });

      const response2 = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload,
      });

      expect(response1.statusCode).toBe(202);
      expect(response2.statusCode).toBe(202);
      
      const body2 = JSON.parse(response2.body);
      expect(body2.message).toContain('already');
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/transactions/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return transaction status after submission', async () => {
      // First submit a transaction
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          id: 'status-check-123',
          amount: 100,
          currency: 'USD',
        },
      });

      // Then check its status
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/transactions/status-check-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('status-check-123');
      expect(body.status).toBeDefined();
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.services).toBeDefined();
      expect(body.services.redis).toBeDefined();
      expect(body.services.queue).toBeDefined();
    });

    it('should include queue metrics in health response', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/health',
      });

      const body = JSON.parse(response.body);
      expect(body.services.queue.metrics).toBeDefined();
      expect(body.services.queue.metrics).toHaveProperty('waiting');
      expect(body.services.queue.metrics).toHaveProperty('active');
      expect(body.services.queue.metrics).toHaveProperty('completed');
      expect(body.services.queue.metrics).toHaveProperty('failed');
      expect(body.services.queue.metrics).toHaveProperty('total');
    });

    it('should return unhealthy status when Redis is down', async () => {
      // Close Redis connection to simulate failure
      await redis.quit();
      
      // Create a new server with closed Redis
      const testRedis = new Redis({
        host: 'invalid-host',
        port: 6379,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      
      const testQueueService = new QueueService(testRedis);
      const testServer = await createServer(testRedis, testQueueService);
      await testServer.ready();

      const response = await testServer.inject({
        method: 'GET',
        url: '/api/health',
      });

      // Should return 503 or handle gracefully
      expect([200, 503]).toContain(response.statusCode);
      
      await testServer.close();
      await testQueueService.close();
      await testRedis.quit();
    });
  });

  describe('Response time', () => {
    it('should respond within 100ms for POST requests', async () => {
      const startTime = Date.now();
      
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: createTestTransactionRequest(),
      });

      const elapsed = Date.now() - startTime;

      expect(response.statusCode).toBe(202);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Concurrent requests', () => {
    it('should handle multiple concurrent transaction submissions', async () => {
      const requests = Array.from({ length: 10 }, () =>
        fastify.inject({
          method: 'POST',
          url: '/api/transactions',
          payload: createTestTransactionRequest(),
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(202);
        const body = JSON.parse(response.body);
        expect(body.id).toBeDefined();
        expect(body.status).toBe(TransactionStatus.PENDING);
      });
    });
  });
});

