import { test, expect, request } from "@playwright/test";
import { classroomFixture, cleanupClassroomFixtures } from "./fixtures";
test.afterAll(async () => {
  await cleanupClassroomFixtures();
});
test("critérios: publicação versionada, privacidade do gabarito e fundamento na devolutiva", async () => {
  const fixture = await classroomFixture();
  const teacher = await request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  await teacher.post("/api/login", {
    data: { email: fixture.email, password: fixture.password },
  });
  const caseId = (await (await teacher.get("/api/instructor/cases")).json())
    .items[0].id;
  const original = (
    await (await teacher.get("/api/instructor/cases/" + caseId)).json()
  ).case;
  const bundle = {
    sources: [
      {
        id: "test-source",
        title: "Fixture pedagógica — não usar clinicamente",
        institution: "Teste automatizado",
        version: "1",
        url: "https://example.invalid/test-fixture",
        section: "Teste de rastreabilidade",
        excerpt:
          "Conteúdo fictício exclusivo para verificação automatizada do motor de avaliação.",
        origin: "PEDAGOGICAL",
        verified: false,
        hash: "",
      },
    ],
    criteria: [
      {
        id: "test-risk",
        version: 1,
        dimension: "RISK",
        origin: "PEDAGOGICAL",
        field: "risk",
        operator: "ONE_OF",
        acceptedAnswers: ["HIGH"],
        severity: "ATTENTION",
        rationale:
          "Fixture para verificar divergência entre resposta e critério; não representa protocolo clínico.",
        sourceRefs: ["test-source"],
        applicability: "APPLIES",
      },
    ],
  };
  const body = {
    title: original.title,
    description: original.description,
    patient: original.patient,
    rubric: { ...original.rubric, evaluation: bundle },
  };
  expect(
    (await teacher.put("/api/instructor/cases/" + caseId, { data: body })).ok(),
  ).toBe(true);
  expect(
    (
      await teacher.post("/api/instructor/cases/" + caseId + "/publish", {
        data: { classIds: [fixture.classId], reviewed: true },
      })
    ).status(),
  ).toBe(400);
  bundle.sources[0].verified = true;
  expect(
    (await teacher.put("/api/instructor/cases/" + caseId, { data: body })).ok(),
  ).toBe(true);
  const published = await teacher.post(
    "/api/instructor/cases/" + caseId + "/publish",
    { data: { classIds: [fixture.classId], reviewed: true } },
  );
  expect(published.ok(), await published.text()).toBe(true);
  const latest = (
    await (await teacher.get("/api/instructor/cases/" + caseId)).json()
  ).case;
  expect(latest.rubric.evaluation.criteria[0].approvedBy).toBeTruthy();
  expect(latest.rubric.evaluation.sources[0].hash).toHaveLength(64);
  const email = "publication-" + Date.now() + "@test.local",
    password = "Publicacao-isolada-2026!";
  expect(
    (
      await teacher.post("/api/instructor/students", {
        data: {
          name: "Aluno teste de publicação",
          email,
          password,
          classId: fixture.classId,
        },
      })
    ).ok(),
  ).toBe(true);
  const learner = await request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  await learner.post("/api/login", { data: { email, password } });
  const publicCase = await (await learner.get("/api/cases/" + caseId)).json();
  expect(JSON.stringify(publicCase)).not.toContain("test-risk");
  expect(JSON.stringify(publicCase)).not.toContain("acceptedAnswers");
  const s = (
    await (await learner.post("/api/simulations", { data: { caseId } })).json()
  ).simulation;
  const draft = {
    ...s.draft,
    text: "Relato do paciente registrado para teste.",
    ciap: original.rubric.acceptedCiap[0],
    risk: "LOW",
    outcome: "RELEASE",
  };
  const saved = await (
    await learner.put("/api/simulations/" + s.id, {
      data: { draft, revision: s.revision },
    })
  ).json();
  const submission = await learner.post(
    "/api/simulations/" + s.id + "/submit",
    {
      data: {
        revision: saved.revision,
        conversationRevision: 0,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  expect(submission.status()).toBe(202);
  const attemptId = (await submission.json()).resourceId;
  await expect
    .poll(
      async () =>
        (await (await learner.get("/api/attempts/" + attemptId)).json()).attempt
          .status,
      { timeout: 30000 },
    )
    .toBe("COMPLETED");
  const feedback = (
    await (await learner.get("/api/attempts/" + attemptId)).json()
  ).attempt.feedback;
  expect(feedback.items[0]).toMatchObject({
    kind: "ERROR",
    level: "ATTENTION",
    sourceRefs: ["test-source"],
  });
  expect(feedback.sources[0].title).toContain("Fixture pedagógica");
  await teacher.dispose();
  await learner.dispose();
});
