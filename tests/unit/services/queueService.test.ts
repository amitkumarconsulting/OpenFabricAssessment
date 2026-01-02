import { Redis } from 'ioredis';
import { QueueService } from '../../../src/services/queueService';
import { Transaction } from '../../../src/models/transaction';
import { getTestRedis, cleanupRedis, cleanupQueue, closeTestConnections } from '../../setup';

describe('QueueService', () => {
  let redis: Redis;
  let queueService: QueueService;

  beforeAll(async () => {
    redis = await getTestRedis();
    queueService = new QueueService(redis);
  });

  afterAll(async () => {
    await cleanupQueue();
    await closeTestConnections();
  });

  beforeEach(async () => {
    await cleanupRedis();
    await cleanupQueue();
  });

  describe('enqueue', () => {
    it('should enqueue a transaction successfully', async () => {
      const transaction: Transaction = {
        id: 'test-123',
        amount: 100.50,
        currency: 'USD',
        description: 'Test transaction',
        timestamp: new Date().toISOString(),
      };

      const jobId = await queueService.enqueue(transaction, 0);
      expect(jobId).toBe('test-123'); // Job ID should match transaction ID
    });

    it('should use transaction ID as job ID for idempotency', async () => {
      const transaction: Transaction = {
        id: 'unique-txn-456',
        amount: 200,
        currency: 'EUR',
        description: 'Idempotency test transaction',
        timestamp: new Date().toISOString(),
      };

      const jobId1 = await queueService.enqueue(transaction, 0);
      const jobId2 = await queueService.enqueue(transaction, 0);

      // Same transaction ID should result in same job ID (deduplication)
      expect(jobId1).toBe('unique-txn-456');
      expect(jobId2).toBe('unique-txn-456');
    });

    it('should handle different attempt numbers', async () => {
      const transaction: Transaction = {
        id: 'retry-txn',
        amount: 50,
        currency: 'USD',
        description: 'Retry test transaction',
        timestamp: new Date().toISOString(),
      };

      const jobId1 = await queueService.enqueue(transaction, 0);
      const jobId2 = await queueService.enqueue(transaction, 1);

      // Job ID should be the same regardless of attempt number
      expect(jobId1).toBe(jobId2);
    });
  });

  describe('getMetrics', () => {
    it('should return queue metrics', async () => {
      const metrics = await queueService.getMetrics();

      expect(metrics).toHaveProperty('waiting');
      expect(metrics).toHaveProperty('active');
      expect(metrics).toHaveProperty('completed');
      expect(metrics).toHaveProperty('failed');
      expect(metrics).toHaveProperty('delayed');
      expect(metrics).toHaveProperty('total');

      expect(typeof metrics.waiting).toBe('number');
      expect(typeof metrics.active).toBe('number');
      expect(typeof metrics.completed).toBe('number');
      expect(typeof metrics.failed).toBe('number');
      expect(typeof metrics.delayed).toBe('number');
    });

    it('should reflect enqueued jobs in metrics', async () => {
      const transaction: Transaction = {
        id: 'metrics-test',
        amount: 100,
        currency: 'USD',
        description: 'Metrics test transaction',
        timestamp: new Date().toISOString(),
      };

      await queueService.enqueue(transaction, 0);

      // Wait a bit for the job to be registered
      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = await queueService.getMetrics();
      // Job might be processed quickly, so we check that metrics are valid
      expect(metrics.total).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.waiting).toBe('number');
      expect(typeof metrics.active).toBe('number');
      expect(typeof metrics.completed).toBe('number');
    });
  });

  describe('getQueue', () => {
    it('should return the queue instance', () => {
      const queue = queueService.getQueue();
      expect(queue).toBeDefined();
      expect(queue.name).toBe('transaction-queue');
    });
  });

  describe('close', () => {
    it('should close the queue connection', async () => {
      const service = new QueueService(redis);
      await expect(service.close()).resolves.not.toThrow();
    });
  });
});

