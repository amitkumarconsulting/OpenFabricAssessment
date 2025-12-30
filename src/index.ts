import { StateService } from "./services/stateService";

async function test() {
  const txnId = "state-test-1";

  console.log("Creating transaction...");
  await StateService.create(txnId);

  console.log(await StateService.get(txnId));

  console.log("Updating status to processing...");
  await StateService.updateStatus(txnId, "processing");

  console.log(await StateService.get(txnId));

  console.log("Increment retry...");
  await StateService.incrementRetry(txnId);

  console.log(await StateService.get(txnId));

  console.log("Mark completed...");
  await StateService.updateStatus(txnId, "completed");

  console.log(await StateService.get(txnId));
}

test();
