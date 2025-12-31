// import { StateService } from "./services/stateService";

// import { enqueueTransaction, getQueueMetrics } from "./services/queueService";


// async function test() {
//     const txnId = "state-test-1";
  
//     console.log("Creating transaction...");
//     await StateService.create(txnId);
  
//     console.log(await StateService.get(txnId));
  
//     console.log("Updating status to processing...");
//     await StateService.updateStatus(txnId, "processing");
  
//     console.log(await StateService.get(txnId));
  
//     console.log("Increment retry...");
//     await StateService.incrementRetry(txnId);
  
//     console.log(await StateService.get(txnId));
  
//     console.log("Mark completed...");
//     await StateService.updateStatus(txnId, "completed");
  
//     console.log(await StateService.get(txnId));
//   }

// async function testQueue() {
//   console.log("Enqueue txn-1");
//   await enqueueTransaction("txn-1");

//   console.log("Enqueue txn-1 again (should dedupe)");
//   await enqueueTransaction("txn-1");

//   console.log("Queue metrics:");
//   console.log(await getQueueMetrics());
// }

// testQueue();



// test();
import {
    postTransaction,
    getTransactionById,
  } from "./services/postingService";
  
  async function testPostingService() {
    const id = "posting-test-1";
  
    console.log("Exists before POST:", await getTransactionById(id));
  
    try {
      await postTransaction({
        id,
        amount: 100.5,
        currency: "USD",
        description: "Posting service test",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.log("POST failed (expected sometimes)");
    }
  
    console.log("Exists after POST:", await getTransactionById(id));
  }
  
  testPostingService();
  