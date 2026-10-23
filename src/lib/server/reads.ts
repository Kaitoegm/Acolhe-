import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  HttpError,
  requireRole,
  simulationScope,
  type Identity,
} from "./security";
import { pagination, keyset, type Keys } from "./pagination";
import { casePublic, casePrivate } from "./views";
import type { Draft, PatientFacts, Evaluation } from "../contracts";

const dated = (r: { id: string; createdAt: Date }): Keys => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
});
const attemptSelect = {
  id: true,
  number: true,
  status: true,
  error: true,
  createdAt: true,
  job: { select: { stage: true, progressVersion: true, generation: true } },
} as const;
const summary = (a: {
  id: string;
  number: number;
  status: string;
  error: string | null;
  createdAt: Date;
  job?: { stage: string; progressVersion: number; generation: number } | null;
}) => {
  const { job, ...rest } = a;
  return {
    ...rest,
    createdAt: a.createdAt.toISOString(),
    ...(job
      ? {
          progress: {
            stage: job.stage,
            version: job.progressVersion,
            generation: job.generation,
          },
        }
      : {}),
  };
};
const publicSelect = {
  id: true,
  caseId: true,
  title: true,
  description: true,
  version: true,
  status: true,
  patient: true,
  reviewedAt: true,
  reviewedBy: true,
  createdAt: true,
} as const;
function noQuery(request: Request) {
  if (new URL(request.url).search)
    throw new HttpError(400, "Esta consulta não aceita parâmetros.");
}
const risks = ["HIGH", "MEDIUM", "LOW", "NON_ACUTE", ""];
function enumFilter(value: string | undefined, values: string[]) {
  if (value !== undefined && !values.includes(value))
    throw new HttpError(400, "Filtro inválido.");
  return value;
}
async function own(id: string, user: Identity) {
  const s = await db.simulation.findFirst({
    where: { id, ...simulationScope(user) },
    select: { id: true },
  });
  if (!s) throw new HttpError(404, "Atendimento não encontrado.");
}
function caseScope(
  user: Identity,
  instructor = false,
): Prisma.ClinicalCaseWhereInput {
  if (instructor) return { ownerId: user.id };
  const demo =
    process.env.ALLOW_DEMO_CASES === "true" &&
    process.env.AI_MODE !== "live" &&
    process.env.NODE_ENV !== "production";
  return {
    assignments: {
      some: { class: { memberships: { some: { userId: user.id } } } },
    },
    OR: [{ currentStatus: "PUBLISHED" }, ...(demo ? [{ demo: true }] : [])],
  };
}

export async function readApi(
  request: Request,
  parts: string[],
  user: Identity,
): Promise<unknown | undefined> {
  if (request.method !== "GET") return undefined;
  const path = parts.join("/");
  const instructor = parts[0] === "instructor";
  if (instructor) requireRole(user, "INSTRUCTOR");
  if (path === "simulations" || path === "instructor/simulations") {
    const p = pagination(
      request,
      [user.id, user.role, path],
      ["q", "status", "risk", "classId", "order"],
    );
    const f = p.filters;
    enumFilter(f.status, ["DRAFT", "QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
    enumFilter(f.risk, risks);
    enumFilter(f.order, ["newest", "arrival", "risk"]);
    if (f.q !== undefined && (!f.q.trim() || f.q.length > 150))
      throw new HttpError(400, "Busca inválida.");
    if (f.classId !== undefined && !f.classId)
      throw new HttpError(400, "Turma inválida.");
    const asc = f.order === "arrival",
      risk = f.order === "risk";
    const rows = await db.simulation.findMany({
      where: {
        AND: [
          simulationScope(user),
          ...(f.q
            ? [
                {
                  patientNameSearch: {
                    contains: f.q
                      .trim()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toLowerCase(),
                  },
                },
              ]
            : []),
          ...(f.status ? [{ status: f.status }] : []),
          ...(f.risk !== undefined
            ? [{ riskRank: risks.indexOf(f.risk) }]
            : []),
          ...(f.classId ? [{ classId: f.classId }] : []),
          keyset(p.after, asc, risk),
        ],
      },
      orderBy: [
        ...(risk ? [{ riskRank: "asc" as const }] : []),
        { createdAt: asc ? "asc" : "desc" },
        { id: asc ? "asc" : "desc" },
      ],
      take: p.limit + 1,
      select: {
        id: true,
        caseId: true,
        studentId: true,
        patientName: true,
        riskRank: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        caseVersion: { select: { patient: true } },
        _count: { select: { attempts: true } },
        ...(instructor
          ? {
              student: { select: { name: true } },
              class: { select: { name: true } },
            }
          : {}),
      },
    });
    const page = p.page(rows, (r) => ({
      ...dated(r),
      ...(risk ? { riskRank: r.riskRank } : {}),
    }));
    return {
      ...page,
      items: page.items.map((r) => ({
        id: r.id,
        caseId: r.caseId,
        name: r.patientName,
        age: (r.caseVersion.patient as unknown as PatientFacts).age,
        status: r.status,
        risk: risks[r.riskRank] ?? "",
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        attempts: r._count.attempts,
        ...(instructor
          ? {
              studentId: r.studentId,
              studentName: r.student?.name,
              className: r.class?.name,
            }
          : {}),
      })),
    };
  }
  if (path === "cases" || path === "instructor/cases") {
    const p = pagination(
      request,
      [user.id, user.role, path],
      instructor ? ["q", "status", "classId"] : [],
    );
    if (
      p.filters.q !== undefined &&
      (!p.filters.q.trim() || p.filters.q.length > 150)
    )
      throw new HttpError(400, "Busca inválida.");
    enumFilter(p.filters.status, ["PUBLISHED", "REVIEW"]);
    if (p.filters.classId !== undefined && !p.filters.classId)
      throw new HttpError(400, "Turma inválida.");
    const rows = await db.clinicalCase.findMany({
      where: {
        AND: [
          caseScope(user, instructor),
          keyset(p.after),
          ...(p.filters.q
            ? [
                {
                  versions: {
                    some: { title: { contains: p.filters.q.trim() } },
                  },
                },
              ]
            : []),
          ...(p.filters.status === "PUBLISHED"
            ? [{ currentStatus: "PUBLISHED" }]
            : p.filters.status === "REVIEW"
              ? [{ currentStatus: { not: "PUBLISHED" } }]
              : []),
          ...(p.filters.classId
            ? [
                {
                  assignments: {
                    some: {
                      classId: p.filters.classId,
                      class: { instructorId: user.id },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: {
        id: true,
        createdAt: true,
        assignments: {
          where: { class: { instructorId: user.id } },
          take: 100,
          select: { class: { select: { id: true, name: true } } },
        },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: publicSelect,
        },
      },
    });
    const page = p.page(rows, dated);
    return {
      ...page,
      items: page.items.map((r) => {
        const v = r.versions[0],
          patient = v.patient as unknown as PatientFacts;
        return {
          id: r.id,
          title: v.title,
          description: v.description,
          version: v.version,
          status: v.status,
          patientName: patient.name,
          age: patient.age,
          ...(instructor
            ? {
                reviewedAt: v.reviewedAt?.toISOString() ?? null,
                reviewedBy: v.reviewedBy,
                classes: r.assignments?.map((a) => a.class),
              }
            : {}),
        };
      }),
    };
  }
  if (
    instructor &&
    parts[1] === "cases" &&
    parts.length === 4 &&
    parts[3] === "versions"
  ) {
    const owned = await db.clinicalCase.findFirst({
      where: { id: parts[2], ownerId: user.id },
      select: { id: true },
    });
    if (!owned) throw new HttpError(404, "Caso não encontrado.");
    const p = pagination(request, [user.id, path]);
    const rows = await db.caseVersion.findMany({
      where: { AND: [{ caseId: owned.id }, keyset(p.after)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: {
        id: true,
        createdAt: true,
        version: true,
        status: true,
        reviewedAt: true,
      },
    });
    const page = p.page(rows, dated);
    return {
      ...page,
      items: page.items.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        reviewedAt: v.reviewedAt?.toISOString() ?? null,
      })),
    };
  }
  if (
    (parts[0] === "cases" && parts.length === 2) ||
    (parts[0] === "instructor" && parts[1] === "cases" && parts.length === 3)
  ) {
    noQuery(request);
    const id = parts[instructor ? 2 : 1];
    const c = await db.clinicalCase.findFirst({
      where: { id, ...caseScope(user, instructor) },
      select: {
        assignments: {
          where: { class: { instructorId: user.id } },
          take: 100,
          select: { classId: true, class: { select: { name: true } } },
        },
        versions: {
          take: 1,
          orderBy: { version: "desc" },
          ...(instructor ? {} : { select: publicSelect }),
        },
      },
    });
    if (!c?.versions[0]) throw new HttpError(404, "Caso não encontrado.");
    const v = c.versions[0];
    return {
      case: instructor
        ? {
            ...casePrivate(v),
            classIds: c.assignments?.map((a) => a.classId),
            classes: c.assignments?.map((a) => ({
              id: a.classId,
              name: a.class.name,
            })),
          }
        : casePublic(v),
    };
  }
  if (path === "instructor/classes") {
    const p = pagination(request, [user.id, path]);
    const rows = await db.class.findMany({
      where: { AND: [{ instructorId: user.id }, keyset(p.after)] },
      take: p.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });
    const page = p.page(rows, dated);
    return {
      ...page,
      items: page.items.map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c._count.memberships,
      })),
    };
  }
  if (path === "instructor/students") {
    const p = pagination(request, [user.id, path], ["classId"]);
    if (p.filters.classId !== undefined && !p.filters.classId)
      throw new HttpError(400, "Turma inválida.");
    const memberScope = {
      class: { instructorId: user.id },
      ...(p.filters.classId ? { classId: p.filters.classId } : {}),
    };
    const rows = await db.user.findMany({
      where: {
        AND: [
          { role: "STUDENT", memberships: { some: memberScope } },
          keyset(p.after),
        ],
      },
      take: p.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        memberships: { where: memberScope, select: { classId: true } },
      },
    });
    const page = p.page(rows, dated);
    return {
      ...page,
      items: page.items.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        classIds: s.memberships.map((m) => m.classId),
      })),
    };
  }
  if (
    parts[0] === "simulations" &&
    parts[1] &&
    (parts.length === 2 ||
      (parts.length === 3 &&
        ["messages", "attempts", "status"].includes(parts[2])))
  ) {
    const id = parts[1];
    if (parts.length === 2 || parts[2] === "status") noQuery(request);
    await own(id, user);
    const p = pagination(request, [user.id, user.role, path]);
    if (parts[2] === "messages") {
      const rows = await db.message.findMany({
        where: { AND: [{ simulationId: id }, keyset(p.after)] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: p.limit + 1,
        select: { id: true, role: true, content: true, createdAt: true },
      });
      const page = p.page(rows, dated);
      return {
        ...page,
        items: page.items.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }
    if (parts[2] === "attempts") {
      const rows = await db.attempt.findMany({
        where: {
          AND: [{ simulationId: id }, keyset(p.after, false, false, true)],
        },
        orderBy: [{ number: "desc" }, { id: "desc" }],
        take: p.limit + 1,
        select: attemptSelect,
      });
      const page = p.page(rows, (a) => ({ id: a.id, number: a.number }));
      return { ...page, items: page.items.map(summary) };
    }
    if (parts[2] === "status") {
      const s = await db.simulation.findUniqueOrThrow({
        where: { id },
        select: {
          revision: true,
          conversationRevision: true,
          status: true,
          attempts: {
            take: 1,
            orderBy: { number: "desc" },
            select: attemptSelect,
          },
          chatTurns: {
            take: 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, status: true, error: true },
          },
        },
      });
      const latestTurn = s.chatTurns[0] ?? null;
      return {
        revision: s.revision,
        conversationRevision: s.conversationRevision,
        status: s.status,
        latestAttempt: s.attempts[0] ? summary(s.attempts[0]) : null,
        latestTurn,
        pendingChat:
          latestTurn && ["QUEUED", "RUNNING"].includes(latestTurn.status)
            ? latestTurn
            : null,
        worker: await workerStatus(),
      };
    }
    const s = await db.simulation.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        draft: true,
        revision: true,
        conversationRevision: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        caseVersion: { select: publicSelect },
        attempts: {
          take: 1,
          orderBy: { number: "desc" },
          select: attemptSelect,
        },
      },
    });
    return {
      simulation: {
        id: s.id,
        case: casePublic(s.caseVersion),
        draft: s.draft as unknown as Draft,
        revision: s.revision,
        conversationRevision: s.conversationRevision,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        messages: [],
        attempts: [],
        latestAttempt: s.attempts[0] ? summary(s.attempts[0]) : null,
      },
    };
  }
  if (
    parts[0] === "attempts" &&
    parts[1] &&
    (parts.length === 2 || (parts.length === 3 && parts[2] === "reviews"))
  ) {
    if (parts.length === 2) noQuery(request);
    const p = pagination(request, [user.id, user.role, path]);
    const a = await db.attempt.findFirst({
      where: { id: parts[1], simulation: simulationScope(user) },
      select: { id: true },
    });
    if (!a) throw new HttpError(404, "Tentativa não encontrada.");
    if (parts[2] === "reviews") {
      const rows = await db.review.findMany({
        where: { AND: [{ attemptId: a.id }, keyset(p.after)] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: p.limit + 1,
        select: {
          id: true,
          comment: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      });
      const page = p.page(rows, dated);
      return {
        ...page,
        items: page.items.map((r) => ({
          id: r.id,
          comment: r.comment,
          createdAt: r.createdAt.toISOString(),
          author: r.author.name,
        })),
      };
    }
    const detail = await db.attempt.findUniqueOrThrow({
      where: { id: a.id },
      select: { ...attemptSelect, snapshot: true, feedback: true },
    });
    return {
      attempt: {
        ...summary(detail),
        snapshot: detail.snapshot,
        feedback: detail.feedback,
        reviews: [],
      },
    };
  }
  if (
    parts.length === 4 &&
    parts[0] === "instructor" &&
    parts[1] === "simulations" &&
    parts[3] === "progress"
  ) {
    noQuery(request);
    await own(parts[2], user);
    const counts: Record<string, Record<string, number>> = {};
    let cursor: string | undefined;
    let total = 0;
    const nature = { errors: 0, improvements: 0, uncertain: 0 };
    for (;;) {
      const batch = await db.attempt.findMany({
        where: {
          simulationId: parts[2],
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 200,
        select: { id: true, feedback: true, status: true },
      });
      for (const a of batch) {
        total++;
        const feedback = a.feedback as unknown as Evaluation | null;
        for (const item of feedback?.items ?? []) {
          const kind = (item as import("../evaluation/contracts").FindingV2)
            .kind;
          if (item.level !== "ADEQUATE") {
            if (kind === "ERROR") nature.errors++;
            else if (kind === "IMPROVEMENT") nature.improvements++;
            else if (kind === "UNCERTAIN") nature.uncertain++;
          }
          const category = (counts[item.category] ??= {
            ADEQUATE: 0,
            REVIEW: 0,
            ATTENTION: 0,
          });
          category[item.level] = (category[item.level] ?? 0) + 1;
        }
      }
      if (batch.length < 200) break;
      cursor = batch[batch.length - 1].id;
    }
    const latestRows = await db.attempt.findMany({
      where: {
        simulationId: parts[2],
        status: "COMPLETED",
        feedback: { not: Prisma.JsonNull },
      },
      orderBy: [{ number: "desc" }, { id: "desc" }],
      take: 2,
      select: { id: true, number: true, createdAt: true, feedback: true },
    });
    const latest = latestRows.map((a) => {
      const dimensions: Record<string, Record<string, number>> = {};
      for (const item of (a.feedback as unknown as Evaluation)?.items ?? []) {
        const levels = (dimensions[item.category] ??= {
          ADEQUATE: 0,
          REVIEW: 0,
          ATTENTION: 0,
        });
        levels[item.level] = (levels[item.level] ?? 0) + 1;
      }
      return {
        id: a.id,
        number: a.number,
        createdAt: a.createdAt.toISOString(),
        dimensions: Object.entries(dimensions).map(([category, levels]) => ({
          category,
          ...levels,
        })),
      };
    });
    return {
      totalAttempts: total,
      nature,
      dimensions: Object.entries(counts).map(([category, levels]) => ({
        category,
        ...levels,
      })),
      latest,
    };
  }
  return undefined;
}
async function workerStatus() {
  const { workerHealth } = await import("./worker-state");
  return workerHealth();
}
