import { redis } from "../config";
import { TransactionState, TransactionStatus } from "../models/transaction";

const TXN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export class StateService {
  private static key(id: string) {
    return `txn:${id}`;
  }

  /**
   * Create a new transaction state.
   * Used by API when transaction is first received.
   */
  static async create(id: string): Promise<TransactionState | null> {
    const key = this.key(id);

    const exists = await redis.exists(key);
    if (exists) {
      return this.get(id);
    }

    const now = new Date().toISOString();

    const state: TransactionState = {
      id,
      status: "pending",
      retryCount: 0,
      submittedAt: now,
    };

    await redis.set(key, JSON.stringify(state), "EX", TXN_TTL_SECONDS);
    return state;
  }

  /**
   * Fetch transaction state.
   */
  static async get(id: string): Promise<TransactionState | null> {
    const raw = await redis.get(this.key(id));
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Update transaction status.
   */
  static async updateStatus(
    id: string,
    status: TransactionStatus,
    error?: string
  ): Promise<void> {
    const state = await this.get(id);
    if (!state) return;

    state.status = status;

    if (status === "completed") {
      state.completedAt = new Date().toISOString();
    }

    if (error) {
      state.error = error;
    }

    await redis.set(
      this.key(id),
      JSON.stringify(state),
      "EX",
      TXN_TTL_SECONDS
    );
  }

  /**
   * Increment retry count.
   */
  static async incrementRetry(id: string): Promise<number> {
    const state = await this.get(id);
    if (!state) return 0;

    state.retryCount += 1;

    await redis.set(
      this.key(id),
      JSON.stringify(state),
      "EX",
      TXN_TTL_SECONDS
    );

    return state.retryCount;
  }
}
