/**
 * Script to clean up all queue data from Redis
 * Useful for cleaning up test jobs or resetting the queue
 * 
 * Usage: tsx scripts/cleanup-queue.ts
 */

import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../src/config';

async function cleanupQueue() {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  });

  try {
    console.log('Connecting to Redis...');
    await redis.ping();
    console.log('Connected to Redis');

    // Create queue instance
    const queue = new Queue(config.queue.name, {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
    });

    console.log(`Cleaning up queue: ${config.queue.name}`);

    // Pause queue
    await queue.pause();
    console.log('Queue paused');

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Obliterate all jobs
    await queue.obliterate({ force: true });
    console.log('Queue obliterated');

    // Resume queue
    await queue.resume();
    console.log('Queue resumed');

    // Clean up any remaining queue keys
    const queueKeys = await redis.keys(`bull:${config.queue.name}:*`);
    if (queueKeys.length > 0) {
      console.log(`Found ${queueKeys.length} remaining queue keys, cleaning up...`);
      await redis.del(...queueKeys);
      console.log('Remaining keys cleaned up');
    }

    // Also clean up idempotency keys from tests
    const idempotencyKeys = await redis.keys('idempotency:*');
    if (idempotencyKeys.length > 0) {
      console.log(`Found ${idempotencyKeys.length} idempotency keys, cleaning up...`);
      await redis.del(...idempotencyKeys);
      console.log('Idempotency keys cleaned up');
    }

    // Clean up transaction state keys from tests
    const stateKeys = await redis.keys('transaction:state:*');
    if (stateKeys.length > 0) {
      console.log(`Found ${stateKeys.length} transaction state keys, cleaning up...`);
      await redis.del(...stateKeys);
      console.log('Transaction state keys cleaned up');
    }

    await queue.close();
    await redis.quit();
    console.log('Cleanup complete!');
  } catch (error) {
    console.error('Error during cleanup:', error);
    await redis.quit();
    process.exit(1);
  }
}

cleanupQueue();

