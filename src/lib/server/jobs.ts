import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { patientReply, evaluateSubmission } from "../domain/ai";
import { evaluateV2, type EvaluationInput } from "../evaluation/evaluate";
import type { EvaluationStage } from "../evaluation/contracts";
import { settle, debitProvider } from "./quotas";
import { checkPayload } from "./enqueue";
import type { Draft, MessageView, PatientFacts, Rubric } from "../contracts";
const LEASE = 120000;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function runNextJob(): Promise<boolean> {
  const now = new Date(),
    token = randomUUID();
  const claimed = await db.$transaction(async (tx) => {
    for (let id = 0; id < 2; id++)
      await tx.workerSlot.upsert({ where: { id }, create: { id }, update: {} });
    const slot = await tx.workerSlot.findFirst({
      where: { OR: [{ token: null }, { leaseUntil: { lt: now } }] },
      orderBy: { id: "asc" },
    });
    if (!slot) return null;
    if (
      !(
        await tx.workerSlot.updateMany({
          where: {
            id: slot.id,
            OR: [{ token: null }, { leaseUntil: { lt: now } }],
          },
          data: { token, leaseUntil: new Date(+now + LEASE) },
        })
      ).count
    )
      return null;
    const eligible = {
      OR: [
        { state: "QUEUED", availableAt: { lte: now } },
        { state: "RUNNING", leaseUntil: { lt: now } },
      ],
    };
    const job = await tx.job.findFirst({
      where: eligible,
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    });
    if (!job) {
      await tx.workerSlot.updateMany({
        where: { id: slot.id, token },
        data: { token: null, leaseUntil: null },
      });
      return null;
    }
    if (
      !(
        await tx.job.updateMany({
          where: { id: job.id, generation: job.generation, ...eligible },
          data: {
            state: "RUNNING",
            leaseToken: token,
            leaseUntil: new Date(+now + LEASE),
          },
        })
      ).count
    ) {
      await tx.workerSlot.updateMany({
        where: { id: slot.id, token },
        data: { token: null, leaseUntil: null },
      });
      return null;
    }
    return { job, slot: slot.id };
  });
  if (!claimed) return false;
  const { job, slot } = claimed;
  const held = {
    id: job.id,
    state: "RUNNING",
    leaseToken: token,
    generation: job.generation,
  };
  let heartbeatBusy = false;
  const timer = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    db.$transaction(async (tx) => {
      const until = new Date(Date.now() + LEASE);
      await tx.job.updateMany({ where: held, data: { leaseUntil: until } });
      await tx.workerSlot.updateMany({
        where: { id: slot, token },
        data: { leaseUntil: until },
      });
    })
      .catch((e) =>
        console.error(
          "Worker heartbeat failed",
          e instanceof Error ? e.message : "database",
        ),
      )
      .finally(() => {
        heartbeatBusy = false;
      });
  }, 20000);
  let dispatched = false;
  let invocationId: string | undefined;
  const progress = async (stage: EvaluationStage) => {
    const changed = await db.job.updateMany({
      where: held,
      data: { stage, progressVersion: { increment: 1 } },
    });
    if (!changed.count) throw new Error("LEASE_LOST");
  };
  try {
    const resource =
      job.kind === "PATIENT_REPLY"
        ? await db.chatTurn.findUniqueOrThrow({
            where: { id: job.chatTurnId! },
          })
        : await db.attempt.findUniqueOrThrow({ where: { id: job.attemptId! } });
    const s = await db.simulation.findUniqueOrThrow({
      where: { id: resource.simulationId },
      include: {
        student: true,
        class: { include: { memberships: { where: { userId: job.ownerId } } } },
      },
    });
    if (
      !s.student.active ||
      s.studentId !== job.ownerId ||
      !s.class.memberships.length
    )
      throw new Error("ACCESS_REVOKED");
    if (job.tries >= 3) throw new Error("RETRY_EXHAUSTED");
    const chat = job.kind === "PATIENT_REPLY";
    const turn = chat
      ? (resource as Awaited<ReturnType<typeof db.chatTurn.findUniqueOrThrow>>)
      : null;
    const attempt = !chat
      ? (resource as Awaited<ReturnType<typeof db.attempt.findUniqueOrThrow>>)
      : null;
    const payload = turn
      ? { patient: turn.patient, messages: turn.conversation }
      : {
          ...(attempt!.caseSnapshot as object),
          draft: attempt!.snapshot,
          messages: attempt!.conversation,
        };
    checkPayload(payload);
    const live = process.env.AI_MODE === "live";
    await db.$transaction(async (tx) => {
      // Persist dispatch and provider budget before the external side effect. A crash uses this try.
      if (
        !(
          await tx.job.updateMany({
            where: { ...held, tries: { lt: 3 } },
            data: { tries: { increment: 1 } },
          })
        ).count
      )
        throw new Error("LEASE_LOST");
      const reserved = await settle(tx, job.id, job.generation, true);
      if (!reserved) throw new Error("MISSING_RESERVATION");
      if (live) {
        await debitProvider(tx);
        const inv = await tx.aiInvocation.create({
          data: {
            jobId: job.id,
            generation: job.generation,
            number: job.tries + 1,
            model: process.env.AI_MODEL ?? "unknown",
          },
        });
        invocationId = inv.id;
      }
      if (turn)
        await tx.chatTurn.update({
          where: { id: turn.id },
          data: { status: "RUNNING" },
        });
      else
        await tx.attempt.update({
          where: { id: attempt!.id },
          data: { status: "RUNNING" },
        });
    });
    dispatched = true;
    const result = turn
      ? await patientReply(
          turn.patient as unknown as PatientFacts,
          turn.conversation as unknown as MessageView[],
          `${job.id}:${job.generation}`,
        )
      : attempt!.evaluationVersion === 2
        ? await evaluateV2(
            payload as unknown as EvaluationInput,
            `${job.id}:${job.generation}`,
            progress,
          )
        : await evaluateSubmission(
            payload as unknown as {
              patient: PatientFacts;
              rubric: Rubric;
              reviewed: boolean;
              draft: Draft;
              messages: MessageView[];
            },
            `${job.id}:${job.generation}`,
          );
    await db.$transaction(async (tx) => {
      if (
        !(
          await tx.job.updateMany({
            where: held,
            data: {
              state: "COMPLETED",
              stage: "COMPLETED",
              progressVersion: { increment: 1 },
              leaseToken: null,
              leaseUntil: null,
            },
          })
        ).count
      )
        return;
      if (invocationId)
        await tx.aiInvocation.update({
          where: { id: invocationId },
          data: { state: "COMPLETED", finishedAt: new Date() },
        });
      if (turn) {
        await tx.chatTurn.update({
          where: { id: turn.id },
          data: { status: "COMPLETED", result: String(result), error: null },
        });
        await tx.message.create({
          data: {
            simulationId: s.id,
            role: "assistant",
            content: String(result),
          },
        });
        await tx.simulation.update({
          where: { id: s.id },
          data: { conversationRevision: { increment: 1 } },
        });
      } else {
        await tx.attempt.update({
          where: { id: attempt!.id },
          data: { status: "COMPLETED", feedback: json(result), error: null },
        });
        const latest = await tx.attempt.findFirst({
          where: { simulationId: s.id },
          orderBy: { number: "desc" },
        });
        if (latest?.id === attempt!.id)
          await tx.simulation.updateMany({
            where: { id: s.id, revision: attempt!.revision },
            data: { status: "COMPLETED" },
          });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no serviço";
    const terminal = !dispatched || job.tries + 1 >= 3;
    const failure =
      message === "ACCESS_REVOKED"
        ? "Acesso revogado antes do envio."
        : "Não foi possível concluir. Tente novamente.";
    await db.$transaction(async (tx) => {
      if (
        !(
          await tx.job.updateMany({
            where: held,
            data: {
              state: terminal ? "FAILED" : "QUEUED",
              stage: terminal ? "FAILED" : "QUEUED",
              progressVersion: { increment: 1 },
              leaseToken: null,
              leaseUntil: null,
              availableAt: new Date(
                Date.now() +
                  (job.tries ? 15000 : 5000) +
                  Math.floor(Math.random() * 1000),
              ),
            },
          })
        ).count
      )
        return;
      if (!dispatched) await settle(tx, job.id, job.generation, false);
      if (invocationId)
        await tx.aiInvocation.update({
          where: { id: invocationId },
          data: { state: "UNCERTAIN", finishedAt: new Date() },
        });
      if (job.chatTurnId)
        await tx.chatTurn.update({
          where: { id: job.chatTurnId },
          data: {
            status: terminal ? "FAILED" : "QUEUED",
            error: terminal ? failure : null,
          },
        });
      if (job.attemptId) {
        const a = await tx.attempt.update({
          where: { id: job.attemptId },
          data: {
            status: terminal ? "FAILED" : "QUEUED",
            error: terminal ? failure : null,
          },
        });
        const latest = await tx.attempt.findFirst({
          where: { simulationId: a.simulationId },
          orderBy: { number: "desc" },
        });
        if (latest?.id === a.id)
          await tx.simulation.updateMany({
            where: { id: a.simulationId, revision: a.revision },
            data: { status: terminal ? "FAILED" : "QUEUED" },
          });
      }
    });
  } finally {
    clearInterval(timer);
    await db.workerSlot.updateMany({
      where: { id: slot, token },
      data: { token: null, leaseUntil: null },
    });
  }
  return true;
}
export async function drainJobs(max = 10) {
  for (let i = 0; i < max; i++) if (!(await runNextJob())) break;
}
