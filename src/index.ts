import { Redis } from 'ioredis';
import { config } from './config';
import { createServer } from './api/server';
import { QueueService } from './services/queueService';
import { WorkerPool } from './workers/workerPool';

async function main() {
  // Initialize Redis connection
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  try {
    // Initialize queue service
    const queueService = new QueueService(redis);

    // Start worker pool
    const workerPool = new WorkerPool(redis, queueService);
    workerPool.start();

    // Create and start Fastify server
    const server = await createServer(redis, queueService);
    
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    console.log(`Server listening on ${config.server.host}:${config.server.port}`);
    console.log(`Queue: ${config.queue.name}`);
    console.log(`Worker concurrency: ${config.queue.workerConcurrency}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    await redis.quit();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

