import { db } from "./db";
export async function workerHealth() {
  const h = await db.workerHeartbeat.findFirst({
    orderBy: { lastSeen: "desc" },
  });
  return {
    healthy: !!h && Date.now() - h.lastSeen.getTime() < 60000,
    lastSeen: h?.lastSeen.toISOString() ?? null,
  };
}
export async function heartbeat(id: string) {
  await db.workerHeartbeat.upsert({
    where: { id },
    create: { id },
    update: { lastSeen: new Date() },
  });
}
