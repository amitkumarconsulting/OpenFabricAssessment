import crypto from 'crypto';

/**
 * Generate a deterministic idempotency key from transaction data
 */
export function generateIdempotencyKey(transactionId: string): string {
  return `idempotency:${transactionId}`;
}

/**
 * Generate a unique transaction ID if not provided
 */
export function generateTransactionId(): string {
  return crypto.randomUUID();
}

