```bash
# High Performance Transaction Processing System

A TypeScript-based transaction processing service built with Fastify, Redis (BullMQ), and worker pools to achieve sub-100ms response times while ensuring zero data loss and no duplicates.

## Features
- **Sub-100ms API Response Times**: Immediate 202 Accepted responses
- **Idempotency Guarantees**: GET-before-POST pattern prevents duplicates
- **Automatic Retries**: Exponential backoff retry strategy
- **Queue-based Architecture**: Redis-backed message queue for async processing
- **Worker Pool**: Configurable concurrent workers for parallel processing
- **Failure Handling**: Distinguishes pre-write vs post-write failures
- **Health Metrics**: Real-time queue and system metrics

## Architecture

The system uses a three-tier architecture:

1. **API Layer**: Fast HTTP server (Fastify) that accepts transactions and returns immediately
2. **Queue Layer**: Redis-based message queue (BullMQ) for async processing
3. **Worker Layer**: Background workers that process transactions with idempotency checks

### Data Flow

         Redis State  Transaction Status
            |^              |^
Client -> API Server -> Redis Queue -> Worker Pool -> Posting Service


     ## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Fastify
- **Queue**: BullMQ (Redis-based)
- **Storage**: Redis
- **Testing**: Jest, Supertest

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Infrastructure (Redis + Mock Posting Service)

```bash
cd docker
docker-compose up -d
```

This will start:
- Redis on port 6379
- Mock posting service on port 8080 (using provided Docker image: `vinhopenfabric/mock-posting-service`)

### 3. Build and Run

```bash
# Build TypeScript
npm run build

# Run in production mode
npm start

# Or run in development mode with hot reload
npm run dev

The API server will start on `http://localhost:3000`

## API Endpoints

### pls refer Manual_Testing.md from step:3


