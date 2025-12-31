import { FastifyInstance } from "fastify";
import { transactionSchema } from "../middleware/validation";
import { StateService } from "../../services/stateService";
import { enqueueTransaction } from "../../services/queueService";

export async function transactionRoutes(app: FastifyInstance) {
  /**
   * POST /api/transactions
   * Accept transaction and return immediately
   */
  app.post("/api/transactions", async (req, reply) => {
    const parsed = transactionSchema.safeParse(req.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request payload",
        details: parsed.error.errors,
      });
    }

    const transaction = parsed.data;

    // Idempotency: create or fetch existing state
    const state = await StateService.create(transaction.id);

    // If already completed or processing, return current state
    if (state && state.status !== "pending") {
      return reply.status(200).send(state);
    }

    // Enqueue for async processing
    await enqueueTransaction(transaction);

    return reply.status(202).send({
      id: transaction.id,
      status: "pending",
      message: "Transaction accepted for processing",
    });
  });

  /**
   * GET /api/transactions/:id
   * Fetch transaction status
   */
  app.get("/api/transactions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const state = await StateService.get(id);

    if (!state) {
      return reply.status(404).send({
        error: "Transaction not found",
      });
    }

    return reply.status(200).send(state);
  });
}
