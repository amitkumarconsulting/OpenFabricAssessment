# Testing Documentation

This directory contains comprehensive tests for the High Performance Transaction Processing System.

## Test Structure

```
tests/
├── unit/                    # Unit tests (isolated, fast)
│   ├── services/           # Service layer tests
│   ├── workers/            # Worker tests
│   ├── utils/              # Utility function tests
│   └── api/                # API middleware tests
├── integration/            # Integration tests (require services)
│   ├── api.test.ts        # API endpoint tests
│   └── endToEnd.test.ts   # End-to-end transaction flow tests
├── load/                   # Load testing scripts
│   └── loadTest.ts        # Performance/load testing
├── helpers/                # Test utilities and mocks
│   ├── mockPostingService.ts
│   └── testUtils.ts
└── setup.ts                # Test setup and teardown utilities
```

## Prerequisites

Before running tests, ensure the following services are running:

1. **Redis**: Required for integration and end-to-end tests
   ```bash
   cd docker
   docker-compose up -d redis
   ```

2. **Mock Posting Service**: Required for integration and end-to-end tests
   ```bash
   cd docker
   docker-compose up -d mock-posting-service
   ```

3. **Full System**: Required for load tests
   ```bash
   # Start all services
   cd docker
   docker-compose up -d
   
   # Start the API server
   npm run dev
   ```

## Running Tests

### All Tests
```bash
npm test
# or
npm run test:all
```

### Unit Tests Only
```bash
npm run test:unit
```

Unit tests are fast and don't require external services. They use mocks for external dependencies.

### Integration Tests Only
```bash
npm run test:integration
```

Integration tests require Redis and the mock posting service to be running.

### Watch Mode
```bash
npm run test:watch
```

Runs tests in watch mode, re-running tests when files change.

### Coverage Report
```bash
npm run test:coverage
```

Generates a coverage report in the `coverage/` directory. Open `coverage/index.html` in a browser to view the report.

### CI Mode
```bash
npm run test:ci
```

Optimized for CI/CD pipelines with coverage reporting and limited workers.

## Load Testing

Load tests verify the system can handle high throughput (1000+ TPS) with sub-100ms response times.

### Prerequisites
- API server must be running (`npm run dev` or `npm start`)
- Redis must be running
- Mock posting service must be running

### Run Load Test
```bash
npm run load-test
```

### Customize Load Test
```bash
# Set custom target TPS and duration
TARGET_TPS=2000 DURATION_SEC=30 npm run load-test

# Test against different API URL
API_URL=http://localhost:3000 npm run load-test
```

### Environment Variables
- `API_URL`: API base URL (default: `http://localhost:3000`)
- `TARGET_TPS`: Target transactions per second (default: `1000`)
- `DURATION_SEC`: Test duration in seconds (default: `10`)

## Test Types

### Unit Tests

Unit tests test individual components in isolation:

- **Services**: `QueueService`, `StateService`, `PostingService`, `TransactionService`
- **Workers**: `TransactionWorker`, `WorkerPool`
- **Utilities**: Retry logic, idempotency helpers
- **Middleware**: Request validation

These tests use mocks and don't require external services.

### Integration Tests

Integration tests verify components work together:

- **API Tests**: HTTP endpoints, request/response handling
- **End-to-End Tests**: Complete transaction lifecycle from submission to completion

These tests require Redis and the mock posting service.

### Load Tests

Load tests verify system performance under high load:

- Throughput (TPS)
- Response times (average, P50, P95, P99)
- Error rates
- System stability

## Test Utilities

### `tests/setup.ts`
Provides utilities for test setup and teardown:
- `getTestRedis()`: Get or create Redis connection
- `getTestQueueService()`: Get or create QueueService
- `getTestStateService()`: Get or create StateService
- `cleanupRedis()`: Clean all Redis data
- `cleanupQueue()`: Clean queue data
- `setupTests()`: Setup before all tests
- `teardownTests()`: Teardown after all tests

### `tests/helpers/mockPostingService.ts`
Mock posting service for unit tests:
- Simulate success, failure, timeout scenarios
- Simulate post-write failures
- Track call history
- Configure behavior dynamically

### `tests/helpers/testUtils.ts`
Common test utilities:
- `createTestTransactionRequest()`: Generate test transaction requests
- `createTestTransaction()`: Generate test transactions
- `waitFor()`: Wait for condition to be true
- `waitForTransactionStatus()`: Wait for transaction status
- `sleep()`: Sleep utility
- `retryUntilSuccess()`: Retry function until success

## Writing New Tests

### Unit Test Example
```typescript
import { QueueService } from '../../../src/services/queueService';
import { getTestRedis, cleanupRedis } from '../../setup';

describe('MyService', () => {
  let redis: Redis;
  let service: MyService;

  beforeAll(async () => {
    redis = await getTestRedis();
    service = new MyService(redis);
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  beforeEach(async () => {
    await cleanupRedis();
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

### Integration Test Example
```typescript
import { createServer } from '../../src/api/server';
import { setupTests, teardownTests } from '../setup';

describe('API Integration', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    await setupTests();
    fastify = await createServer(redis, queueService);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await teardownTests();
  });

  it('should handle requests', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { 
        id: 'test', 
        amount: 100, 
        currency: 'USD',
        description: 'Test transaction',
        timestamp: new Date().toISOString()
      },
    });

    expect(response.statusCode).toBe(202);
  });
});
```

## Test Coverage Goals

- **Unit Tests**: >80% code coverage
- **Integration Tests**: All critical paths covered
- **Load Tests**: Verify 1000+ TPS capability

## Troubleshooting

### Tests Failing Due to Redis Connection
```bash
# Check if Redis is running
docker ps | grep redis

# Start Redis if not running
cd docker && docker-compose up -d redis
```

### Tests Failing Due to Posting Service
```bash
# Check if posting service is running
curl http://localhost:8080/health

# Start posting service if not running
cd docker && docker-compose up -d mock-posting-service
```

### Tests Timing Out
- Increase `testTimeout` in `jest.config.js`
- Check if services are responding
- Verify network connectivity

### Load Tests Not Meeting Targets
- Ensure API server is running
- Check Redis performance
- Verify worker concurrency settings
- Monitor system resources (CPU, memory)

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data in `beforeEach` or `afterEach`
3. **Mocks**: Use mocks for external services in unit tests
4. **Real Services**: Use real services in integration tests
5. **Timeouts**: Set appropriate timeouts for async operations
6. **Error Handling**: Test both success and failure scenarios

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:

```bash
# CI-friendly command
npm run test:ci
```

This command:
- Runs all tests
- Generates coverage reports
- Uses limited workers for resource efficiency
- Fails on test errors

## Performance Benchmarks

Target metrics (verified by load tests):
- ✅ API Response Time: < 100ms
- ✅ Throughput: 1000+ TPS
- ✅ Zero Data Loss
- ✅ Zero Duplicates

Run `npm run load-test` to verify these metrics.

