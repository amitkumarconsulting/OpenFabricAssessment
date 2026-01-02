import {
  generateIdempotencyKey,
  generateTransactionId,
} from '../../../src/utils/idempotency';

describe('Idempotency utilities', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate idempotency key with transaction ID', () => {
      const transactionId = 'test-123';
      const key = generateIdempotencyKey(transactionId);

      expect(key).toBe('idempotency:test-123');
    });

    it('should generate consistent keys for same transaction ID', () => {
      const transactionId = 'consistent-test';
      const key1 = generateIdempotencyKey(transactionId);
      const key2 = generateIdempotencyKey(transactionId);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different transaction IDs', () => {
      const key1 = generateIdempotencyKey('txn-1');
      const key2 = generateIdempotencyKey('txn-2');

      expect(key1).not.toBe(key2);
    });

    it('should handle empty transaction ID', () => {
      const key = generateIdempotencyKey('');
      expect(key).toBe('idempotency:');
    });

    it('should handle special characters in transaction ID', () => {
      const transactionId = 'txn-123:456@789';
      const key = generateIdempotencyKey(transactionId);

      expect(key).toBe('idempotency:txn-123:456@789');
    });
  });

  describe('generateTransactionId', () => {
    it('should generate a transaction ID', () => {
      const id = generateTransactionId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique transaction IDs', () => {
      const id1 = generateTransactionId();
      const id2 = generateTransactionId();
      const id3 = generateTransactionId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate UUID format', () => {
      const id = generateTransactionId();
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(id).toMatch(uuidRegex);
    });

    it('should generate different IDs on multiple calls', () => {
      const ids = Array.from({ length: 100 }, () => generateTransactionId());
      const uniqueIds = new Set(ids);

      // All IDs should be unique
      expect(uniqueIds.size).toBe(100);
    });
  });
});

