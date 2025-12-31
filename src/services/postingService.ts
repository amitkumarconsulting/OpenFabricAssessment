import axios from "axios";

const POSTING_SERVICE_URL =
  process.env.POSTING_SERVICE_URL || "http://localhost:8080";

const POSTING_SERVICE_TIMEOUT =
  Number(process.env.POSTING_SERVICE_TIMEOUT) || 5000;

const client = axios.create({
  baseURL: POSTING_SERVICE_URL,
  timeout: POSTING_SERVICE_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface PostingTransactionPayload {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  timestamp: string;
}

export async function getTransactionById(
  id: string
): Promise<boolean> {
  try {
    await client.get(`/transactions/${id}`);
    return true;
  } catch (err: any) {
    if (err.response?.status === 404) {
      return false;
    }
    throw err;
  }
}

export async function postTransaction(
  payload: PostingTransactionPayload
): Promise<void> {
  await client.post("/transactions", payload);
}

export async function cleanupTransactions(): Promise<void> {
  await client.post("/cleanup");
}
