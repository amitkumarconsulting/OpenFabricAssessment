import { Worker, Job } from "bullmq";
import { redis } from "../config";
import { StateService } from "../services/stateService";
import {
  getTransactionById,
  postTransaction,
} from "../services/postingService";
import { PostingTransactionPayload } from "../services/postingService";

const QUEUE_NAME =
  process.env.QUEUE_NAME || "transaction-queue";

  async function processTransaction(job: Job) {
    const { transaction } = job.data as {
      transaction: PostingTransactionPayload;
    };
  
    const txnId = transaction.id;
  
    // Mark processing
    await StateService.updateStatus(txnId, "processing");
  
    // 1️⃣ GET-before-POST (deduplication)
    const exists = await getTransactionById(txnId);
    if (exists) {
      await StateService.updateStatus(txnId, "completed");
      return;
    }
  
    // 2️⃣ Attempt POST
    try {
      await postTransaction(transaction);
      await StateService.updateStatus(txnId, "completed");
    } catch (err) {
      // 3️⃣ POST failed — verify state
      const existsAfterFailure = await getTransactionById(txnId);
  
      if (existsAfterFailure) {
        // Post-write failure
        await StateService.updateStatus(txnId, "completed");
        return;
      }
  
      // Pre-write failure — retry
      const retries = await StateService.incrementRetry(txnId);
  
      if (retries >= (Number(process.env.MAX_RETRIES) || 5)) {
        await StateService.updateStatus(
          txnId,
          "failed",
          "Max retries exceeded"
        );
        return;
      }
  
      throw err; // Let BullMQ retry
    }
  }

  export const transactionWorker = new Worker(
    QUEUE_NAME,
    processTransaction,
    {
      connection: redis,
      concurrency:
        Number(process.env.WORKER_CONCURRENCY) || 10,
    }
  );

  transactionWorker.on("completed", (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });
  
  transactionWorker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err.message);
  });
