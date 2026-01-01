import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config';
import { TransactionStatus } from '../models/transaction';
import { QueueService, QueueJobData } from '../services/queueService';
import { StateService } from '../services/stateService';
import { PostingService } from '../services/postingService';
import { calculateBackoffDelay, sleep } from '../utils/retry';

export class TransactionWorker {
  private worker: Worker<QueueJobData>;
  private postingService: PostingService;
  private stateService: StateService;
  private queueService: QueueService;

  constructor(redis: Redis, queueService: QueueService) {
    this.postingService = new PostingService();
    this.stateService = new StateService(redis);
    this.queueService = queueService;

    this.worker = new Worker<QueueJobData>(
      config.queue.name,
      async (job: Job<QueueJobData>) => {
        await this.processTransaction(job);
      },
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
        },
        concurrency: config.queue.workerConcurrency,
      }
    );

    this.setupErrorHandling();
  }

  /**
   * Process a transaction job
   */
  private async processTransaction(job: Job<QueueJobData>): Promise<void> {
    const { transaction, attemptNumber } = job.data;

    try {
      // Update status to processing
      await this.stateService.setState(transaction.id, TransactionStatus.PROCESSING, undefined, attemptNumber);

      // Step 1: Idempotency check - GET before POST
      const existing = await this.postingService.getTransaction(transaction.id);

      if (existing) {
        // Transaction already exists in posting service
        await this.stateService.setState(transaction.id, TransactionStatus.COMPLETED);
        return;
      }

      // Step 2: POST transaction to posting service
      try {
        await this.postingService.postTransaction(transaction);
        await this.stateService.setState(transaction.id, TransactionStatus.COMPLETED);
        return;
      } catch (postError) {
        // POST failed - need to distinguish pre-write vs post-write failure
        // Step 3: Verify status after POST failure
        const verifyDelay = calculateBackoffDelay(attemptNumber);
        await sleep(verifyDelay);

        const verified = await this.postingService.getTransaction(transaction.id);

        if (verified) {
          // Post-write failure: transaction was written but we got an error
          // Transaction is actually successful
          await this.stateService.setState(transaction.id, TransactionStatus.COMPLETED);
          return;
        }

        // Pre-write failure: transaction was not written
        // Re-throw to trigger retry mechanism
        throw postError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if we should retry
      if (attemptNumber < config.queue.maxRetries) {
        // Will be retried by BullMQ with exponential backoff
        await this.stateService.setState(
          transaction.id,
          TransactionStatus.PROCESSING,
          `Retrying: ${errorMessage}`,
          attemptNumber + 1
        );
        throw error; // Re-throw to trigger retry
      } else {
        // Max retries reached
        await this.stateService.setState(
          transaction.id,
          TransactionStatus.FAILED,
          `Failed after ${config.queue.maxRetries} retries: ${errorMessage}`,
          attemptNumber
        );
        throw error;
      }
    }
  }

  /**
   * Setup error handling for the worker
   */
  private setupErrorHandling(): void {
    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
  }
}

