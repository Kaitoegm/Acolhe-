import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { json } from "./views";
import { HttpError, simulationScope, type Identity } from "./security";
import { validatePublishableCriteria } from "../evaluation/criteria";
import {
  evaluationBundleSchema,
  isEvaluationV2,
  type EvaluationV2,
  type FindingV2,
} from "../evaluation/contracts";
import {
  createRevision,
  decideRevision,
  type Decision,
} from "../evaluation/revisions";
import { plainDocument, buildTextMap } from "../evaluation/anchors";
import type { Draft, Evaluation, PatientFacts } from "../contracts";
import { pagination, keyset } from "./pagination";
export async function publishEvaluationBundle(
  tx: Prisma.TransactionClient,
  ownerId: string,
  caseVersionId: string,
  value: unknown,
) {
  const version = await tx.caseVersion.findFirst({
    where: {
      id: caseVersionId,
      case: { ownerId, owner: { role: "INSTRUCTOR", active: true } },
    },
    select: { id: true, patient: true },
  });
  if (!version) throw new HttpError(404, "Versão do caso não encontrada.");
  const bundle = validatePublishableCriteria(
    value,
    (version.patient as unknown as PatientFacts).performedProcedures,
  );
  const at = new Date().toISOString();
  for (const s of bundle.sources) {
    s.hash = createHash("sha256")
      .update(JSON.stringify({ ...s, hash: undefined }))
      .digest("hex");
    const source = await tx.protocolSource.upsert({
      where: { ownerId_key: { ownerId, key: s.id } },
      create: { ownerId, key: s.id },
      update: {},
    });
    await tx.protocolVersion.upsert({
      where: { sourceId_hash: { sourceId: source.id, hash: s.hash } },
      create: { sourceId: source.id, hash: s.hash, data: json(s) },
      update: {},
    });
  }
  for (const c of bundle.criteria) {
    c.approvedBy = ownerId;
    c.approvedAt = at;
    const v = await tx.criterionVersion.create({
      data: {
        data: json({
          ...c,
          sources: bundle.sources.filter((s) => c.sourceRefs.includes(s.id)),
        }),
      },
    });
    await tx.caseCriterion.create({
      data: { caseVersionId, criterionVersionId: v.id },
    });
  }
  return bundle;
}
export async function revisionView(user: Identity, attemptId: string) {
  const a = await db.attempt.findFirst({
    where: { id: attemptId, simulation: simulationScope(user) },
    select: { snapshot: true, feedback: true, status: true },
  });
  if (!a) throw new HttpError(404, "Tentativa não encontrada.");
  const feedback = a.feedback as unknown as Evaluation;
  if (a.status !== "COMPLETED" || !isEvaluationV2(feedback))
    throw new HttpError(409, "Aguarde a avaliação para revisar.");
  const row = await db.attemptRevision.findUnique({ where: { attemptId } });
  const draft = a.snapshot as unknown as Draft;
  return {
    version: row?.version ?? 0,
    document: row?.document ?? draft.document ?? plainDocument(draft.text),
    decisions: row?.decisions ?? {},
    snapshotHash: feedback.snapshotHash,
  };
}
export async function saveRevision(
  user: Identity,
  attemptId: string,
  input: {
    version: number;
    findingId: string;
    state: Decision;
    idempotencyKey: string;
  },
) {
  if (user.role !== "STUDENT")
    throw new HttpError(403, "Somente o aluno pode revisar seu registro.");
  return db.$transaction(async (tx) => {
    if (
      !(
        await tx.user.updateMany({
          where: { id: user.id, active: true },
          data: { active: true },
        })
      ).count
    )
      throw new HttpError(403, "Conta inativa.");
    const a = await tx.attempt.findFirst({
      where: { id: attemptId, simulation: simulationScope(user) },
      include: { simulation: { select: { studentId: true } } },
    });
    if (!a) throw new HttpError(404, "Tentativa não encontrada.");
    const feedback = a.feedback as unknown as EvaluationV2;
    if (a.status !== "COMPLETED" || !isEvaluationV2(feedback))
      throw new HttpError(409, "Avaliação indisponível.");
    const draft = a.snapshot as unknown as Draft;
    const base = draft.document ?? plainDocument(draft.text);
    const row = await tx.attemptRevision.upsert({
      where: { attemptId },
      create: { attemptId, document: json(base), decisions: {} },
      update: {},
    });
    if (
      await tx.revisionAction.findUnique({
        where: {
          revisionId_idempotencyKey: {
            revisionId: row.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      })
    )
      return {
        version: row.version,
        document: row.document,
        decisions: row.decisions,
      };
    if (row.version !== input.version)
      throw new HttpError(
        409,
        "A revisão foi atualizada em outra janela. Recarregue.",
      );
    const item = feedback.items.find((i) => i.id === input.findingId);
    if (!item?.replacement || !item.anchor)
      throw new HttpError(400, "Esta sugestão precisa de revisão manual.");
    let revision = {
      ...createRevision(base, feedback.items as FindingV2[]),
      decisions: row.decisions as Record<string, Decision>,
    };
    try {
      revision = decideRevision(revision, input.findingId, input.state);
    } catch {
      throw new HttpError(
        400,
        "Não foi possível aplicar a sugestão com segurança.",
      );
    }
    if (revision.conflicts.length)
      throw new HttpError(
        409,
        "Sugestões sobrepostas. Desfaça a alteração conflitante.",
      );
    if (buildTextMap(revision.document).text.length > 4000)
      throw new HttpError(400, "Limite de caracteres excedido.");
    if (
      !(
        await tx.attemptRevision.updateMany({
          where: { id: row.id, version: input.version },
          data: {
            version: { increment: 1 },
            document: json(revision.document),
            decisions: json(revision.decisions),
          },
        })
      ).count
    )
      throw new HttpError(409, "Revisão atualizada. Recarregue.");
    await tx.revisionAction.create({
      data: {
        revisionId: row.id,
        idempotencyKey: input.idempotencyKey,
        findingId: input.findingId,
        state: input.state,
        authorId: user.id,
      },
    });
    return {
      version: row.version + 1,
      document: revision.document,
      decisions: revision.decisions,
    };
  });
}
export { evaluationBundleSchema };
export async function revisionActions(
  request: Request,
  user: Identity,
  attemptId: string,
) {
  const a = await db.attempt.findFirst({
    where: { id: attemptId, simulation: simulationScope(user) },
    select: { id: true },
  });
  if (!a) throw new HttpError(404, "Tentativa não encontrada.");
  const p = pagination(request, [
    user.id,
    user.role,
    "revision-actions",
    attemptId,
  ]);
  const rows = await db.revisionAction.findMany({
    where: { AND: [{ revision: { attemptId } }, keyset(p.after)] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: p.limit + 1,
    select: {
      id: true,
      findingId: true,
      state: true,
      authorId: true,
      createdAt: true,
    },
  });
  const page = p.page(rows, (r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    ...page,
    items: page.items.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
