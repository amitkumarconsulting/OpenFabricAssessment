import { Transaction, TransactionRequest, TransactionStatus } from '../../src/models/transaction';

/**
 * Common test utilities for generating test data and helpers
 */

/**
 * Generate a random transaction ID
 */
export function generateTestTransactionId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a test transaction request
 */
export function createTestTransactionRequest(
  overrides?: Partial<TransactionRequest>
): TransactionRequest {
  return {
    id: generateTestTransactionId(),
    amount: 100.50,
    currency: 'USD',
    description: 'Test transaction',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test transaction
 */
export function createTestTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    id: generateTestTransactionId(),
    amount: 100.50,
    currency: 'USD',
    description: 'Test transaction',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for a transaction to reach a specific status
 */
export async function waitForTransactionStatus(
  getStatus: () => Promise<TransactionStatus | null>,
  expectedStatus: TransactionStatus,
  timeout: number = 5000
): Promise<void> {
  await waitFor(async () => {
    const status = await getStatus();
    return status === expectedStatus;
  }, timeout);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create multiple test transactions
 */
export function createTestTransactions(count: number): Transaction[] {
  return Array.from({ length: count }, (_, i) =>
    createTestTransaction({ id: `test-${i}-${Date.now()}` })
  );
}

/**
 * Assert that a value is within a range
 */
export function expectWithinRange(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      message || `Expected ${value} to be between ${min} and ${max}`
    );
  }
}

/**
 * Retry a function until it succeeds or times out
 */
export async function retryUntilSuccess<T>(
  fn: () => Promise<T>,
  timeout: number = 5000,
  interval: number = 100
): Promise<T> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(interval);
    }
  }

  throw lastError || new Error('Retry timeout');
}

