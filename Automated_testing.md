### 1. Test Files

- `tests/unit/retry.test.ts` - Unit tests for retry utilities
- `tests/integration/api.test.ts` - Integration tests for API endpoints
- `tests/load/loadTest.ts` - Load testing script (1000+ TPS target)

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Start Infrastructure**

   ```bash
   cd docker
   docker-compose up -d
   or
   cd docker
   docker-compose logs mock-posting-service
   docker-compose restart mock-posting-service
   ```

3. **Build Project**

   ```bash
   npm run build
   ```

4. **Run Application**

   ```bash
   npm run dev
   ```

5. **Test**
   ```bash
   npm test
   npm run load-test
   ```

## Testing Setup

### Unit Tests

```bash
# Run unit tests
npm test

# Unit tests only (fast, no external services)
npm run test:unit

# Integration tests (requires Redis + posting service)

### Integration Tests
#- Tests API endpoints with real Redis connection
#- Uses cleanup endpoint between tests
#- Tests idempotency, validation, and status queries

npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

```bash
# Run load tests (target: 1000+ TPS)
npm run load-test

#This will send 1000 transactions per second for 10 seconds and report metrics.

# With custom configuration
API_URL=http://localhost:3000 TARGET_TPS=2000 DURATION_SEC=30 npm run load-test
```
