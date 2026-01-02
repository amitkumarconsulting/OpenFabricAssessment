import { Redis } from 'ioredis';
import { QueueService } from '../src/services/queueService';
import { StateService } from '../src/services/stateService';
import { config } from '../src/config';

/**
 * Test setup utilities for managing Redis connections and cleanup
 */

let testRedis: Redis | null = null;
let testQueueService: QueueService | null = null;
let testStateService: StateService | null = null;

/**
 * Get or create a Redis connection for testing
 */
export async function getTestRedis(): Promise<Redis> {
  if (!testRedis) {
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: null, // Disable retries for testing
    });
    await testRedis.connect();
  }
  return testRedis;
}

/**
 * Get or create a QueueService for testing
 */
export async function getTestQueueService(): Promise<QueueService> {
  if (!testQueueService) {
    const redis = await getTestRedis();
    testQueueService = new QueueService(redis);
  }
  return testQueueService;
}

/**
 * Get or create a StateService for testing
 */
export async function getTestStateService(): Promise<StateService> {
  if (!testStateService) {
    const redis = await getTestRedis();
    testStateService = new StateService(redis);
  }
  return testStateService;
}

/**
 * Clean up all Redis data (useful for test isolation)
 */
export async function cleanupRedis(): Promise<void> {
  const redis = await getTestRedis();
  const keys = await redis.keys('*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Clean up queue data
 */
export async function cleanupQueue(): Promise<void> {
  const queueService = await getTestQueueService();
  const queue = queueService.getQueue();
  
  try {
    // Pause queue before obliterating
    await queue.pause();
    // Wait a bit for pause to take effect
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Remove all jobs
    await queue.obliterate({ force: true });
    // Resume queue
    await queue.resume();
  } catch (error) {
    // If queue is already paused or doesn't exist, try to resume and continue
    try {
      await queue.resume();
    } catch {
      // Ignore resume errors
    }
  }
  
  // Also clean up any remaining queue keys in Redis
  const redis = await getTestRedis();
  const queueKeys = await redis.keys(`bull:${config.queue.name}:*`);
  if (queueKeys.length > 0) {
    await redis.del(...queueKeys);
  }
}

/**
 * Close all test connections
 */
export async function closeTestConnections(): Promise<void> {
  if (testQueueService) {
    try {
      await testQueueService.close();
    } catch (error) {
      // Ignore errors if already closed
    }
    testQueueService = null;
  }
  
  if (testRedis) {
    try {
      // Check if connection is still open
      if (testRedis.status === 'ready' || testRedis.status === 'connecting') {
        await testRedis.quit();
      }
    } catch (error) {
      // Ignore errors if already closed
    }
    testRedis = null;
  }
  
  testStateService = null;
}

/**
 * Setup before all tests
 */
export async function setupTests(): Promise<void> {
  // Ensure Redis is available
  try {
    const redis = await getTestRedis();
    await redis.ping();
  } catch (error) {
    throw new Error(
      'Redis is not available. Please start Redis using: cd docker && docker-compose up -d'
    );
  }
}

/**
 * Teardown after all tests
 */
export async function teardownTests(): Promise<void> {
  await closeTestConnections();
}

