import { Redis } from 'ioredis';
import { StateService } from '../../../src/services/stateService';
import { TransactionStatus } from '../../../src/models/transaction';
import { getTestRedis, cleanupRedis, closeTestConnections } from '../../setup';

describe('StateService', () => {
  let redis: Redis;
  let stateService: StateService;

  beforeAll(async () => {
    redis = await getTestRedis();
    stateService = new StateService(redis);
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  beforeEach(async () => {
    await cleanupRedis();
  });

  describe('setState and getState', () => {
    it('should set and get transaction state', async () => {
      const transactionId = 'test-123';

      await stateService.setState(transactionId, TransactionStatus.PENDING);
      // Wait a bit to ensure Redis has persisted the state
      await new Promise((resolve) => setTimeout(resolve, 10));
      const state = await stateService.getState(transactionId);

      expect(state).not.toBeNull();
      expect(state?.id).toBe(transactionId);
      expect(state?.status).toBe(TransactionStatus.PENDING);
      expect(state?.createdAt).toBeDefined();
      expect(state?.updatedAt).toBeDefined();
    });

    it('should preserve createdAt when updating state', async () => {
      const transactionId = 'test-456';

      await stateService.setState(transactionId, TransactionStatus.PENDING);
      // Wait a bit to ensure state is persisted
      await new Promise((resolve) => setTimeout(resolve, 50));
      const initialState = await stateService.getState(transactionId);
      const createdAt = initialState?.createdAt;

      expect(createdAt).toBeDefined();

      // Wait a bit to ensure updatedAt will be different
      await new Promise((resolve) => setTimeout(resolve, 50));

      await stateService.setState(transactionId, TransactionStatus.PROCESSING);
      // Wait a bit to ensure state is persisted
      await new Promise((resolve) => setTimeout(resolve, 50));
      const updatedState = await stateService.getState(transactionId);

      // createdAt should be preserved (same value, allowing for small timing differences)
      // Compare as dates to handle potential millisecond differences
      const createdAtDate = new Date(createdAt!);
      const updatedCreatedAtDate = new Date(updatedState!.createdAt);
      expect(updatedCreatedAtDate.getTime()).toBe(createdAtDate.getTime());
      
      // updatedAt should be different from createdAt
      expect(updatedState?.updatedAt).not.toBe(createdAt);
      // updatedAt should be a valid ISO string
      expect(updatedState?.updatedAt).toBeDefined();
      // updatedAt should be after createdAt
      expect(new Date(updatedState!.updatedAt).getTime()).toBeGreaterThan(
        new Date(createdAt!).getTime()
      );
    });

    it('should update state with error message', async () => {
      const transactionId = 'test-error';

      await stateService.setState(
        transactionId,
        TransactionStatus.FAILED,
        'Test error message'
      );
      const state = await stateService.getState(transactionId);

      expect(state?.status).toBe(TransactionStatus.FAILED);
      expect(state?.error).toBe('Test error message');
    });

    it('should update state with retry count', async () => {
      const transactionId = 'test-retry';

      await stateService.setState(
        transactionId,
        TransactionStatus.PROCESSING,
        undefined,
        3
      );
      const state = await stateService.getState(transactionId);

      expect(state?.retryCount).toBe(3);
    });

    it('should return null for non-existent transaction', async () => {
      const state = await stateService.getState('non-existent');
      expect(state).toBeNull();
    });
  });

  describe('isProcessed', () => {
    it('should return false for pending transaction', async () => {
      const transactionId = 'test-pending';
      await stateService.setState(transactionId, TransactionStatus.PENDING);

      const isProcessed = await stateService.isProcessed(transactionId);
      expect(isProcessed).toBe(false);
    });

    it('should return false for processing transaction', async () => {
      const transactionId = 'test-processing';
      await stateService.setState(transactionId, TransactionStatus.PROCESSING);

      const isProcessed = await stateService.isProcessed(transactionId);
      expect(isProcessed).toBe(false);
    });

    it('should return true for completed transaction', async () => {
      const transactionId = 'test-completed';
      await stateService.setState(transactionId, TransactionStatus.COMPLETED);

      const isProcessed = await stateService.isProcessed(transactionId);
      expect(isProcessed).toBe(true);
    });

    it('should return true for failed transaction', async () => {
      const transactionId = 'test-failed';
      await stateService.setState(transactionId, TransactionStatus.FAILED);

      const isProcessed = await stateService.isProcessed(transactionId);
      expect(isProcessed).toBe(true);
    });

    it('should return false for non-existent transaction', async () => {
      const isProcessed = await stateService.isProcessed('non-existent');
      expect(isProcessed).toBe(false);
    });
  });

  describe('deleteState', () => {
    it('should delete transaction state', async () => {
      const transactionId = 'test-delete';
      await stateService.setState(transactionId, TransactionStatus.PENDING);

      let state = await stateService.getState(transactionId);
      expect(state).not.toBeNull();

      await stateService.deleteState(transactionId);
      state = await stateService.getState(transactionId);
      expect(state).toBeNull();
    });

    it('should not throw when deleting non-existent state', async () => {
      await expect(stateService.deleteState('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getAllStates', () => {
    it('should return empty array when no states exist', async () => {
      // Ensure cleanup before this test
      const keys = await redis.keys('transaction:state:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      const states = await stateService.getAllStates();
      expect(states).toEqual([]);
    });

    it('should return all transaction states', async () => {
      await stateService.setState('txn-1', TransactionStatus.PENDING);
      await stateService.setState('txn-2', TransactionStatus.PROCESSING);
      await stateService.setState('txn-3', TransactionStatus.COMPLETED);

      const states = await stateService.getAllStates();
      expect(states.length).toBeGreaterThanOrEqual(3);

      const ids = states.map((s) => s.id);
      expect(ids).toContain('txn-1');
      expect(ids).toContain('txn-2');
      expect(ids).toContain('txn-3');
    });
  });

  describe('TTL handling', () => {
    it('should set state with TTL', async () => {
      const transactionId = 'test-ttl';
      await stateService.setState(transactionId, TransactionStatus.PENDING);

      const state = await stateService.getState(transactionId);
      expect(state).not.toBeNull();

      // State should expire after 24 hours (we can't easily test this without waiting)
      // But we can verify the key exists with TTL
      const key = `transaction:state:${transactionId}`;
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60); // 24 hours
    });
  });
});

