import { FastifyInstance, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { QueueService } from '../../services/queueService';

export async function healthRoutes(fastify: FastifyInstance, options: { redis: Redis; queueService: QueueService }) {
  // GET /api/health - Health check and metrics
  fastify.get('/api/health', async (_request, reply: FastifyReply) => {
    try {
      // Check Redis connection
      const redisHealthy = await options.redis.ping().then(() => true).catch(() => false);

      // Get queue metrics
      const queueMetrics = await options.queueService.getMetrics();

      const health = {
        status: redisHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          redis: {
            status: redisHealthy ? 'up' : 'down',
          },
          queue: {
            status: 'up',
            metrics: queueMetrics,
          },
        },
      };

      reply.code(redisHealthy ? 200 : 503).send(health);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(error, 'Health check failed');

      reply.code(503).send({
        status: 'unhealthy',
        error: errorMessage,
      });
    }
  });
}

