import { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError, type Identity } from "./security";
import { workerHealth } from "./worker-state";
export type Operation = "chat" | "evaluation";
export const windowUTC = (now = new Date(), minute = false) =>
  new Date(
    Math.floor(now.getTime() / (minute ? 60000 : 86400000)) *
      (minute ? 60000 : 86400000),
  );
export const quotaLimit = (scope: string, operation: string) => {
  const defaults: Record<string, number> = {
    STUDENT_chat: 100,
    STUDENT_evaluation: 20,
    INSTRUCTOR_chat: 3000,
    INSTRUCTOR_evaluation: 300,
    GLOBAL_chat: 6000,
    GLOBAL_evaluation: 600,
    MINUTE_chat: 10,
    MINUTE_evaluation: 3,
    GLOBAL_provider: 10000,
  };
  const n = Number(
    process.env[`AI_QUOTA_${scope}_${operation.toUpperCase()}`] ??
      defaults[`${scope}_${operation}`],
  );
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("Configuração de quota inválida.");
  return n;
};
export function quotaError(scope: string, reset: Date) {
  return new HttpError(
    429,
    "Limite de IA atingido. Aguarde a renovação.",
    "AI_QUOTA_EXCEEDED",
    { scope, resetsAt: reset.toISOString() },
    {
      "Retry-After": String(
        Math.max(1, Math.ceil((+reset - Date.now()) / 1000)),
      ),
    },
  );
}
export async function reserve(
  tx: Prisma.TransactionClient,
  userId: string,
  instructorId: string,
  operation: Operation,
  jobId: string,
  generation: number,
  key: string,
) {
  const pending = await tx.job.count({
    where: {
      ownerId: userId,
      state: { in: ["QUEUED", "RUNNING"] },
      id: { not: jobId },
    },
  });
  if (pending >= 2)
    throw new HttpError(
      409,
      "Aguarde os trabalhos pendentes.",
      "AI_PENDING_LIMIT",
    );
  const reservation = await tx.usageReservation.create({
    data: { key, userId, jobId, generation },
  });
  for (const [scope, scopeId] of [
    ["GLOBAL", "deployment"],
    ["INSTRUCTOR", instructorId],
    ["MINUTE", userId],
    ["STUDENT", userId],
  ]) {
    const minute = scope === "MINUTE";
    const start = windowUTC(new Date(), minute);
    const limit = quotaLimit(scope, operation);
    const bucket = await tx.usageBucket.upsert({
      where: {
        scope_scopeId_operation_windowStart: {
          scope,
          scopeId,
          operation,
          windowStart: start,
        },
      },
      create: { scope, scopeId, operation, windowStart: start, limit },
      update: {},
    });
    // Test the current sum under the row lock, rather than stale values read by
    // this transaction. Unrelated concurrent users must not receive false 429s.
    const changed =
      await tx.$executeRaw`UPDATE "UsageBucket" SET "reserved" = "reserved" + 1 WHERE "id" = ${bucket.id} AND "used" + "reserved" < ${limit}`;
    if (!changed)
      throw quotaError(scope, new Date(+start + (minute ? 60000 : 86400000)));
    await tx.reservationBucket.create({
      data: { reservationId: reservation.id, bucketId: bucket.id },
    });
  }
  return reservation;
}
export async function settle(
  tx: Prisma.TransactionClient,
  jobId: string,
  generation: number,
  consume: boolean,
) {
  const reservation = await tx.usageReservation.findUnique({
    where: { jobId_generation: { jobId, generation } },
    include: { buckets: true },
  });
  if (!reservation) return false;
  if (reservation.state === "RELEASED") return false;
  const changed = await tx.usageReservation.updateMany({
    where: { id: reservation.id, state: "RESERVED" },
    data: { state: consume ? "CONSUMED" : "RELEASED" },
  });
  if (changed.count)
    for (const link of reservation.buckets)
      await tx.usageBucket.update({
        where: { id: link.bucketId },
        data: {
          reserved: { decrement: 1 },
          ...(consume ? { used: { increment: 1 } } : {}),
        },
      });
  return true;
}
export async function debitProvider(tx: Prisma.TransactionClient) {
  const start = windowUTC();
  const limit = quotaLimit("GLOBAL", "provider");
  const b = await tx.usageBucket.upsert({
    where: {
      scope_scopeId_operation_windowStart: {
        scope: "GLOBAL",
        scopeId: "deployment",
        operation: "provider",
        windowStart: start,
      },
    },
    create: {
      scope: "GLOBAL",
      scopeId: "deployment",
      operation: "provider",
      windowStart: start,
      limit,
    },
    update: {},
  });
  const ok = await tx.usageBucket.updateMany({
    where: { id: b.id, used: { lt: limit } },
    data: { used: { increment: 1 } },
  });
  if (!ok.count)
    throw quotaError("GLOBAL_PROVIDER", new Date(+start + 86400000));
}
export function sharedAvailability(
  buckets: {
    scope: string;
    operation: string;
    used: number;
    reserved: number;
  }[],
) {
  const open = (operation: string) =>
    !buckets.some(
      (b) =>
        b.scope === "GLOBAL" &&
        b.operation === operation &&
        b.used + b.reserved >= quotaLimit("GLOBAL", operation),
    );
  const provider = process.env.AI_MODE !== "live" || open("provider");
  return {
    chat: provider && open("chat"),
    evaluation: provider && open("evaluation"),
  };
}
export async function getUsage(user: Identity) {
  const scope = user.role === "INSTRUCTOR" ? "INSTRUCTOR" : "STUDENT";
  const start = windowUTC();
  const buckets = await db.usageBucket.findMany({
    where: {
      windowStart: start,
      OR: [
        { scope, scopeId: user.id },
        { scope: "GLOBAL", scopeId: "deployment" },
      ],
    },
  });
  const view = (operation: Operation) => {
    const b = buckets.find(
      (b) => b.scope === scope && b.operation === operation,
    );
    const limit = quotaLimit(scope, operation);
    const used = b?.used ?? 0,
      reserved = b?.reserved ?? 0;
    return {
      used,
      reserved,
      limit,
      remaining: Math.max(0, limit - used - reserved),
      resetsAt: new Date(+start + 86400000).toISOString(),
    };
  };
  const shared = sharedAvailability(buckets);
  return {
    chat: view("chat"),
    evaluation: view("evaluation"),
    shared,
    sharedAvailable: shared.chat && shared.evaluation,
    worker: await workerHealth(),
  };
}
