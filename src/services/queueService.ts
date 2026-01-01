import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config';
import { Transaction } from '../models/transaction';

export interface QueueJobData {
  transaction: Transaction;
  attemptNumber: number;
}

export class QueueService {
  private queue: Queue<QueueJobData>;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.queue = new Queue<QueueJobData>(config.queue.name, {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
      defaultJobOptions: {
        attempts: config.queue.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600, // Keep failed jobs for 24 hours
        },
      },
    });
  }

  /**
   * Add a transaction to the queue
   */
  async enqueue(transaction: Transaction, attemptNumber: number = 0): Promise<string> {
    const job = await this.queue.add('process-transaction', {
      transaction,
      attemptNumber,
    }, {
      jobId: transaction.id, // Use transaction ID as job ID for idempotency
    });

    return job.id!;
  }

  /**
   * Get queue metrics
   */
  async getMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get the queue instance (for workers)
   */
  getQueue(): Queue<QueueJobData> {
    return this.queue;
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}

