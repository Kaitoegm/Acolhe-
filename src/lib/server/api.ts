import { z } from "zod";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "./db";
import { authenticated, currentUser, login, publicUser, session } from "./auth";
import {
  assertOrigin,
  HttpError,
  requireRole,
  simulationScope,
} from "./security";
import {
  caseSchema,
  credentialsSchema,
  draftSchema,
  studentSchema,
} from "./validation";
import { json } from "./views";
import {
  sigtapCatalog,
  ciapCatalog,
  validateDraftStorage,
  validatePublicationRubric,
} from "../domain";
import { EMPTY_DRAFT, type PatientFacts, type Rubric } from "../contracts";
import { readApi } from "./reads";
import { enqueueChat, enqueueEvaluation, retryEvaluation } from "./enqueue";
import { getUsage } from "./quotas";
import {
  publishEvaluationBundle,
  revisionView,
  saveRevision,
  revisionActions,
} from "./evaluation";
import { validatePublishableCriteria } from "../evaluation/criteria";
import { publicationIssues } from "../evaluation/publication";

type User = Awaited<ReturnType<typeof authenticated>>;
const demoEnabled = () =>
  process.env.ALLOW_DEMO_CASES === "true" &&
  process.env.AI_MODE === "demo" &&
  process.env.NODE_ENV !== "production";
const nameSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const riskRank = (value: string) =>
  ({ HIGH: 0, MEDIUM: 1, LOW: 2, NON_ACUTE: 3 })[value] ?? 4;

async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Envie JSON.");
  if (Number(request.headers.get("content-length")) > 150_000)
    throw new HttpError(413, "Solicitação muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Envie os dados da solicitação.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 150_000) {
      await reader.cancel();
      throw new HttpError(413, "Solicitação muito grande.");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}
async function ownedClass(id: string, user: User) {
  if (
    !(await db.class.findFirst({
      where: { id, instructorId: user.id },
      select: { id: true },
    }))
  )
    throw new HttpError(404, "Turma não encontrada.");
}
function checked<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Dados inválidos.",
    );
  }
}

/** This module only validates, authorizes and enqueues. No AI runtime imports. */
export async function dispatch(
  request: Request,
  parts: string[],
): Promise<unknown> {
  const method = request.method;
  if (method !== "GET") assertOrigin(request);
  const path = parts.join("/");
  if (path === "session" && method === "GET") {
    const u = await currentUser();
    return {
      user: u ? publicUser(u) : null,
      mode: process.env.AI_MODE === "live" ? "live" : "demo",
    };
  }
  if (path === "login" && method === "POST") {
    const b = credentialsSchema.parse(await body(request));
    return { user: await login(b.email, b.password) };
  }
  if (path === "logout" && method === "POST") {
    (await session()).destroy();
    return { ok: true };
  }
  const user = await authenticated();
  if (method === "GET") {
    if (
      parts[0] === "attempts" &&
      parts.length === 3 &&
      parts[2] === "revision"
    ) {
      if (new URL(request.url).search)
        throw new HttpError(400, "Consulta inválida.");
      return revisionView(user, parts[1]);
    }
    if (
      parts[0] === "attempts" &&
      parts.length === 3 &&
      parts[2] === "revision-actions"
    )
      return revisionActions(request, user, parts[1]);
    if (path === "catalogs")
      return { ciap: ciapCatalog, sigtap: sigtapCatalog };
    if (path === "usage") return getUsage(user);
    const result = await readApi(request, parts, user);
    if (result !== undefined) return result;
    throw new HttpError(404, "Recurso não encontrado.");
  }
  if (path === "simulations" && method === "POST") {
    requireRole(user, "STUDENT");
    const { caseId } = z
      .object({ caseId: z.string().min(1) })
      .strict()
      .parse(await body(request));
    const item = await db.clinicalCase.findFirst({
      where: {
        id: caseId,
        assignments: {
          some: { class: { memberships: { some: { userId: user.id } } } },
        },
        OR: [
          { currentStatus: "PUBLISHED" },
          ...(demoEnabled() ? [{ demo: true }] : []),
        ],
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!item?.versions[0])
      throw new HttpError(404, "Caso não disponível para sua turma.");
    const assignment = await db.assignment.findFirst({
      where: { caseId, class: { memberships: { some: { userId: user.id } } } },
      orderBy: { classId: "asc" },
    });
    if (!assignment) throw new HttpError(404, "Caso não atribuído.");
    const version = item.versions[0];
    const patient = version.patient as unknown as PatientFacts;
    const rubric = version.rubric as unknown as Rubric;
    const procedures =
      version.reviewedAt && version.status === "PUBLISHED"
        ? patient.performedProcedures.filter(
            (code) =>
              rubric.expectedProcedures.includes(code) &&
              sigtapCatalog.some((c) => c.code === code),
          )
        : [];
    const s = await db.simulation.upsert({
      where: { studentId_caseId: { studentId: user.id, caseId } },
      update: {},
      create: {
        studentId: user.id,
        classId: assignment.classId,
        caseId,
        caseVersionId: version.id,
        patientName: patient.name,
        patientNameSearch: nameSearch(patient.name),
        draft: json({ ...EMPTY_DRAFT, procedures }),
      },
      select: { id: true },
    });
    return readApi(new Request(request.url), ["simulations", s.id], user);
  }
  if (parts[0] === "simulations" && parts.length === 2 && method === "PUT") {
    requireRole(user, "STUDENT");
    if (
      !(await db.simulation.findFirst({
        where: { id: parts[1], ...simulationScope(user) },
        select: { id: true },
      }))
    )
      throw new HttpError(404, "Atendimento não encontrado.");
    const b = z
      .object({ draft: draftSchema, revision: z.number().int().nonnegative() })
      .strict()
      .parse(await body(request));
    const draft = checked(() => validateDraftStorage(b.draft));
    const changed = await db.simulation.updateMany({
      where: { id: parts[1], studentId: user.id, revision: b.revision },
      data: {
        draft: json(draft),
        revision: { increment: 1 },
        riskRank: riskRank(draft.risk),
        status: "DRAFT",
      },
    });
    if (!changed.count)
      throw new HttpError(
        409,
        "O rascunho foi atualizado em outra janela. Recarregue antes de salvar.",
      );
    return { revision: b.revision + 1 };
  }
  if (parts[0] === "simulations" && parts.length === 3 && method === "POST") {
    requireRole(user, "STUDENT");
    if (parts[2] === "messages") {
      const b = z
        .object({
          content: z.string().trim().min(1).max(3000),
          revision: z.number().int().nonnegative(),
          conversationRevision: z.number().int().nonnegative(),
          idempotencyKey: z.string().min(8).max(150),
        })
        .strict()
        .parse(await body(request));
      return enqueueChat(user, parts[1], b);
    }
    if (parts[2] === "submit") {
      const b = z
        .object({
          revision: z.number().int().nonnegative(),
          conversationRevision: z.number().int().nonnegative(),
          idempotencyKey: z.string().min(8).max(150),
        })
        .strict()
        .parse(await body(request));
      return enqueueEvaluation(user, parts[1], b);
    }
  }
  if (parts[0] === "attempts" && parts.length === 3 && method === "POST") {
    if (parts[2] === "revision") {
      const input = z
        .object({
          version: z.number().int().nonnegative(),
          findingId: z.string().min(1).max(150),
          state: z.enum(["pending", "accepted", "rejected"]),
          idempotencyKey: z.string().min(8).max(150),
        })
        .strict()
        .parse(await body(request));
      return saveRevision(user, parts[1], input);
    }
    if (parts[2] === "retry") {
      requireRole(user, "STUDENT");
      const b = z
        .object({ idempotencyKey: z.string().min(8).max(150) })
        .strict()
        .parse(await body(request));
      return retryEvaluation(user, parts[1], b);
    }
    if (parts[2] === "reviews") {
      requireRole(user, "INSTRUCTOR");
      if (
        !(await db.attempt.findFirst({
          where: { id: parts[1], simulation: simulationScope(user) },
          select: { id: true },
        }))
      )
        throw new HttpError(404, "Tentativa não encontrada.");
      const { comment } = z
        .object({ comment: z.string().trim().min(3).max(10000) })
        .strict()
        .parse(await body(request));
      await db.review.create({
        data: { attemptId: parts[1], authorId: user.id, comment },
      });
      return { ok: true };
    }
  }
  if (parts[0] === "instructor") {
    requireRole(user, "INSTRUCTOR");
    if (path === "instructor/classes" && method === "POST") {
      const { name } = z
        .object({ name: z.string().trim().min(2).max(150) })
        .strict()
        .parse(await body(request));
      return {
        id: (await db.class.create({ data: { name, instructorId: user.id } }))
          .id,
      };
    }
    if (path === "instructor/students" && method === "POST") {
      const b = studentSchema.parse(await body(request));
      await ownedClass(b.classId, user);
      return {
        id: (
          await db.user.create({
            data: {
              name: b.name,
              email: b.email.toLowerCase(),
              passwordHash: await hash(b.password, 12),
              role: "STUDENT",
              memberships: { create: { classId: b.classId } },
            },
          })
        ).id,
      };
    }
    if (path === "instructor/cases" && method === "POST") {
      const b = caseSchema.parse(await body(request));
      return {
        version: 1,
        id: (
          await db.clinicalCase.create({
            data: {
              ownerId: user.id,
              currentStatus: "DRAFT",
              versions: {
                create: {
                  ...b,
                  patient: json(b.patient),
                  rubric: json(b.rubric),
                  version: 1,
                },
              },
            },
          })
        ).id,
      };
    }
    if (
      parts[1] === "cases" &&
      ((parts.length === 3 && method === "PUT") ||
        (parts.length === 4 && parts[3] === "publish" && method === "POST"))
    ) {
      const c = await db.clinicalCase.findFirst({
        where: { id: parts[2], ownerId: user.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!c) throw new HttpError(404, "Caso não encontrado.");
      if (method === "PUT") {
        const raw = await body(request);
        const expected = z
          .object({ expectedVersion: z.number().int().positive().optional() })
          .parse(raw).expectedVersion;
        if (expected !== undefined && expected !== c.currentVersion)
          throw new HttpError(
            409,
            "Este caso mudou em outra janela. Recarregue antes de salvar.",
          );
        const b = caseSchema.parse(raw);
        await db.$transaction(async (tx) => {
          if (
            !(
              await tx.clinicalCase.updateMany({
                where: { id: c.id, currentVersion: c.currentVersion },
                data: {
                  currentVersion: { increment: 1 },
                  currentStatus: "DRAFT",
                },
              })
            ).count
          )
            throw new HttpError(409, "Caso atualizado por outra janela.");
          await tx.caseVersion.create({
            data: {
              ...b,
              patient: json(b.patient),
              rubric: json(b.rubric),
              caseId: c.id,
              version: c.currentVersion + 1,
            },
          });
        });
        return { id: c.id, version: c.currentVersion + 1 };
      }
      const b = z
        .object({
          classIds: z.array(z.string()).min(1).max(100),
          reviewed: z.literal(true),
          expectedVersion: z.number().int().positive().optional(),
        })
        .strict()
        .parse(await body(request));
      if (
        b.expectedVersion !== undefined &&
        b.expectedVersion !== c.currentVersion
      )
        throw new HttpError(
          409,
          "Este caso mudou. Recarregue e revise a versão atual antes de disponibilizar.",
        );
      const ids = [...new Set(b.classIds)];
      if (
        (await db.class.count({
          where: { id: { in: ids }, instructorId: user.id },
        })) !== ids.length
      )
        throw new HttpError(403, "Uma das turmas não pertence a você.");
      const version = c.versions[0];
      const rubric = caseSchema.shape.rubric.parse(version.rubric);
      const issues = publicationIssues(
        version.patient as unknown as PatientFacts,
        rubric,
      );
      if (issues.length)
        throw new HttpError(
          400,
          "Há itens para revisar antes de disponibilizar este caso.",
          "PUBLICATION_REVIEW",
          { issues },
        );
      if (rubric.evaluation)
        checked(() =>
          validatePublishableCriteria(
            rubric.evaluation,
            (version.patient as unknown as PatientFacts).performedProcedures,
          ),
        );
      checked(() =>
        validatePublicationRubric(
          rubric,
          version.patient as unknown as PatientFacts,
        ),
      );
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.clinicalCase.updateMany({
              where: { id: c.id, currentVersion: c.currentVersion },
              data: {
                currentVersion: { increment: 1 },
                currentStatus: "PUBLISHED",
              },
            })
          ).count
        )
          throw new HttpError(409, "Caso atualizado. Recarregue.");
        const published = await tx.caseVersion.create({
          data: {
            caseId: c.id,
            version: c.currentVersion + 1,
            title: version.title,
            description: version.description,
            patient: json(version.patient),
            rubric: json(version.rubric),
            status: "PUBLISHED",
            reviewedAt: new Date(),
            reviewedBy: user.id,
          },
        });
        if (rubric.evaluation) {
          const bundle = await publishEvaluationBundle(
            tx,
            user.id,
            published.id,
            rubric.evaluation,
          );
          await tx.caseVersion.update({
            where: { id: published.id },
            data: { rubric: json({ ...rubric, evaluation: bundle }) },
          });
        }
        await tx.assignment.deleteMany({
          where: { caseId: c.id, class: { instructorId: user.id } },
        });
        for (const classId of ids)
          await tx.assignment.create({ data: { caseId: c.id, classId } });
      });
      return { ok: true, version: c.currentVersion + 1 };
    }
  }
  throw new HttpError(404, "Recurso não encontrado.");
}

export async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const result = await dispatch(request, (await context.params).path);
    const accepted = result && typeof result === "object" && "jobId" in result;
    return Response.json(result, {
      status: accepted ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
          ...error.details,
        },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store", ...error.headers },
        },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Dados inválidos. Verifique os campos preenchidos." },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      return Response.json(
        {
          error:
            "Registro existente ou atualizado simultaneamente. Tente novamente com a mesma chave.",
        },
        { status: 409 },
      );
    console.error(
      "API failure",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "Não foi possível concluir a solicitação." },
      { status: 500 },
    );
  }
}
