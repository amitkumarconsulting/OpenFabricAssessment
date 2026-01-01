import { Redis } from 'ioredis';
import { config } from '../config';
import { TransactionStatus, TransactionState } from '../models/transaction';

const STATE_TTL = 24 * 60 * 60; // 24 hours in seconds

export class StateService {
  private redis: Redis;
  private keyPrefix = 'transaction:state:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get transaction state
   */
  async getState(transactionId: string): Promise<TransactionState | null> {
    const key = `${this.keyPrefix}${transactionId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as TransactionState;
  }

  /**
   * Set transaction state
   */
  async setState(
    transactionId: string,
    status: TransactionStatus,
    error?: string,
    retryCount?: number
  ): Promise<void> {
    const key = `${this.keyPrefix}${transactionId}`;
    const now = new Date().toISOString();

    // Get existing state to preserve createdAt
    const existing = await this.getState(transactionId);

    const state: TransactionState = {
      id: transactionId,
      status,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...(retryCount !== undefined && { retryCount }),
      ...(error && { error }),
    };

    await this.redis.setex(key, STATE_TTL, JSON.stringify(state));
  }

  /**
   * Check if transaction is already processed (completed or failed)
   */
  async isProcessed(transactionId: string): Promise<boolean> {
    const state = await this.getState(transactionId);
    return state?.status === TransactionStatus.COMPLETED || state?.status === TransactionStatus.FAILED;
  }

  /**
   * Delete transaction state (useful for cleanup)
   */
  async deleteState(transactionId: string): Promise<void> {
    const key = `${this.keyPrefix}${transactionId}`;
    await this.redis.del(key);
  }

  /**
   * Get all transaction states (for health/metrics)
   */
  async getAllStates(): Promise<TransactionState[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    
    if (keys.length === 0) {
      return [];
    }

    const values = await this.redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v) as TransactionState);
  }
}