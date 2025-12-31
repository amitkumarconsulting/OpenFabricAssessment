import { FastifyInstance } from "fastify";
import { redis } from "../../config";
import { getQueueMetrics } from "../../services/queueService";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    const redisPing = await redis.ping();
    const queueMetrics = await getQueueMetrics();

    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: {
          status: redisPing === "PONG" ? "up" : "down",
        },
        queue: {
          status: "up",
          metrics: queueMetrics,
        },
      },
    };
  });
}
