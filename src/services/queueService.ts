import { Queue } from "bullmq";
import { redis } from "../config";
import { PostingTransactionPayload } from "./postingService";

const QUEUE_NAME = process.env.QUEUE_NAME || "transaction-queue";

export const transactionQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: Number(process.env.MAX_RETRIES) || 5,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s → 2s → 4s → ...
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueTransaction(
    transaction: PostingTransactionPayload
  ) {
    await transactionQueue.add(
      "process-transaction",
      { transaction },
      {
        jobId: transaction.id,
      }
    );
  }
  

  export async function getQueueMetrics() {
    const counts = await transactionQueue.getJobCounts();
  
    return {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      total:
        counts.waiting +
        counts.active +
        counts.completed +
        counts.failed +
        counts.delayed,
    };
  }
  