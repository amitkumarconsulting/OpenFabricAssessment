declare const process: {
    env: {
      [key: string]: string | undefined;
    };
  };
  
  export interface Config {
    server: {
      port: number;
      host: string;
      timeout: number;
    };
    redis: {
      host: string;
      port: number;
      password?: string;
    };
    queue: {
      name: string;
      workerConcurrency: number;
      maxRetries: number;
    };
    postingService: {
      url: string;
      timeout: number;
    };
  }
  
  export const config: Config = {
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      timeout: parseInt(process.env.API_TIMEOUT_MS || '100', 10),
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    queue: {
      name: process.env.QUEUE_NAME || 'transaction-queue',
      workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '10', 10),
      maxRetries: parseInt(process.env.MAX_RETRIES || '5', 10),
    },
    postingService: {
      url: process.env.POSTING_SERVICE_URL || 'http://localhost:8080',
      timeout: parseInt(process.env.POSTING_SERVICE_TIMEOUT || '5000', 10),
    },
  };
  
  