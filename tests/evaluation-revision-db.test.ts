import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/lib/server/db";
import {
  saveRevision,
  revisionView,
  publishEvaluationBundle,
} from "../src/lib/server/evaluation";
import { evaluateV2 } from "../src/lib/evaluation/evaluate";
import { demoCases } from "../src/lib/domain";
import { EMPTY_DRAFT } from "../src/lib/contracts";
import { json } from "../src/lib/server/views";
const prefix = "review-" + randomUUID();
const student = prefix + "s",
  teacher = prefix + "t";
let classId = "",
  caseId = "",
  attemptId = "",
  simulationId = "";
let findingId = "";
let before = "";
describe("persistent review authorization and immutable attempt", () => {
  beforeAll(async () => {
    await db.user.createMany({
      data: [
        {
          id: student,
          email: student + "@test.local",
          name: "Aluno revisão",
          passwordHash: "unused",
          role: "STUDENT",
        },
        {
          id: teacher,
          email: teacher + "@test.local",
          name: "Instrutor revisão",
          passwordHash: "unused",
          role: "INSTRUCTOR",
        },
      ],
    });
    const c = await db.class.create({
      data: {
        name: prefix,
        instructorId: teacher,
        memberships: { create: { userId: student } },
      },
    });
    classId = c.id;
    const sample = demoCases[0];
    const clinical = await db.clinicalCase.create({
      data: {
        ownerId: teacher,
        versions: {
          create: {
            version: 1,
            title: sample.title,
            description: sample.description,
            patient: json(sample.patient),
            rubric: json(sample.rubric),
          },
        },
      },
      include: { versions: true },
    });
    caseId = clinical.id;
    const draft = {
      ...EMPTY_DRAFT,
      text: "cocô endurecido e xixi",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "cocô endurecido e xixi",
                marks: [{ type: "bold" }],
              },
            ],
          },
        ],
      },
    };
    const s = await db.simulation.create({
      data: {
        studentId: student,
        classId,
        caseId,
        caseVersionId: clinical.versions[0].id,
        draft: json(draft),
      },
    });
    simulationId = s.id;
    process.env.AI_MODE = "demo";
    const feedback = await evaluateV2(
      {
        patient: sample.patient,
        rubric: sample.rubric,
        reviewed: false,
        draft,
        messages: [],
      },
      prefix,
    );
    findingId = feedback.items[0].id;
    const a = await db.attempt.create({
      data: {
        simulationId,
        number: 1,
        revision: 0,
        idempotencyKey: prefix,
        status: "COMPLETED",
        snapshot: json(draft),
        conversation: [],
        caseSnapshot: {},
        feedback: json(feedback),
        evaluationVersion: 2,
      },
    });
    attemptId = a.id;
    before = JSON.stringify(a.snapshot);
  });
  afterAll(async () => {
    const criterionLinks = await db.caseCriterion.findMany({
      where: { caseVersion: { caseId } },
      select: { criterionVersionId: true },
    });
    await db.attempt.deleteMany({ where: { simulationId } });
    await db.simulation.deleteMany({ where: { id: simulationId } });
    await db.caseVersion.deleteMany({ where: { caseId } });
    await db.clinicalCase.deleteMany({ where: { id: caseId } });
    await db.criterionVersion.deleteMany({
      where: { id: { in: criterionLinks.map((c) => c.criterionVersionId) } },
    });
    await db.membership.deleteMany({ where: { classId } });
    await db.class.deleteMany({ where: { id: classId } });
    await db.user.deleteMany({ where: { id: { in: [student, teacher] } } });
  });
  it("persists decisions once, rejects stale tabs and preserves immutable original", async () => {
    const u = { id: student, role: "STUDENT" };
    const input = {
      version: 0,
      findingId,
      state: "accepted" as const,
      idempotencyKey: prefix,
    };
    const r = await saveRevision(u, attemptId, input);
    expect(r.version).toBe(1);
    expect((await saveRevision(u, attemptId, input)).version).toBe(1);
    expect(
      await db.revisionAction.count({ where: { revision: { attemptId } } }),
    ).toBe(1);
    await expect(
      saveRevision(u, attemptId, {
        ...input,
        idempotencyKey: prefix + "other",
        state: "pending",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      JSON.stringify(
        (await db.attempt.findUniqueOrThrow({ where: { id: attemptId } }))
          .snapshot,
      ),
    ).toBe(before);
    expect(
      (await revisionView({ id: teacher, role: "INSTRUCTOR" }, attemptId))
        .version,
    ).toBe(1);
  });
  it("denies foreign students and revoked enrollment", async () => {
    await expect(
      revisionView({ id: prefix + "foreign", role: "STUDENT" }, attemptId),
    ).rejects.toMatchObject({ status: 404 });
    await db.membership.delete({
      where: { userId_classId: { userId: student, classId } },
    });
    await expect(
      saveRevision({ id: student, role: "STUDENT" }, attemptId, {
        version: 1,
        findingId,
        state: "pending",
        idempotencyKey: prefix + "revoked",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("versions source content and binds approval to the publishing owner", async () => {
    const version = await db.caseVersion.findFirstOrThrow({
      where: { caseId },
    });
    const bundle = {
      sources: [
        {
          id: "ms-test",
          title: "Fonte de teste automatizado",
          institution: "MS",
          version: "fixture",
          url: "https://bvsms.saude.gov.br/test.pdf",
          section: "Seção de teste",
          excerpt: "Trecho fictício usado somente neste teste de persistência.",
          origin: "MS",
          verified: true,
          hash: "",
        },
      ],
      criteria: [
        {
          id: prefix,
          version: 1,
          dimension: "RISK",
          origin: "MS",
          field: "risk",
          operator: "ONE_OF",
          acceptedAnswers: ["HIGH"],
          severity: "ATTENTION",
          rationale:
            "Fixture de persistência; não é critério clínico homologado.",
          sourceRefs: ["ms-test"],
          applicability: "APPLIES",
        },
      ],
    };
    const impossible = structuredClone(bundle);
    impossible.criteria[0] = {
      ...impossible.criteria[0],
      id: "impossible-procedure",
      dimension: "PROCEDURE",
      field: "procedures",
      operator: "PERFORMED_ONLY",
      acceptedAnswers: ["0301100039"],
    };
    // Simulate a case without measurements inside a transaction that must roll back.
    await expect(
      db.$transaction(async (tx) => {
        await tx.caseVersion.update({
          where: { id: version.id },
          data: {
            patient: json({
              ...(version.patient as object),
              performedProcedures: [],
            }),
          },
        });
        return publishEvaluationBundle(tx, teacher, version.id, impossible);
      }),
    ).rejects.toThrow("realizados");
    await expect(
      db.$transaction((tx) =>
        publishEvaluationBundle(tx, student, version.id, bundle),
      ),
    ).rejects.toMatchObject({ status: 404 });
    const published = await db.$transaction((tx) =>
      publishEvaluationBundle(tx, teacher, version.id, bundle),
    );
    expect(published.criteria[0].approvedBy).toBe(teacher);
    expect(published.sources[0].hash).toHaveLength(64);
    expect(
      await db.protocolVersion.count({
        where: { source: { ownerId: teacher } },
      }),
    ).toBe(1);
    expect(
      await db.caseCriterion.count({ where: { caseVersionId: version.id } }),
    ).toBe(1);
  });
});
