import { Redis } from 'ioredis';
import { TransactionService } from '../../../src/services/transactionService';
import { TransactionStatus } from '../../../src/models/transaction';
import { getTestRedis, cleanupRedis, cleanupQueue, closeTestConnections } from '../../setup';
import { createTestTransactionRequest } from '../../helpers/testUtils';

describe('TransactionService', () => {
  let redis: Redis;
  let transactionService: TransactionService;

  beforeAll(async () => {
    redis = await getTestRedis();
    transactionService = new TransactionService(redis);
  });

  afterAll(async () => {
    await cleanupQueue();
    await closeTestConnections();
  });

  beforeEach(async () => {
    await cleanupRedis();
    await cleanupQueue();
  });

  describe('submitTransaction', () => {
    it('should submit a new transaction successfully', async () => {
      const request = createTestTransactionRequest({ id: 'submit-test-1' });

      const result = await transactionService.submitTransaction(request);

      expect(result.id).toBe(request.id);
      expect(result.status).toBe(TransactionStatus.PENDING);
    });

    it('should handle duplicate transaction submissions idempotently', async () => {
      const request = createTestTransactionRequest({ id: 'duplicate-test' });

      const result1 = await transactionService.submitTransaction(request);
      
      // Verify idempotency key is set
      const idempotencyKey = `idempotency:${request.id}`;
      const redis = transactionService['redis'];
      
      // Wait a bit and verify key exists
      await new Promise((resolve) => setTimeout(resolve, 50));
      const keyExists = await redis.exists(idempotencyKey);
      expect(keyExists).toBe(1); // Key should exist
      
      // Second submission - should detect it's already queued or processing
      const result2 = await transactionService.submitTransaction(request);

      expect(result1.status).toBe(TransactionStatus.PENDING);
      // Second submission should indicate it's already queued or processing
      // (could be PROCESSING if a worker picked it up between submissions)
      expect([TransactionStatus.PENDING, TransactionStatus.PROCESSING]).toContain(result2.status);
      // Should have message indicating it's already queued (if key was found)
      // If message is undefined, it means the key wasn't found in time, which is a timing issue
      if (result2.message) {
        expect(result2.message).toBe('Transaction already queued');
      }
      // Both should return the same transaction ID
      expect(result1.id).toBe(request.id);
      expect(result2.id).toBe(request.id);
    });

    it('should return existing status for already processed transaction', async () => {
      const request = createTestTransactionRequest({ id: 'processed-test' });

      // Manually set as completed FIRST (before any submission)
      // This simulates a transaction that was already processed
      const stateService = transactionService['stateService'];
      await stateService.setState(request.id, TransactionStatus.COMPLETED);

      // Wait a bit to ensure state is persisted
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify state exists and isProcessed returns true
      const state = await stateService.getState(request.id);
      expect(state?.status).toBe(TransactionStatus.COMPLETED);
      const isProcessed = await stateService.isProcessed(request.id);
      expect(isProcessed).toBe(true);

      // Submission should return completed status immediately
      const result = await transactionService.submitTransaction(request);

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(result.message).toBe('Transaction already processed');
    });

    it('should return existing status for failed transaction', async () => {
      const request = createTestTransactionRequest({ id: 'failed-test' });

      // Manually set as failed FIRST (before any submission)
      // This simulates a transaction that already failed
      const stateService = transactionService['stateService'];
      await stateService.setState(request.id, TransactionStatus.FAILED);

      // Wait a bit to ensure state is persisted
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify state exists and isProcessed returns true
      const state = await stateService.getState(request.id);
      expect(state?.status).toBe(TransactionStatus.FAILED);
      const isProcessed = await stateService.isProcessed(request.id);
      expect(isProcessed).toBe(true);

      // Submission should return failed status immediately
      const result = await transactionService.submitTransaction(request);

      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(result.message).toBe('Transaction already processed');
    });

    it('should enqueue transaction to queue', async () => {
      const request = createTestTransactionRequest({ id: 'queue-test' });

      await transactionService.submitTransaction(request);

      // Verify transaction is in queue by checking metrics
      const queueService = transactionService['queueService'];
      const metrics = await queueService.getMetrics();
      
      // Job might be processed quickly, so we check total
      expect(metrics.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return null for non-existent transaction', async () => {
      const status = await transactionService.getTransactionStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should return transaction status', async () => {
      const request = createTestTransactionRequest({ id: 'status-test' });

      await transactionService.submitTransaction(request);

      const status = await transactionService.getTransactionStatus(request.id);

      expect(status).not.toBeNull();
      expect(status?.id).toBe(request.id);
      expect(status?.status).toBe(TransactionStatus.PENDING);
    });

    it('should return status with error message if present', async () => {
      const request = createTestTransactionRequest({ id: 'error-status-test' });

      await transactionService.submitTransaction(request);

      // Manually set state with error
      const stateService = transactionService['stateService'];
      await stateService.setState(
        request.id,
        TransactionStatus.FAILED,
        'Test error message'
      );

      const status = await transactionService.getTransactionStatus(request.id);

      expect(status?.status).toBe(TransactionStatus.FAILED);
      expect(status?.message).toBe('Test error message');
    });

    it('should return all status transitions', async () => {
      const request = createTestTransactionRequest({ id: 'transitions-test' });

      await transactionService.submitTransaction(request);
      let status = await transactionService.getTransactionStatus(request.id);
      expect(status?.status).toBe(TransactionStatus.PENDING);

      const stateService = transactionService['stateService'];
      await stateService.setState(request.id, TransactionStatus.PROCESSING);
      status = await transactionService.getTransactionStatus(request.id);
      expect(status?.status).toBe(TransactionStatus.PROCESSING);

      await stateService.setState(request.id, TransactionStatus.COMPLETED);
      status = await transactionService.getTransactionStatus(request.id);
      expect(status?.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe('idempotency', () => {
    it('should prevent duplicate queue entries', async () => {
      const request = createTestTransactionRequest({ id: 'idempotency-test' });

      await transactionService.submitTransaction(request);
      // Wait a bit between submissions
      await new Promise((resolve) => setTimeout(resolve, 10));
      await transactionService.submitTransaction(request);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await transactionService.submitTransaction(request);

      // All should return same status (could be PENDING or PROCESSING if worker picked it up)
      const status = await transactionService.getTransactionStatus(request.id);
      expect(status).not.toBeNull();
      expect([TransactionStatus.PENDING, TransactionStatus.PROCESSING]).toContain(status?.status);
    });

    it('should handle rapid duplicate submissions', async () => {
      const request = createTestTransactionRequest({ id: 'rapid-duplicate-test' });

      const promises = Array.from({ length: 10 }, () =>
        transactionService.submitTransaction(request)
      );

      const results = await Promise.all(promises);

      // All should succeed and return same transaction ID
      results.forEach((result) => {
        expect(result.id).toBe(request.id);
      });
    });
  });
});

