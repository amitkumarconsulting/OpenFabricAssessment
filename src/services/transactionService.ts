import { Transaction, TransactionRequest, TransactionResponse, TransactionStatus } from '../models/transaction';
import { QueueService } from './queueService';
import { StateService } from './stateService';
import { generateIdempotencyKey } from '../utils/idempotency';
import { Redis } from 'ioredis';

export class TransactionService {
  private queueService: QueueService;
  private stateService: StateService;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.queueService = new QueueService(redis);
    this.stateService = new StateService(redis);
  }

  /**
   * Submit a transaction for processing
   * Returns immediately with transaction ID
   */
  async submitTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    const transaction: Transaction = {
      id: request.id,
      amount: request.amount,
      currency: request.currency,
      description: request.description,
      timestamp: request.timestamp,
      ...(request.metadata && { metadata: request.metadata }),
    };

    const submittedAt = new Date().toISOString();

    // Check idempotency: if already processed, return existing status
    const idempotencyKey = generateIdempotencyKey(transaction.id);
    const existingProcessed = await this.stateService.isProcessed(transaction.id);

    if (existingProcessed) {
      const state = await this.stateService.getState(transaction.id);
      const response: TransactionResponse = {
        id: transaction.id,
        status: state!.status,
        submittedAt: state!.createdAt,
        message: 'Transaction already processed',
      };

      // Include completedAt if transaction is completed or failed
      if (state!.status === TransactionStatus.COMPLETED || state!.status === TransactionStatus.FAILED) {
        response.completedAt = state!.updatedAt;
      }

      // Include error if failed
      if (state!.status === TransactionStatus.FAILED && state!.error) {
        response.error = state!.error;
      }

      return response;
    }

    // Check if transaction is already in queue (deduplication)
    const isInQueue = await this.redis.exists(idempotencyKey);
    
    if (!isInQueue) {
      // Mark as being queued (idempotency check)
      await this.redis.setex(idempotencyKey, 300, '1'); // 5 minute TTL

      // Set initial state
      await this.stateService.setState(transaction.id, TransactionStatus.PENDING);

      // Enqueue for processing
      await this.queueService.enqueue(transaction, 0);
    } else {
      // Already queued, check current status
      const state = await this.stateService.getState(transaction.id);
      const status = state?.status || TransactionStatus.PENDING;

      const response: TransactionResponse = {
        id: transaction.id,
        status,
        submittedAt: state?.createdAt || submittedAt,
        message: 'Transaction already queued',
      };

      // Include completedAt if transaction is completed or failed
      if (status === TransactionStatus.COMPLETED || status === TransactionStatus.FAILED) {
        response.completedAt = state?.updatedAt;
      }

      // Include error if failed
      if (status === TransactionStatus.FAILED && state?.error) {
        response.error = state.error;
      }

      return response;
    }

    return {
      id: transaction.id,
      status: TransactionStatus.PENDING,
      submittedAt,
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<TransactionResponse | null> {
    const state = await this.stateService.getState(transactionId);

    if (!state) {
      return null;
    }

    const response: TransactionResponse = {
      id: state.id,
      status: state.status,
      submittedAt: state.createdAt,
    };

    // Include completedAt if transaction is completed or failed
    if (state.status === TransactionStatus.COMPLETED || state.status === TransactionStatus.FAILED) {
      response.completedAt = state.updatedAt;
    }

    // Include error if failed
    if (state.status === TransactionStatus.FAILED && state.error) {
      response.error = state.error;
    }

    // Include message if present
    if (state.error) {
      response.message = state.error;
    }

    return response;
  }
}

