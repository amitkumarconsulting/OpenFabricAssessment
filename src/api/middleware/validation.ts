// Type declarations for modules (will be available after npm install)
// @ts-ignore - Type definitions will be available after npm install
import { FastifyRequest, FastifyReply } from 'fastify';
// @ts-ignore - Type definitions will be available after npm install
import { z } from 'zod';

const transactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  description: z.string().min(1, 'Description is required'),
  timestamp: z.string().datetime('Timestamp must be a valid ISO 8601 datetime'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedTransactionRequest = z.infer<typeof transactionSchema>;

// Type guard for Zod errors
function isZodError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}

export async function validateTransaction(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const validated = transactionSchema.parse(request.body);
    request.body = validated;
  } catch (error: unknown) {
    // Check if it's a Zod validation error
    if (isZodError(error)) {
      reply.code(400).send({
        error: 'Validation failed',
        details: error.issues,
      });
      return;
    }
    // Re-throw other errors
    throw error;
  }
}

