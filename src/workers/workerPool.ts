import { Redis } from 'ioredis';
import { TransactionWorker } from './transactionWorker';
import { QueueService } from '../services/queueService';
import { config } from '../config';

export class WorkerPool {
  private workers: TransactionWorker[] = [];
  private redis: Redis;
  private queueService: QueueService;
  private concurrency: number;

  constructor(redis: Redis, queueService: QueueService) {
    this.redis = redis;
    this.queueService = queueService;
    this.concurrency = config.queue.workerConcurrency;
  }

  /**
   * Start the worker pool
   */
  start(): void {
    console.log(`Starting worker pool with ${this.concurrency} workers`);

    // Create workers (BullMQ handles concurrency internally, so we only need one worker instance)
    // But we can create multiple if needed for different queues or isolation
    const worker = new TransactionWorker(this.redis, this.queueService);
    this.workers.push(worker);

    console.log('Worker pool started');
  }

  /**
   * Stop all workers
   */
  async stop(): Promise<void> {
    console.log('Stopping worker pool...');
    
    await Promise.all(this.workers.map((worker) => worker.close()));
    
    this.workers = [];
    console.log('Worker pool stopped');
  }

  /**
   * Get number of active workers
   */
  getWorkerCount(): number {
    return this.workers.length;
  }
}

