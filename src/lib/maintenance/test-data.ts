import type { Prisma } from "@prisma/client";
type Store = Prisma.TransactionClient;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function isAutomatedUser(u: {
  email: string;
  name: string;
  role: string;
}): boolean {
  if (u.role === "INSTRUCTOR")
    return (
      u.name === "Instrutor teste automatizado" &&
      new RegExp(`^instructor-e2e-${uuid}@test\\.local$`, "i").test(u.email)
    );
  if (u.role !== "STUDENT") return false;
  return (
    (["Aluno E2E","Aluno teste automatizado"].includes(u.name) &&
      /^e2e-flow-\d{13}@acolhe\.local$/.test(u.email)) ||
    (u.name === "Aluno de teste" &&
      /^teste-\d{13}@acolhe\.local$/.test(u.email)) ||
    (u.name === "Aluno revisão animada" &&
      /^review-e2e-\d{13}@acolhe\.local$/.test(u.email)) ||
    (u.name === "Aluno teste de publicação" &&
      /^publication-\d{13}@test\.local$/.test(u.email))
  );
}
export const isAutomatedClass = (name: string) =>
  /^Teste isolamento \d{13}$/.test(name) ||
  new RegExp(`^Teste automatizado ${uuid}$`, "i").test(name);
const fixtureTitles = new Set([
  "Gestante — acolhimento inicial",
  "Pessoa com hipertensão — acompanhamento",
  "Pessoa idosa — relato de cansaço",
]);
export interface CleanupPlan {
  userIds: string[];
  classIds: string[];
  caseIds: string[];
  simulationIds: string[];
  criterionIds: string[];
  skipped: string[];
  summary: {
    users: number;
    classes: number;
    cases: number;
    simulations: number;
  };
}
export async function planTestCleanup(
  store: Store,
  ownerIds?: string[],
): Promise<CleanupPlan> {
  const users = await store.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      memberships: { select: { classId: true } },
    },
    take: 10001,
  });
  const classes = await store.class.findMany({
    select: {
      id: true,
      name: true,
      instructorId: true,
      memberships: { select: { userId: true } },
      simulations: { select: { id: true, studentId: true } },
    },
    take: 10001,
  });
  const cases = await store.clinicalCase.findMany({
    select: {
      id: true,
      ownerId: true,
      slug: true,
      versions: { select: { title: true }, take: 21 },
    },
    take: 10001,
  });
  if (users.length > 10000 || classes.length > 10000 || cases.length > 10000)
    throw new Error("Inventário excede o limite desta ferramenta local.");
  const teachers = users.filter(
    (u) =>
      u.role === "INSTRUCTOR" &&
      isAutomatedUser(u) &&
      (!ownerIds || ownerIds.includes(u.id)),
  );
  const teachersSet = new Set(teachers.map((u) => u.id));
  const scopedClasses = new Set(
    classes.filter((c) => teachersSet.has(c.instructorId)).map((c) => c.id),
  );
  const students = users.filter(
    (u) =>
      u.role === "STUDENT" &&
      isAutomatedUser(u) &&
      (!ownerIds || u.memberships.some((m) => scopedClasses.has(m.classId))),
  );
  const studentIds = new Set(students.map((s) => s.id));
  const skipped: string[] = [];
  const testClasses = classes
    .filter(
      (c) =>
        isAutomatedClass(c.name) &&
        (teachersSet.has(c.instructorId) ||
          (!ownerIds &&
            users.some(
              (u) =>
                u.id === c.instructorId && u.email === "instrutor@acolhe.local",
            ))),
    )
    .filter((c) => {
      const safe =
        c.memberships.every((m) => studentIds.has(m.userId)) &&
        c.simulations.every((s) => studentIds.has(s.studentId));
      if (!safe)
        skipped.push(
          `Turma preservada por vínculo não identificado como teste: ${c.id}`,
        );
      return safe;
    });
  let testCases = cases.filter(
    (c) =>
      teachersSet.has(c.ownerId) &&
      c.slug === null &&
      c.versions.length > 0 &&
      c.versions.length <= 20 &&
      c.versions.every((v) => fixtureTitles.has(v.title)),
  );
  const caseSims = await store.simulation.findMany({
    where: { caseId: { in: testCases.map((c) => c.id) } },
    select: { caseId: true, studentId: true },
  });
  testCases = testCases.filter((c) => {
    const safe = caseSims
      .filter((s) => s.caseId === c.id)
      .every((s) => studentIds.has(s.studentId));
    if (!safe)
      skipped.push(
        `Caso preservado por atendimento não identificado como teste: ${c.id}`,
      );
    return safe;
  });
  const caseIds = testCases.map((c) => c.id),
    classIds = testClasses.map((c) => c.id);
  const simulations = await store.simulation.findMany({
    where: {
      OR: [
        { studentId: { in: [...studentIds] } },
        { classId: { in: classIds } },
        { caseId: { in: caseIds } },
      ],
    },
    select: { id: true },
  });
  const simulationIds = simulations.map((s) => s.id);
  const teachersToDelete = [];
  for (const t of teachers) {
    const hasOther =
      classes.some(
        (c) => c.instructorId === t.id && !classIds.includes(c.id),
      ) ||
      cases.some((c) => c.ownerId === t.id && !caseIds.includes(c.id)) ||
      !!(await store.review.count({
        where: {
          authorId: t.id,
          attempt: { simulationId: { notIn: simulationIds } },
        },
      }));
    if (!hasOther) teachersToDelete.push(t.id);
    else skipped.push(`Conta de teste com conteúdo preservado: ${t.id}`);
  }
  const criterionLinks = await store.caseCriterion.findMany({
    where: { caseVersion: { caseId: { in: caseIds } } },
    select: { criterionVersionId: true },
  });
  const userIds = [...studentIds, ...teachersToDelete];
  return {
    userIds,
    classIds,
    caseIds,
    simulationIds,
    criterionIds: [...new Set(criterionLinks.map((c) => c.criterionVersionId))],
    skipped,
    summary: {
      users: userIds.length,
      classes: classIds.length,
      cases: caseIds.length,
      simulations: simulationIds.length,
    },
  };
}
export async function executeTestCleanup(tx: Store, plan: CleanupPlan) {
  const { userIds, classIds, caseIds, simulationIds } = plan;
  if (
    !userIds.length &&
    !classIds.length &&
    !caseIds.length &&
    !simulationIds.length
  )
    return plan.summary;
  const identities = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { name: true, email: true, role: true },
  });
  if (identities.some((u) => !isAutomatedUser(u)))
    throw new Error("Identificação mudou; limpeza cancelada.");
  const jobs = await tx.job.findMany({
    where: {
      OR: [
        { ownerId: { in: userIds } },
        { attempt: { simulationId: { in: simulationIds } } },
        { chatTurn: { simulationId: { in: simulationIds } } },
      ],
    },
    select: { id: true, state: true, leaseUntil: true },
  });
  if (
    jobs.some(
      (j) => j.state === "RUNNING" && j.leaseUntil && j.leaseUntil > new Date(),
    )
  )
    throw new Error(
      "Há análises de teste em execução; aguarde antes de limpar.",
    );
  const jobIds = jobs.map((j) => j.id);
  const reservations = await tx.usageReservation.findMany({
    where: { jobId: { in: jobIds } },
    include: { buckets: true },
  });
  const changes = new Map<string, { used: number; reserved: number }>();
  for (const r of reservations)
    if (r.state !== "RELEASED")
      for (const b of r.buckets) {
        const counts = changes.get(b.bucketId) ?? { used: 0, reserved: 0 };
        if (r.state === "CONSUMED") counts.used++;
        else if (r.state === "RESERVED") counts.reserved++;
        changes.set(b.bucketId, counts);
      }
  for (const [id, c] of changes) {
    const changed = await tx.usageBucket.updateMany({
      where: { id, used: { gte: c.used }, reserved: { gte: c.reserved } },
      data: {
        used: { decrement: c.used },
        reserved: { decrement: c.reserved },
      },
    });
    if (!changed.count)
      throw new Error(
        "Contadores inconsistentes; limpeza cancelada para conferência.",
      );
  }
  // Provider spending is not refunded. The database backup preserves its original audit trail.
  await tx.reservationBucket.deleteMany({
    where: { reservation: { jobId: { in: jobIds } } },
  });
  await tx.usageReservation.deleteMany({ where: { jobId: { in: jobIds } } });
  await tx.aiInvocation.deleteMany({ where: { jobId: { in: jobIds } } });
  await tx.job.deleteMany({ where: { id: { in: jobIds } } });
  await tx.review.deleteMany({
    where: { attempt: { simulationId: { in: simulationIds } } },
  });
  await tx.attempt.deleteMany({
    where: { simulationId: { in: simulationIds } },
  });
  await tx.chatTurn.deleteMany({
    where: { simulationId: { in: simulationIds } },
  });
  await tx.message.deleteMany({
    where: { simulationId: { in: simulationIds } },
  });
  await tx.simulation.deleteMany({ where: { id: { in: simulationIds } } });
  await tx.assignment.deleteMany({
    where: { OR: [{ classId: { in: classIds } }, { caseId: { in: caseIds } }] },
  });
  await tx.caseVersion.deleteMany({ where: { caseId: { in: caseIds } } });
  await tx.criterionVersion.deleteMany({
    where: { id: { in: plan.criterionIds }, cases: { none: {} } },
  });
  await tx.clinicalCase.deleteMany({ where: { id: { in: caseIds } } });
  await tx.membership.deleteMany({
    where: { OR: [{ classId: { in: classIds } }, { userId: { in: userIds } }] },
  });
  await tx.class.deleteMany({ where: { id: { in: classIds } } });
  await tx.user.deleteMany({ where: { id: { in: userIds } } });
  await tx.usageBucket.deleteMany({
    where: { scopeId: { in: userIds }, links: { none: {} } },
  });
  return plan.summary;
}
