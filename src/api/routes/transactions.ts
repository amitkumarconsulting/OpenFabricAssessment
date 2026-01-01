import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TransactionService } from '../../services/transactionService';
import { Redis } from 'ioredis';
import { validateTransaction, ValidatedTransactionRequest } from '../middleware/validation';

interface TransactionParams {
  id: string;
}

export async function transactionRoutes(fastify: FastifyInstance, options: { redis: Redis }) {
  const transactionService = new TransactionService(options.redis);

  // POST /api/transactions - Submit a transaction
  fastify.post(
    '/api/transactions',
    {
      preHandler: validateTransaction,
    },
    async (request: FastifyRequest<{ Body: ValidatedTransactionRequest }>, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        const transactionRequest = request.body;
        const result = await transactionService.submitTransaction(transactionRequest);

        const elapsed = Date.now() - startTime;

        // Return 202 Accepted immediately (< 100ms target)
        reply.code(202).send({
          ...result,
          message: result.message || 'Transaction accepted for processing',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error(error, 'Error submitting transaction');
        
        reply.code(500).send({
          error: 'Failed to submit transaction',
          message: errorMessage,
        });
      }
    }
  );

  // GET /api/transactions/:id - Get transaction status
  fastify.get(
    '/api/transactions/:id',
    async (request: FastifyRequest<{ Params: TransactionParams }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const status = await transactionService.getTransactionStatus(id);

        if (!status) {
          reply.code(404).send({
            error: 'Transaction not found',
          });
          return;
        }

        reply.send(status);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error(error, 'Error getting transaction status');
        
        reply.code(500).send({
          error: 'Failed to get transaction status',
          message: errorMessage,
        });
      }
    }
  );
}

