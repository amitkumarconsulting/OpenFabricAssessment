# Manual Testing Guide

## Prerequisites

1. Ensure Docker is running
2. Ensure Node.js 18+ is installed
3. Have terminal access ready


## Step 0: Start Infrastructure
```bash
# To Run testing via script
chmod +x test-manual.sh
./test-manual.sh

```

## Step 1: Start Infrastructure

```bash
# Start Redis and Mock Posting Service
cd docker
docker-compose up -d



# Verify services are running
docker-compose ps

# Check Redis
docker exec transaction-redis redis-cli ping or redis-cli PING
# Should return: PONG

#To enter redis cli interactive shell
redis-cli

# Check Mock Posting Service
curl http://localhost:8080/health
# Should return: {"status":"healthy","timestamp":"2026-01-01T23:27:27.368632294Z","version":"1.0.0"}
```

## Step 2: Build and Start the Application

```bash
# Go back to project root
cd ..

# Install dependencies (if not done)
npm install

# Build the project
npm run build

# Start the application
npm run dev
# Or in production: npm start
```

The API should be running on `http://localhost:3000`

## Step 3: Test Health Endpoint

```bash
# Check system health
curl http://localhost:3000/api/health | jq

# Expected response:
# {
#  "status": "healthy",
#  "timestamp": "2026-01-01T23:27:57.646Z",
#  "services": {
#    "redis": {
#      "status": "up"
#    },
#    "queue": {
#      "status": "up",
#      "metrics": {
#        "waiting": 0,
#        "active": 0,
#        "completed": 8,
#        "failed": 0,
#        "delayed": 0,
#        "total": 8
#      }
#    }
#  }
# }
```

**Shows relevant data points:**
- Health endpoint shows system status
- Queue metrics show current state (waiting, active, completed, failed)
- Redis connectivity is verified

## Step 4: Test Basic Transaction Submission

```bash
# Submit a transaction
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-txn-001",
    "amount": 100.50,
    "currency": "USD",
    "description": "Test transaction 1",
    "timestamp": "2026-01-01T13:27:57.646Z"
  }' | jq

# Expected response (202 Accepted):
#{
#  "id": "test-txn-001",
#  "status": "pending",
#  "submittedAt": "2026-01-01T23:44:13.303Z",
#  "message": "Transaction accepted for processing"
#}
```

**Shows relevant data points:**
- Response time should be < 100ms
- Returns 202 Accepted immediately
- Transaction is queued for async processing
- Status is "pending" initially

## Step 5: Check Transaction Status

```bash
# Check status immediately after submission
curl http://localhost:3000/api/transactions/test-txn-001 | jq

# Expected response (initially):
#{
#  "id": "test-txn-001",
#  "status": "completed",
#  "submittedAt": "2026-01-01T23:44:13.309Z",
#  "completedAt": "2026-01-01T23:44:13.349Z"
#}


# Wait a few seconds, then check again
sleep 5
curl http://localhost:3000/api/transactions/test-txn-001 | jq

# Expected response (after processing):
#{
#  "id": "test-txn-001",
#  "status": "completed",
#  "submittedAt": "2026-01-01T23:44:13.309Z",
#  "completedAt": "2026-01-01T23:44:13.349Z"
#}
```

**Shows relevant data points:**
- Status transitions: pending → processing → completed
- Timestamps show submission and completion times
- Worker processes transactions asynchronously

## Step 6: Test Idempotency (Duplicate Prevention)

```bash
# Submit the same transaction multiple times
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "duplicate-test",
    "amount": 200.00,
    "currency": "EUR",
    "description": "Duplicate test",
    "timestamp": "2026-01-01T23:44:13.349Z"
  }' | jq

# Submit again immediately
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "duplicate-test",
    "amount": 200.00,
    "currency": "EUR",
    "description": "Duplicate test",
    "timestamp": "2026-01-01T23:44:13.349Z"
  }' | jq

# Expected response (second submission):
# {
#  "id": "duplicate-test",
#  "status": "completed",
#  "submittedAt": "2026-01-01T23:44:13.349Z",
#  "message": "Transaction already processed",
#  "completedAt": "2026-01-01T23:45:13.349Z"
#}

# Wait for completion, then submit again
sleep 10
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "duplicate-test",
    "amount": 200.00,
    "currency": "EUR",
    "description": "Duplicate test",
    "timestamp": "2026-01-01T23:31:53.968Z"
  }' | jq

# Expected response (after completion):
# {
#  "id": "duplicate-test",
#  "status": "completed",
#  "submittedAt": "2026-01-01T23:31:53.948Z",
#  "message": "Transaction already processed",
#  "completedAt": "2026-01-01T23:50:53.968Z"
#}
```

**Shows relevant data points:**
- First submission: Creates new transaction
- Second submission (while processing): Returns "already queued"
- Third submission (after completion): Returns "already processed"
- GET-before-POST pattern prevents duplicates in posting service

## Step 7: Verify No Duplicates in Posting Service

```bash
# Check what's in the posting service
curl http://localhost:8080/transactions | jq

# Look for "duplicate-test" - should appear only ONCE
# Even though we submitted it 3 times, it should only be posted once
# Note: The response has a "data" array, so use:
curl http://localhost:8080/transactions | jq '.data[] | select(.id == "duplicate-test")'
```

**Shows relevant data points:**
- GET-before-POST pattern ensures worker checks before posting
- Idempotency keys prevent duplicate queue entries
- State tracking prevents reprocessing completed transactions

## Step 8: Test Concurrent Submissions

```bash
# Submit multiple different transactions quickly
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/transactions \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"concurrent-$i\",
      \"amount\": $((i * 10)),
      \"currency\": \"USD\",
      \"description\": \"Concurrent test $i\",
      \"timestamp\": \"2026-01-01T23:31:53.968Z\"
    }" &
done
wait

# Check all statuses
for i in {1..5}; do
  echo "Checking concurrent-$i:"
  curl http://localhost:3000/api/transactions/concurrent-$i | jq
  echo ""
done
```

**Shows relevant data points:**
- All requests return immediately (< 100ms)
- Transactions are processed concurrently by worker pool
- Queue handles high throughput

## Step 9: Test Validation

```bash
# Test missing required field
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invalid-1",
    "amount": 100,
    "currency": "USD"
  }' | jq

# Expected: 400 Bad Request
#{
#  "error": "Validation failed",
#  "details": [
#    {
#      "expected": "string",
#      "code": "invalid_type",
#      "path": [
#        "description"
#      ],
#      "message": "Invalid input: expected string, received undefined"
#    },
#    {
#      "expected": "string",
#      "code": "invalid_type",
#      "path": [
#        "timestamp"
#      ],
#      "message": "Invalid input: expected string, received undefined"
#    }
#  ]
#}

# Test negative amount
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invalid-2",
    "amount": -100,
    "currency": "USD",
    "description": "Test",
    "timestamp": "2026-01-01T23:31:53.968Z"
  }' | jq

# Expected: 400 Bad Request
#{
#  "error": "Validation failed",
#  "details": [
#    {
#      "origin": "number",
#      "code": "too_small",
#      "minimum": 0,
#      "inclusive": false,
#      "path": [
#        "amount"
#      ],
#      "message": "Amount must be positive"
#    }
#  ]
#}

# Test invalid currency length
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invalid-3",
    "amount": 100,
    "currency": "US",
    "description": "Test",
    "timestamp": "2026-01-01T23:31:53.968Z"
  }' | jq

# Expected: 400 Bad Request
#{
#  "error": "Validation failed",
#  "details": [
#    {
#      "origin": "string",
#      "code": "too_small",
#      "minimum": 3,
#      "inclusive": true,
#      "exact": true,
#      "path": [
#        "currency"
#      ],
#      "message": "Currency must be 3 characters"
#    }
#  ]
#}
```

**Shows relevant data points:**
- Input validation prevents invalid data
- Zod schema validation ensures data integrity
- Clear error messages help debugging

## Step 10: Test Error Handling (Posting Service Failure)

The mock posting service has a ~5% failure rate. To test error handling:

```bash
# Submit multiple transactions to trigger a failure
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/transactions \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"failure-test-$i\",
      \"amount\": 50,
      \"currency\": \"USD\",
      \"description\": \"Failure test $i\",
      \"timestamp\": \"2026-01-01T23:31:53.968Z\"
    }" | jq &
done
wait

# Check for any failed transactions
for i in {1..20}; do
  status=$(curl -s http://localhost:3000/api/transactions/failure-test-$i | jq -r '.status')
  if [ "$status" = "failed" ]; then
    echo "Transaction failure-test-$i failed:"
    curl http://localhost:3000/api/transactions/failure-test-$i | jq
  fi
done
```

**Shows relevant data points:**
- System retries failed transactions (exponential backoff)
- GET-before-POST handles post-write failures
- Failed transactions are marked with error messages
- Max retries prevent infinite loops

## Step 11: Test GET-Before-POST Pattern

```bash
# Manually create a transaction in posting service first
curl -X POST http://localhost:8080/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "pre-existing",
    "amount": 500,
    "currency": "USD",
    "description": "Pre-existing transaction",
    "timestamp": "2026-01-01T23:31:53.968Z"
  }'

# Now submit it through our service
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "pre-existing",
    "amount": 500,
    "currency": "USD",
    "description": "Pre-existing transaction",
    "timestamp": "2026-01-01T23:31:53.968Z"
  }' | jq

# Check status - should be completed immediately
sleep 2
curl http://localhost:3000/api/transactions/pre-existing | jq

# Expected: Status should be "completed" without posting again
```

**Shows relevant data points:**
- Worker checks GET /transactions/{id} before POST
- If transaction exists, marks as completed without posting
- Prevents duplicates even if transaction already exists

## Step 12: Test Post-Write Failure Recovery

```bash
# This is harder to test manually, but you can explain:
# 1. Worker POSTs transaction
# 2. Posting service saves it but returns error (post-write failure)
# 3. Worker waits (exponential backoff)
# 4. Worker GETs transaction - finds it exists
# 5. Worker marks as completed (transaction was actually successful)

# You can verify this by checking logs when failures occur
# The worker will log: "Post-write failure detected, transaction exists"
```

**Shows relevant data points:**
- System distinguishes pre-write vs post-write failures
- GET verification after POST failure handles edge cases
- No duplicate transactions even on post-write failures

## Step 13: Monitor Queue Metrics

```bash
# Check health endpoint to see queue metrics
curl http://localhost:3000/api/health | jq '.services.queue.metrics'

# Expected:
# {
#   "waiting": 0,
#   "active": 0,
#   "completed": X,
#   "failed": Y,
#   "delayed": 0,
#   "total": X+Y
# }
```

**Shows relevant data points:**
- Queue metrics show system health
- Can monitor throughput and error rates
- Useful for debugging and performance tuning

## Step 14: Test Cleanup

```bash
# Clean up posting service (for testing)
curl -X POST http://localhost:8080/cleanup | jq

# Clean up our queue (if needed)
npm run cleanup-queue
```

## Conclusion

### Architecture
1. **Three-level architecture**: API → Queue → Workers
2. **Async processing**: Immediate 202 response, background processing
3. **Redis for state**: Fast, persistent state management
4. **BullMQ for queue**: Reliable, scalable job queue

### Idempotency Strategy
1. **Queue-level**: Transaction ID as job ID prevents duplicate queue entries
2. **Application-level**: Idempotency keys in Redis
3. **Posting-service-level**: GET-before-POST pattern

### Failure Handling
1. **Pre-write failures**: Retry with exponential backoff
2. **Post-write failures**: GET verification marks as completed
3. **Max retries**: Prevents infinite loops

### Performance
1. **Sub-100ms responses**: Immediate 202 Accepted
2. **High throughput**: Worker pool with configurable concurrency
3. **Scalability**: Horizontal scaling via Redis

