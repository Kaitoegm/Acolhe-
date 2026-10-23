import "dotenv/config";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { runNextJob } from "../src/lib/server/jobs";
import { heartbeat } from "../src/lib/server/worker-state";
import { db } from "../src/lib/server/db";
dotenv.config({ path: ".env.worker", override: true, quiet: true });
let stopping = false;
const id = randomUUID();
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  await heartbeat(id);
  console.log("Acolhe worker ready");
  const timer = setInterval(() => heartbeat(id).catch(console.error), 20000);
  try {
    while (!stopping) {
      try {
        if (!(await runNextJob()))
          await new Promise((r) => setTimeout(r, 2000));
      } catch (error) {
        console.error(error);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    clearInterval(timer);
    await db.workerHeartbeat.deleteMany({ where: { id } });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
