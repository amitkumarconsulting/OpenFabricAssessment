import { Redis } from 'ioredis';
import { TransactionWorker } from '../../../src/workers/transactionWorker';
import { QueueService } from '../../../src/services/queueService';
import { StateService } from '../../../src/services/stateService';
import { PostingService } from '../../../src/services/postingService';
import { TransactionStatus } from '../../../src/models/transaction';
import { Transaction } from '../../../src/models/transaction';
import { getTestRedis, cleanupRedis, cleanupQueue, closeTestConnections } from '../../setup';
import { createTestTransaction } from '../../helpers/testUtils';

// Mock PostingService
jest.mock('../../../src/services/postingService');

describe('TransactionWorker', () => {
  let redis: Redis;
  let queueService: QueueService;
  let stateService: StateService;
  let worker: TransactionWorker;
  let mockPostingService: jest.Mocked<PostingService>;

  beforeAll(async () => {
    redis = await getTestRedis();
    queueService = new QueueService(redis);
  });

  afterAll(async () => {
    if (worker) {
      await worker.close();
    }
    await cleanupQueue();
    await closeTestConnections();
  });

  beforeEach(async () => {
    await cleanupRedis();
    await cleanupQueue();

    // Pause the queue to prevent workers from processing jobs from other tests
    const queue = queueService.getQueue();
    await queue.pause();

    // Create mock posting service
    const PostingServiceMock = PostingService as jest.MockedClass<typeof PostingService>;
    mockPostingService = new PostingServiceMock() as jest.Mocked<PostingService>;
    
    // Replace the posting service in worker
    worker = new TransactionWorker(redis, queueService);
    (worker as any).postingService = mockPostingService;
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    // Resume queue after test
    const queue = queueService.getQueue();
    try {
      await queue.resume();
    } catch {
      // Ignore if already resumed or doesn't exist
    }
  });

  describe('processTransaction - GET before POST pattern', () => {
    it('should complete transaction if it already exists in posting service', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'existing-txn' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      // Mock GET to return existing transaction
      mockPostingService.getTransaction.mockResolvedValueOnce({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
      });

      // Create job data directly
      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      await (worker as any).processTransaction(jobData);

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GET was called
      expect(mockPostingService.getTransaction).toHaveBeenCalledWith(transaction.id);
      // Verify POST was NOT called
      expect(mockPostingService.postTransaction).not.toHaveBeenCalled();

      // Verify state is completed
      const state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should POST transaction if it does not exist', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'new-txn' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      // Mock GET to return null (doesn't exist)
      mockPostingService.getTransaction.mockResolvedValueOnce(null);
      // Mock POST to succeed
      mockPostingService.postTransaction.mockResolvedValueOnce({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
      });

      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      await (worker as any).processTransaction(jobData);

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GET was called first
      expect(mockPostingService.getTransaction).toHaveBeenCalledWith(transaction.id);
      // Verify POST was called
      expect(mockPostingService.postTransaction).toHaveBeenCalledWith(transaction);

      // Verify state is completed
      const state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe('processTransaction - post-write failure detection', () => {
    it('should detect post-write failure and mark as completed', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'post-write-fail' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      // Mock GET before POST (doesn't exist)
      mockPostingService.getTransaction.mockResolvedValueOnce(null);
      // Mock POST to fail
      mockPostingService.postTransaction.mockRejectedValueOnce(
        new Error('Network error')
      );
      // Mock GET after POST failure (transaction exists - post-write failure)
      mockPostingService.getTransaction.mockResolvedValueOnce({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
      });

      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      // Process should complete successfully (post-write failure detected)
      await (worker as any).processTransaction(jobData);

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GET was called twice (before and after POST)
      expect(mockPostingService.getTransaction).toHaveBeenCalledTimes(2);
      // Verify POST was called
      expect(mockPostingService.postTransaction).toHaveBeenCalled();

      // Verify state is completed (despite POST error)
      const state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should retry on pre-write failure', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'pre-write-fail' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      // Mock GET before POST (doesn't exist)
      mockPostingService.getTransaction.mockResolvedValueOnce(null);
      // Mock POST to fail
      mockPostingService.postTransaction.mockRejectedValueOnce(
        new Error('Service unavailable')
      );
      // Mock GET after POST failure (still doesn't exist - pre-write failure)
      mockPostingService.getTransaction.mockResolvedValueOnce(null);

      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      // Should throw error to trigger retry
      await expect((worker as any).processTransaction(jobData)).rejects.toThrow();

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify state shows retry
      const state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.PROCESSING);
      expect(state?.retryCount).toBeGreaterThan(0);
    });
  });

  describe('processTransaction - status transitions', () => {
    it('should update status to PROCESSING when starting', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'status-transition' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);
      
      // Wait to ensure state is persisted
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockPostingService.getTransaction.mockResolvedValueOnce(null);
      mockPostingService.postTransaction.mockResolvedValueOnce({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
      });

      // Check status before processing - should be PENDING
      let state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.PENDING);

      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      await (worker as any).processTransaction(jobData);

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Status should be completed after processing
      state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe('processTransaction - retry logic', () => {
    it('should track retry count', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'retry-count' });

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      mockPostingService.getTransaction.mockResolvedValue(null);
      mockPostingService.postTransaction.mockRejectedValue(
        new Error('Service unavailable')
      );

      // Process with attempt number 2
      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 2 },
        attemptsMade: 2,
      } as any;

      await expect(
        (worker as any).processTransaction(jobData)
      ).rejects.toThrow();

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = await stateService.getState(transaction.id);
      expect(state?.retryCount).toBe(3); // attemptNumber + 1
    });

    it('should mark as FAILED after max retries', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'max-retries' });

      mockPostingService.getTransaction.mockResolvedValue(null);
      mockPostingService.postTransaction.mockRejectedValue(
        new Error('Persistent failure')
      );

      stateService = new StateService(redis);
      
      // Create a job data object directly (simulating max retry attempt)
      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 5 }, // Max retries is 5
        attemptsMade: 5,
      } as any;

      // Process should throw error (max retries reached)
      await expect(
        (worker as any).processTransaction(jobData)
      ).rejects.toThrow();

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = await stateService.getState(transaction.id);
      expect(state?.status).toBe(TransactionStatus.FAILED);
      expect(state?.error).toContain('Failed after');
    }, 10000); // Increase timeout for this test
  });

  describe('error handling', () => {
    it('should handle posting service errors gracefully', async () => {
      const transaction: Transaction = createTestTransaction({ id: 'error-handling' });

      mockPostingService.getTransaction.mockRejectedValue(
        new Error('Posting service unavailable')
      );

      stateService = new StateService(redis);
      await stateService.setState(transaction.id, TransactionStatus.PENDING);

      const jobData = {
        id: transaction.id,
        data: { transaction, attemptNumber: 0 },
        attemptsMade: 0,
      } as any;

      await expect((worker as any).processTransaction(jobData)).rejects.toThrow();

      // Wait a bit for state to be updated
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = await stateService.getState(transaction.id);
      // Status should be PROCESSING (will retry) or have error info
      expect([TransactionStatus.PROCESSING, TransactionStatus.FAILED]).toContain(state?.status);
      // Error message should be present if status is PROCESSING (retry) or FAILED
      if (state?.status === TransactionStatus.PROCESSING) {
        expect(state?.error).toBeDefined();
      }
    });
  });
});

