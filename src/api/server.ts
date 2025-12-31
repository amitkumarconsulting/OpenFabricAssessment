import Fastify from "fastify";
import cors from "@fastify/cors";

import { transactionRoutes } from "./routes/transactions";
import { healthRoutes } from "./routes/health";

export const server = Fastify({
  logger: true,
});

export async function buildServer() {
  await server.register(cors, { origin: true });

  await server.register(transactionRoutes);
  await server.register(healthRoutes);

  return server;
}
