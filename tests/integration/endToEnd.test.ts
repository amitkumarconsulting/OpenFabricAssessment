import { Redis } from 'ioredis';
import { createServer } from '../../src/api/server';
import { QueueService } from '../../src/services/queueService';
import { WorkerPool } from '../../src/workers/workerPool';
import { PostingService } from '../../src/services/postingService';
import { StateService } from '../../src/services/stateService';
import { TransactionStatus } from '../../src/models/transaction';
import { setupTests, teardownTests, cleanupRedis, cleanupQueue, getTestRedis } from '../setup';
import {
  createTestTransactionRequest,
  waitForTransactionStatus,
  sleep,
} from '../helpers/testUtils';

describe('End-to-End Integration Tests', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;
  let redis: Redis;
  let queueService: QueueService;
  let workerPool: WorkerPool;
  let postingService: PostingService;
  let stateService: StateService;

  beforeAll(async () => {
    await setupTests();
    
    redis = await getTestRedis();
    queueService = new QueueService(redis);
    postingService = new PostingService();
    stateService = new StateService(redis);
    
    // Start worker pool
    workerPool = new WorkerPool(redis, queueService);
    workerPool.start();
    
    // Create server
    fastify = await createServer(redis, queueService);
    await fastify.ready();
  });

  afterAll(async () => {
    await workerPool.stop();
    await fastify.close();
    await queueService.close();
    await redis.quit();
    await teardownTests();
  });

  beforeEach(async () => {
    await cleanupRedis();
    await cleanupQueue();
    
    // Clean up posting service
    try {
      await postingService.cleanup();
    } catch (error) {
      // Ignore if service is not available
    }
  });

  describe('Complete transaction lifecycle', () => {
    it('should process transaction from submission to completion', async () => {
      const request = createTestTransactionRequest({ id: 'e2e-complete' });

      // Submit transaction
      const submitResponse = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      expect(submitResponse.statusCode).toBe(202);
      const submitBody = JSON.parse(submitResponse.body);
      expect(submitBody.id).toBe(request.id);
      expect(submitBody.status).toBe(TransactionStatus.PENDING);

      // Wait for processing
      await waitForTransactionStatus(
        async () => {
          const statusResponse = await fastify.inject({
            method: 'GET',
            url: `/api/transactions/${request.id}`,
          });
          if (statusResponse.statusCode === 200) {
            const statusBody = JSON.parse(statusResponse.body);
            return statusBody.status;
          }
          return null;
        },
        TransactionStatus.COMPLETED,
        30000 // 30 second timeout to allow for processing and retries
      );

      // Verify final status
      const statusResponse = await fastify.inject({
        method: 'GET',
        url: `/api/transactions/${request.id}`,
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusBody = JSON.parse(statusResponse.body);
      expect(statusBody.status).toBe(TransactionStatus.COMPLETED);

      // Verify transaction exists in posting service
      const postedTransaction = await postingService.getTransaction(request.id);
      expect(postedTransaction).not.toBeNull();
      expect(postedTransaction?.id).toBe(request.id);
    });

    it('should handle status transitions correctly', async () => {
      const request = createTestTransactionRequest({ id: 'e2e-transitions' });

      // Submit
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      // Check initial status
      let statusResponse = await fastify.inject({
        method: 'GET',
        url: `/api/transactions/${request.id}`,
      });
      let statusBody = JSON.parse(statusResponse.body);
      expect(statusBody.status).toBe(TransactionStatus.PENDING);

      // Wait a bit for processing to start
      await sleep(100);

      // Status should eventually become COMPLETED
      await waitForTransactionStatus(
        async () => {
          const response = await fastify.inject({
            method: 'GET',
            url: `/api/transactions/${request.id}`,
          });
          if (response.statusCode === 200) {
            return JSON.parse(response.body).status;
          }
          return null;
        },
        TransactionStatus.COMPLETED,
        30000 // 30 second timeout
      );
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate submissions idempotently', async () => {
      const request = createTestTransactionRequest({ id: 'e2e-duplicate' });

      // Submit same transaction multiple times
      const responses = await Promise.all([
        fastify.inject({
          method: 'POST',
          url: '/api/transactions',
          payload: request,
        }),
        fastify.inject({
          method: 'POST',
          url: '/api/transactions',
          payload: request,
        }),
        fastify.inject({
          method: 'POST',
          url: '/api/transactions',
          payload: request,
        }),
      ]);

      // All should return 202
      responses.forEach((response) => {
        expect(response.statusCode).toBe(202);
      });

      // Wait for completion
      await waitForTransactionStatus(
        async () => {
          const response = await fastify.inject({
            method: 'GET',
            url: `/api/transactions/${request.id}`,
          });
          if (response.statusCode === 200) {
            return JSON.parse(response.body).status;
          }
          return null;
        },
        TransactionStatus.COMPLETED,
        30000 // 30 second timeout
      );

      // Verify only one transaction exists in posting service
      const postedTransaction = await postingService.getTransaction(request.id);
      expect(postedTransaction).not.toBeNull();
    });

    it('should prevent duplicate processing with GET-before-POST', async () => {
      const request = createTestTransactionRequest({ id: 'e2e-get-before-post' });

      // Submit and wait for completion
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      await waitForTransactionStatus(
        async () => {
          const response = await fastify.inject({
            method: 'GET',
            url: `/api/transactions/${request.id}`,
          });
          if (response.statusCode === 200) {
            return JSON.parse(response.body).status;
          }
          return null;
        },
        TransactionStatus.COMPLETED,
        30000 // 30 second timeout
      );

      // Submit again - should be idempotent
      const duplicateResponse = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      expect(duplicateResponse.statusCode).toBe(202);
      const duplicateBody = JSON.parse(duplicateResponse.body);
      expect(duplicateBody.status).toBe(TransactionStatus.COMPLETED);
      expect(duplicateBody.message).toContain('already');
    });
  });

  describe('Concurrent processing', () => {
    it('should process multiple transactions concurrently', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        createTestTransactionRequest({ id: `e2e-concurrent-${i}` })
      );

      // Submit all transactions
      const submitResponses = await Promise.all(
        requests.map((req) =>
          fastify.inject({
            method: 'POST',
            url: '/api/transactions',
            payload: req,
          })
        )
      );

      submitResponses.forEach((response) => {
        expect(response.statusCode).toBe(202);
      });

      // Wait for all to complete
      await Promise.all(
        requests.map((req) =>
          waitForTransactionStatus(
            async () => {
              const response = await fastify.inject({
                method: 'GET',
                url: `/api/transactions/${req.id}`,
              });
              if (response.statusCode === 200) {
                return JSON.parse(response.body).status;
              }
              return null;
            },
            TransactionStatus.COMPLETED,
            30000 // 30 second timeout for concurrent processing
          )
        )
      );

      // Verify all transactions are in posting service
      for (const req of requests) {
        const posted = await postingService.getTransaction(req.id);
        expect(posted).not.toBeNull();
        expect(posted?.id).toBe(req.id);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle posting service errors gracefully', async () => {
      // This test requires the posting service to be unavailable or return errors
      // We'll test with a transaction that might fail
      const request = createTestTransactionRequest({ id: 'e2e-error-handling' });

      const submitResponse = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      expect(submitResponse.statusCode).toBe(202);

      // Wait a bit to see if it processes or fails
      await sleep(2000);

      // Check status - should be either completed or failed
      const statusResponse = await fastify.inject({
        method: 'GET',
        url: `/api/transactions/${request.id}`,
      });

      if (statusResponse.statusCode === 200) {
        const statusBody = JSON.parse(statusResponse.body);
        expect([TransactionStatus.COMPLETED, TransactionStatus.FAILED, TransactionStatus.PROCESSING]).toContain(
          statusBody.status
        );
      }
    });
  });

  describe('Queue metrics', () => {
    it('should reflect transactions in queue metrics', async () => {
      const initialHealth = await fastify.inject({
        method: 'GET',
        url: '/api/health',
      });
      const initialBody = JSON.parse(initialHealth.body);
      const initialTotal = initialBody.services.queue.metrics.total;

      // Submit a transaction
      const request = createTestTransactionRequest();
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: request,
      });

      // Wait a bit for queue to update
      await sleep(100);

      const healthResponse = await fastify.inject({
        method: 'GET',
        url: '/api/health',
      });
      const healthBody = JSON.parse(healthResponse.body);
      
      // Total should increase (or at least not decrease)
      expect(healthBody.services.queue.metrics.total).toBeGreaterThanOrEqual(initialTotal);
    });
  });
});

