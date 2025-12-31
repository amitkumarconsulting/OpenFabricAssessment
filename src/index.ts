import { buildServer } from "./api/server";
import "./workers/transactionWorker";

async function start() {
  const app = await buildServer();

  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 API server running on http://${HOST}:${PORT}`);
}

start();
