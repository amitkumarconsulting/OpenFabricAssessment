import { Transaction } from '../../src/models/transaction';
import { PostingServiceResponse } from '../../src/services/postingService';

/**
 * Mock posting service for unit tests
 * Can simulate various scenarios: success, failure, timeout, post-write failures
 */

export interface MockPostingServiceConfig {
  shouldSucceed?: boolean;
  shouldTimeout?: boolean;
  shouldReturnExisting?: boolean;
  existingTransaction?: PostingServiceResponse;
  errorMessage?: string;
  delay?: number;
  postWriteFailure?: boolean; // Simulate POST failure but transaction exists on GET
}

export class MockPostingService {
  private transactions: Map<string, PostingServiceResponse> = new Map();
  private config: MockPostingServiceConfig = {};
  private callHistory: Array<{ method: string; transactionId: string; timestamp: Date }> = [];

  /**
   * Configure the mock behavior
   */
  configure(config: MockPostingServiceConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset the mock to default state
   */
  reset(): void {
    this.transactions.clear();
    this.config = {};
    this.callHistory = [];
  }

  /**
   * Get call history
   */
  getCallHistory(): Array<{ method: string; transactionId: string; timestamp: Date }> {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * Manually add a transaction (for simulating existing transactions)
   */
  addTransaction(transaction: PostingServiceResponse): void {
    this.transactions.set(transaction.id, transaction);
  }

  /**
   * Remove a transaction
   */
  removeTransaction(transactionId: string): void {
    this.transactions.delete(transactionId);
  }

  /**
   * Get all transactions
   */
  getAllTransactions(): PostingServiceResponse[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Simulate GET transaction
   */
  async getTransaction(transactionId: string): Promise<PostingServiceResponse | null> {
    this.callHistory.push({
      method: 'GET',
      transactionId,
      timestamp: new Date(),
    });

    // Simulate delay if configured
    if (this.config.delay) {
      await this.sleep(this.config.delay);
    }

    // Simulate timeout
    if (this.config.shouldTimeout) {
      throw new Error(`Timeout getting transaction ${transactionId}`);
    }

    // Check if should return existing
    if (this.config.shouldReturnExisting && this.config.existingTransaction) {
      return this.config.existingTransaction;
    }

    // Check if transaction exists in mock storage
    const existing = this.transactions.get(transactionId);
    if (existing) {
      return existing;
    }

    return null;
  }

  /**
   * Simulate POST transaction
   */
  async postTransaction(transaction: Transaction): Promise<PostingServiceResponse> {
    this.callHistory.push({
      method: 'POST',
      transactionId: transaction.id,
      timestamp: new Date(),
    });

    // Simulate delay if configured
    if (this.config.delay) {
      await this.sleep(this.config.delay);
    }

    // Simulate timeout
    if (this.config.shouldTimeout) {
      throw new Error(`Timeout posting transaction ${transaction.id}`);
    }

    // Simulate post-write failure scenario
    if (this.config.postWriteFailure) {
      // Add transaction to storage (simulating it was written)
      const response: PostingServiceResponse = {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };
      this.transactions.set(transaction.id, response);
      // But throw an error (simulating network error after write)
      throw new Error(`Failed to post transaction: 500 Internal Server Error`);
    }

    // Simulate failure
    if (this.config.shouldSucceed === false) {
      throw new Error(this.config.errorMessage || `Failed to post transaction: 500 Internal Server Error`);
    }

    // Success case
    const response: PostingServiceResponse = {
      id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };

    this.transactions.set(transaction.id, response);
    return response;
  }

  /**
   * Simulate cleanup
   */
  async cleanup(): Promise<{ count: number }> {
    const count = this.transactions.size;
    this.transactions.clear();
    return { count };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a mock posting service instance
 */
export function createMockPostingService(): MockPostingService {
  return new MockPostingService();
}

