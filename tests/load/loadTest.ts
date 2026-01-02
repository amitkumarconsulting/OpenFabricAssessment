/**
 * Load testing script for the transaction processing system
 * 
 * Usage: npm run load-test
 * 
 * This script sends multiple concurrent requests to test the system's
 * ability to handle high throughput (target: 1000+ TPS)
 */

// Using native fetch (Node.js 18+)

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TARGET_TPS = parseInt(process.env.TARGET_TPS || '1000', 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SEC || '10', 10);

interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  responseTimes: number[];
  errors: Array<{ error: string; count: number }>;
}

function generateTransactionId(): string {
  return `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function submitTransaction(): Promise<{ success: boolean; responseTime: number; error?: string }> {
  const startTime = Date.now();
  const transactionId = generateTransactionId();

  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: transactionId,
        amount: Math.random() * 1000,
        currency: 'USD',
        description: `Load test transaction ${transactionId}`,
        timestamp: new Date().toISOString(),
      }),
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return { success: true, responseTime };
    } else {
      const error = await response.text();
      return { success: false, responseTime, error: error.substring(0, 100) };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLoadTest(): Promise<void> {
  console.log(`Starting load test...`);
  console.log(`Target: ${TARGET_TPS} TPS`);
  console.log(`Duration: ${DURATION_SECONDS} seconds`);
  console.log(`API URL: ${API_BASE_URL}\n`);

  const metrics: Metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
    responseTimes: [],
    errors: [],
  };

  const errorMap = new Map<string, number>();
  const intervalMs = 1000 / TARGET_TPS;
  const startTime = Date.now();
  const endTime = startTime + DURATION_SECONDS * 1000;

  // Create workers that send requests
  const workers: Promise<void>[] = [];
  let requestCount = 0;

  while (Date.now() < endTime) {
    const worker = (async () => {
      const result = await submitTransaction();
      requestCount++;

      metrics.totalRequests++;
      metrics.responseTimes.push(result.responseTime);

      if (result.success) {
        metrics.successfulRequests++;
      } else {
        metrics.failedRequests++;
        const errorKey = result.error || 'Unknown error';
        errorMap.set(errorKey, (errorMap.get(errorKey) || 0) + 1);
      }

      metrics.minResponseTime = Math.min(metrics.minResponseTime, result.responseTime);
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, result.responseTime);
    })();

    workers.push(worker);

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Wait for all requests to complete
  await Promise.all(workers);

  // Calculate metrics
  metrics.avgResponseTime =
    metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;

  metrics.errors = Array.from(errorMap.entries()).map(([error, count]) => ({
    error,
    count,
  }));

  // Calculate percentiles
  const sortedTimes = [...metrics.responseTimes].sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

  const actualTPS = metrics.totalRequests / DURATION_SECONDS;

  // Print results
  console.log('\n=== Load Test Results ===\n');
  console.log(`Total Requests: ${metrics.totalRequests}`);
  console.log(`Successful: ${metrics.successfulRequests}`);
  console.log(`Failed: ${metrics.failedRequests}`);
  console.log(`Success Rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%`);
  console.log(`\nActual TPS: ${actualTPS.toFixed(2)}`);
  console.log(`Target TPS: ${TARGET_TPS}`);
  console.log(`\nResponse Times (ms):`);
  console.log(`  Average: ${metrics.avgResponseTime.toFixed(2)}`);
  console.log(`  Min: ${metrics.minResponseTime}`);
  console.log(`  Max: ${metrics.maxResponseTime}`);
  console.log(`  P50: ${p50}`);
  console.log(`  P95: ${p95}`);
  console.log(`  P99: ${p99}`);

  if (metrics.errors.length > 0) {
    console.log(`\nErrors:`);
    metrics.errors.forEach(({ error, count }) => {
      console.log(`  ${error}: ${count}`);
    });
  }

  // Check if target was met
  if (actualTPS >= TARGET_TPS * 0.9) {
    console.log(`\n✅ Target TPS achieved (within 90%) ${actualTPS}`);
  } else {
    console.log(`\n⚠️  Target TPS not fully achieved ${actualTPS}`);
  }

  if (metrics.avgResponseTime < 100) {
    console.log(`✅ Average response time under ${metrics.avgResponseTime}ms target`);
  } else {
    console.log(`⚠️  Average response time exceeds 100ms target`);
  }
}

// Run if executed directly
if (require.main === module) {
  runLoadTest().catch((error) => {
    console.error('Load test failed:', error);
    process.exit(1);
  });
}

export { runLoadTest };

