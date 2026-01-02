import { Redis } from 'ioredis';
import { WorkerPool } from '../../../src/workers/workerPool';
import { QueueService } from '../../../src/services/queueService';
import { getTestRedis, cleanupRedis, cleanupQueue, closeTestConnections } from '../../setup';

describe('WorkerPool', () => {
  let redis: Redis;
  let queueService: QueueService;
  let workerPool: WorkerPool;

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

  afterEach(async () => {
    if (workerPool) {
      await workerPool.stop();
    }
  });

  describe('start', () => {
    it('should start the worker pool', () => {
      workerPool = new WorkerPool(redis, queueService);
      
      // Mock console.log to avoid output during tests
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      
      expect(workerPool.getWorkerCount()).toBe(1);
      
      consoleSpy.mockRestore();
    });

    it('should create workers with correct concurrency', () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      
      expect(workerPool.getWorkerCount()).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should stop all workers', async () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      expect(workerPool.getWorkerCount()).toBe(1);
      
      await workerPool.stop();
      expect(workerPool.getWorkerCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('should handle stopping when no workers are running', async () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Stop without starting should not throw
      await expect(workerPool.stop()).resolves.not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });

  describe('getWorkerCount', () => {
    it('should return 0 when no workers are started', () => {
      workerPool = new WorkerPool(redis, queueService);
      expect(workerPool.getWorkerCount()).toBe(0);
    });

    it('should return correct count after starting', () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      expect(workerPool.getWorkerCount()).toBe(1);
      
      consoleSpy.mockRestore();
    });

    it('should return 0 after stopping', async () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      expect(workerPool.getWorkerCount()).toBe(1);
      
      await workerPool.stop();
      expect(workerPool.getWorkerCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('lifecycle', () => {
    it('should handle start-stop-start cycle', async () => {
      workerPool = new WorkerPool(redis, queueService);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      workerPool.start();
      expect(workerPool.getWorkerCount()).toBe(1);
      
      await workerPool.stop();
      expect(workerPool.getWorkerCount()).toBe(0);
      
      workerPool.start();
      expect(workerPool.getWorkerCount()).toBe(1);
      
      await workerPool.stop();
      expect(workerPool.getWorkerCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });
});

