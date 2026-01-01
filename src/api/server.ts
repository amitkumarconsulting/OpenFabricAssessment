import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Redis } from 'ioredis';
import { config } from '../config';
import { transactionRoutes } from './routes/transactions';
import { healthRoutes } from './routes/health';
import { QueueService } from '../services/queueService';

export async function createServer(redis: Redis, queueService: QueueService) {
  const fastify = Fastify({
    logger: true,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register routes
  await fastify.register(transactionRoutes, { redis });
  await fastify.register(healthRoutes, { redis, queueService });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, closing server...`);
    try {
      await fastify.close();
      process.exit(0);
    } catch (error) {
      fastify.log.error(error, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify;
}

