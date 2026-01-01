export enum TransactionStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
  }
  
  export interface Transaction {
    id: string; // UUID
    amount: number; // decimal (positive)
    currency: string; // ISO 4217
    description: string;
    timestamp: string; // ISO 8601 datetime
    metadata?: Record<string, unknown>; // optional object
  }
  
  export interface TransactionState {
    id: string;
    status: TransactionStatus;
    createdAt: string;
    updatedAt: string;
    retryCount?: number;
    error?: string;
  }
  
  export interface TransactionRequest {
    id: string; // UUID
    amount: number; // decimal (positive)
    currency: string; // ISO 4217
    description: string;
    timestamp: string; // ISO 8601 datetime
    metadata?: Record<string, unknown>; // optional
  }
  
  export interface TransactionResponse {
    id: string;
    status: TransactionStatus;
    submittedAt?: string; // ISO 8601 datetime - when transaction was submitted
    completedAt?: string; // ISO 8601 datetime - when transaction was completed (only if completed/failed)
    message?: string;
    error?: string; // Error message if failed
  }
  
  