import { z } from "zod";

export const transactionSchema = z.object({
  id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  description: z.string().optional(),
  timestamp: z.string().datetime(),
});
