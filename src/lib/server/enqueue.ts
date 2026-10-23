import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError, type Identity } from "./security";
import { validateSubmissionDraft } from "../domain";
import { reserve } from "./quotas";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
type Input = {
  revision: number;
  conversationRevision: number;
  idempotencyKey: string;
};
export function checkPayload(v: unknown) {
  if (Buffer.byteLength(JSON.stringify(v), "utf8") > 32000)
    throw new HttpError(
      413,
      "Entrada da IA excede 32.000 bytes. Reduza o registro ou a conversa.",
      "AI_PAYLOAD_TOO_LARGE",
    );
}
async function lock(tx: Prisma.TransactionClient, user: Identity) {
  if (user.role !== "STUDENT")
    throw new HttpError(403, "Somente aluno pode enviar.");
  const ok = await tx.user.updateMany({
    where: { id: user.id, active: true },
    data: { active: true },
  });
  if (!ok.count) throw new HttpError(403, "Conta inativa.");
}
async function simulation(
  tx: Prisma.TransactionClient,
  user: Identity,
  id: string,
) {
  const s = await tx.simulation.findFirst({
    where: {
      id,
      studentId: user.id,
      class: { memberships: { some: { userId: user.id } } },
    },
    include: { caseVersion: true, class: true },
  });
  if (!s) throw new HttpError(404, "Atendimento não encontrado.");
  return s;
}
const response = (job: { id: string; state: string }, resourceId: string) => ({
  jobId: job.id,
  resourceId,
  status: job.state,
});
export async function enqueueChat(
  user: Identity,
  simulationId: string,
  input: Input & { content: string },
) {
  return db.$transaction(async (tx) => {
    await lock(tx, user);
    const s = await simulation(tx, user, simulationId);
    const duplicate = await tx.chatTurn.findUnique({
      where: {
        simulationId_idempotencyKey: {
          simulationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { job: true },
    });
    if (duplicate?.job)
      return {
        ...response(duplicate.job, duplicate.id),
        conversationRevision: s.conversationRevision,
      };
    if (!input.content.trim() || input.content.length > 2000)
      throw new HttpError(400, "Mensagem inválida.");
    if (
      s.revision !== input.revision ||
      s.conversationRevision !== input.conversationRevision
    )
      throw new HttpError(
        409,
        "Atendimento atualizado. Recarregue.",
        "REVISION_CONFLICT",
      );
    if (
      await tx.chatTurn.count({
        where: { simulationId, status: { in: ["QUEUED", "RUNNING"] } },
      })
    )
      throw new HttpError(409, "Aguarde a resposta pendente.", "CHAT_PENDING");
    if ((await tx.message.count({ where: { simulationId } })) >= 100)
      throw new HttpError(400, "Limite de 50 trocas atingido.");
    const messages = (
      await tx.message.findMany({
        where: { simulationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
      })
    ).reverse();
    const conversation = [
      ...messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      { role: "user", content: input.content },
    ];
    checkPayload({ patient: s.caseVersion.patient, messages: conversation });
    const turn = await tx.chatTurn.create({
      data: {
        simulationId,
        idempotencyKey: input.idempotencyKey,
        revision: s.revision,
        conversationRevision: s.conversationRevision + 1,
        content: input.content,
        patient: s.caseVersion.patient as Prisma.InputJsonValue,
        conversation: json(conversation),
        job: {
          create: {
            kind: "PATIENT_REPLY",
            ownerId: user.id,
            instructorId: s.class.instructorId,
          },
        },
      },
      include: { job: true },
    });
    await reserve(
      tx,
      user.id,
      s.class.instructorId,
      "chat",
      turn.job!.id,
      1,
      `chat:${simulationId}:${input.idempotencyKey}`,
    );
    await tx.message.create({
      data: { simulationId, role: "user", content: input.content },
    });
    if (
      !(
        await tx.simulation.updateMany({
          where: {
            id: simulationId,
            revision: input.revision,
            conversationRevision: input.conversationRevision,
          },
          data: { conversationRevision: { increment: 1 } },
        })
      ).count
    )
      throw new HttpError(
        409,
        "Atendimento atualizado. Recarregue.",
        "REVISION_CONFLICT",
      );
    return {
      ...response(turn.job!, turn.id),
      conversationRevision: s.conversationRevision + 1,
    };
  });
}
export async function enqueueEvaluation(
  user: Identity,
  simulationId: string,
  input: Input,
) {
  return db.$transaction(async (tx) => {
    await lock(tx, user);
    const s = await simulation(tx, user, simulationId);
    const old = await tx.attempt.findFirst({
      where: {
        simulationId,
        OR: [
          { idempotencyKey: input.idempotencyKey },
          { revision: input.revision },
        ],
      },
      include: { job: true },
    });
    if (old?.job) return response(old.job, old.id);
    if (
      s.revision !== input.revision ||
      s.conversationRevision !== input.conversationRevision
    )
      throw new HttpError(
        409,
        "Há alterações mais recentes. Salve novamente.",
        "REVISION_CONFLICT",
      );
    if (
      await tx.chatTurn.count({
        where: { simulationId, status: { in: ["QUEUED", "RUNNING"] } },
      })
    )
      throw new HttpError(
        409,
        "Aguarde a resposta do paciente.",
        "CHAT_PENDING",
      );
    let draft;
    try {
      draft = validateSubmissionDraft(s.draft);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Registro inválido.",
      );
    }
    const messages = await tx.message.findMany({
      where: { simulationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const snapshot = {
      evaluationVersion:
        process.env.EVALUATION_V2_ENABLED === "false" ||
        (process.env.EVALUATION_V2_CLASS_IDS &&
          !process.env.EVALUATION_V2_CLASS_IDS.split(",")
            .map((v) => v.trim())
            .includes(s.classId))
          ? 1
          : 2,
      caseId: s.caseId,
      version: s.caseVersion.version,
      patient: s.caseVersion.patient,
      rubric: s.caseVersion.rubric,
      reviewed: !!s.caseVersion.reviewedAt,
    };
    checkPayload({ ...snapshot, draft, messages });
    const last = await tx.attempt.findFirst({
      where: { simulationId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const a = await tx.attempt.create({
      data: {
        simulationId,
        number: (last?.number ?? 0) + 1,
        revision: input.revision,
        idempotencyKey: input.idempotencyKey,
        snapshot: json(draft),
        conversation: json(messages),
        caseSnapshot: json(snapshot),
        evaluationVersion: snapshot.evaluationVersion,
        evidenceSnapshot: json(
          (s.caseVersion.rubric as unknown as import("../contracts").Rubric)
            .evaluation ?? { sources: [], criteria: [] },
        ),
        job: {
          create: { ownerId: user.id, instructorId: s.class.instructorId },
        },
      },
      include: { job: true },
    });
    await reserve(
      tx,
      user.id,
      s.class.instructorId,
      "evaluation",
      a.job!.id,
      1,
      `evaluation:${simulationId}:${input.idempotencyKey}`,
    );
    if (
      !(
        await tx.simulation.updateMany({
          where: {
            id: simulationId,
            revision: input.revision,
            conversationRevision: input.conversationRevision,
          },
          data: { status: "QUEUED" },
        })
      ).count
    )
      throw new HttpError(
        409,
        "Atendimento atualizado. Recarregue.",
        "REVISION_CONFLICT",
      );
    return response(a.job!, a.id);
  });
}
async function retry(
  user: Identity,
  id: string,
  input: { idempotencyKey: string },
  chat: boolean,
) {
  return db.$transaction(async (tx) => {
    await lock(tx, user);
    const resource = chat
      ? await tx.chatTurn.findUnique({ where: { id }, include: { job: true } })
      : await tx.attempt.findUnique({ where: { id }, include: { job: true } });
    if (!resource?.job) throw new HttpError(404, "Trabalho não encontrado.");
    const s = await simulation(tx, user, resource.simulationId);
    const job = resource.job;
    const key = `retry:${job.id}:${input.idempotencyKey}`;
    const duplicate = await tx.usageReservation.findUnique({ where: { key } });
    if (duplicate) return response(job, id);
    if (resource.status !== "FAILED" || job.state !== "FAILED")
      throw new HttpError(
        409,
        "Somente trabalhos com falha podem ser repetidos.",
      );
    if (
      chat &&
      (await tx.chatTurn.count({
        where: { simulationId: s.id, status: { in: ["QUEUED", "RUNNING"] } },
      }))
    )
      throw new HttpError(409, "Aguarde a resposta pendente.", "CHAT_PENDING");
    if (
      chat &&
      "conversationRevision" in resource &&
      s.conversationRevision !== resource.conversationRevision
    )
      throw new HttpError(
        409,
        "A conversa já mudou; envie uma nova mensagem.",
        "REVISION_CONFLICT",
      );
    const generation = job.generation + 1;
    await reserve(
      tx,
      user.id,
      s.class.instructorId,
      chat ? "chat" : "evaluation",
      job.id,
      generation,
      key,
    );
    await tx.job.update({
      where: { id: job.id },
      data: {
        generation,
        stage: "QUEUED",
        progressVersion: { increment: 1 },
        tries: 0,
        state: "QUEUED",
        leaseToken: null,
        leaseUntil: null,
        availableAt: new Date(),
      },
    });
    if (chat)
      await tx.chatTurn.update({
        where: { id },
        data: { status: "QUEUED", error: null },
      });
    else {
      await tx.attempt.update({
        where: { id },
        data: { status: "QUEUED", error: null },
      });
      await tx.simulation.updateMany({
        where: { id: s.id, revision: resource.revision },
        data: { status: "QUEUED" },
      });
    }
    return { jobId: job.id, resourceId: id, status: "QUEUED" };
  });
}
export const retryEvaluation = (
  user: Identity,
  id: string,
  input: { idempotencyKey: string },
) => retry(user, id, input, false);
export const retryChat = (
  user: Identity,
  id: string,
  input: { idempotencyKey: string },
) => retry(user, id, input, true);
