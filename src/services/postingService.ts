import { config } from '../config';
import { Transaction } from '../models/transaction';

export interface PostingServiceResponse {
  id: string;
  amount: number;
  currency: string;
  status?: string;
  createdAt?: string;
  description?: string;
  timestamp?: string;
}

export class PostingService {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = config.postingService.url;
    this.timeout = config.postingService.timeout;
  }

  /**
   * Check if a transaction exists in the posting service
   * @param transactionId - The transaction ID to check
   * @returns Transaction data if exists, null if not found
   */
  async getTransaction(transactionId: string): Promise<PostingServiceResponse | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/transactions/${transactionId}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get transaction: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as PostingServiceResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Timeout getting transaction ${transactionId}`);
      }
      throw error;
    }
  }

  /**
   * Post a transaction to the posting service
   * @param transaction - The transaction to post
   * @returns Posted transaction data
   */
  async postTransaction(transaction: Transaction): Promise<PostingServiceResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Prepare the posting request with all required fields
      const postingRequest: Record<string, unknown> = {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        timestamp: transaction.timestamp,
      };

      // Include metadata if provided
      if (transaction.metadata) {
        postingRequest.metadata = transaction.metadata;
      }

      const response = await fetch(`${this.baseUrl}/transactions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postingRequest),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to post transaction: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as PostingServiceResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Timeout posting transaction ${transaction.id}`);
      }
      throw error;
    }
  }

  /**
   * Cleanup all transactions from the posting service
   * Useful for resetting state in integration tests
   * @returns Number of deleted records
   */
  async cleanup(): Promise<{ count: number }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/cleanup`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to cleanup: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as { count: number };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Timeout during cleanup');
      }
      throw error;
    }
  }
}

