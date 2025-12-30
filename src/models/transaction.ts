export enum TransactionStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
  }
  
  export interface Transaction {
    id: string;
    amount: number;
    currency: string;
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
    id: string;
    amount: number;
    currency: string;
  }
  
  export interface TransactionResponse {
    id: string;
    status: TransactionStatus;
    message?: string;
  }
  
  