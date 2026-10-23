import { classroomFixture, cleanupClassroomFixtures } from "./fixtures";
test.afterAll(async () => {
  await cleanupClassroomFixtures();
});
import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const password = process.env.DEMO_PASSWORD || "Acolhe+2026!";
const learnerPassword = "Teste-integracao-2026!";
const learnerEmail = `e2e-flow-${Date.now()}@acolhe.local`;
async function login(
  email: string,
  pass = password,
): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  const response = await ctx.post("/api/login", {
    data: { email, password: pass },
  });
  expect(response.status(), await response.text()).toBe(200);
  return ctx;
}

let fixture: Awaited<ReturnType<typeof classroomFixture>>;
test.beforeAll(async () => {
  fixture = await classroomFixture();
  const instructor = await login(fixture.email, fixture.password);
  const created = await instructor.post("/api/instructor/students", {
    data: {
      name: "Aluno E2E",
      email: learnerEmail,
      password: learnerPassword,
      classId: fixture.classId,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  await instructor.dispose();
});

test("API: isolamento, snapshots, concorrência e devolutiva persistente", async () => {
  const anonymous = await request.newContext({
    baseURL: "http://localhost:3000",
  });
  expect((await anonymous.get("/api/simulations")).status()).toBe(401);
  const instructor = await login(fixture.email, fixture.password);
  const learner = await login(learnerEmail, learnerPassword);
  const casesResponse = await learner.get("/api/cases");
  expect(casesResponse.ok()).toBeTruthy();
  const cases = (await casesResponse.json()).items;
  expect(cases.length).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(cases)).not.toMatch(
    /acceptedRisks|requiredTopics|acceptedCiap|rationale/,
  );
  const started = await learner.post("/api/simulations", {
    data: { caseId: cases[0].id },
  });
  expect(started.ok(), await started.text()).toBeTruthy();
  const simulation = (await started.json()).simulation;
  const restarted = await learner.post("/api/simulations", {
    data: { caseId: cases[0].id },
  });
  expect((await restarted.json()).simulation.id).toBe(simulation.id);
  const suffix = Date.now();
  const cls = await instructor.post("/api/instructor/classes", {
    data: { name: `Teste isolamento ${suffix}` },
  });
  expect(cls.ok(), await cls.text()).toBeTruthy();
  const classId = (await cls.json()).id;
  const email = `teste-${suffix}@acolhe.local`;
  const testPassword = "Teste-integracao-2026!";
  const created = await instructor.post("/api/instructor/students", {
    data: { name: "Aluno de teste", email, password: testPassword, classId },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const other = await login(email, testPassword);
  expect([403, 404]).toContain(
    (await other.get(`/api/simulations/${simulation.id}`)).status(),
  );
  expect((await other.get("/api/instructor")).status()).toBe(403);
  const wrongOrigin = await learner.put(`/api/simulations/${simulation.id}`, {
    headers: { Origin: "https://outro.example" },
    data: {},
  });
  expect(wrongOrigin.status()).toBe(403);
  const catalogs = await (await learner.get("/api/catalogs")).json();
  const draft = {
    ...simulation.draft,
    ciap: catalogs.ciap[0].code,
    text: "Paciente relata dor de cabeça. Foram registradas as informações disponíveis na ficha.",
    document: null,
    risk: "NON_ACUTE",
    outcome: "RELEASE",
  };
  const saved = await learner.put(`/api/simulations/${simulation.id}`, {
    data: { draft, revision: simulation.revision },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const revision = (await saved.json()).revision;
  expect(
    (
      await learner.put(`/api/simulations/${simulation.id}`, {
        data: { draft, revision: simulation.revision },
      })
    ).status(),
  ).toBe(409);
  const key = `e2e-${suffix}`;
  const submission = await learner.post(
    `/api/simulations/${simulation.id}/submit`,
    {
      data: {
        revision,
        conversationRevision: simulation.conversationRevision,
        idempotencyKey: key,
      },
    },
  );
  expect(submission.status(), await submission.text()).toBe(202);
  const enqueued = await submission.json();
  const attempt = { id: enqueued.resourceId };
  const duplicate = await learner.post(
    `/api/simulations/${simulation.id}/submit`,
    {
      data: {
        revision,
        conversationRevision: simulation.conversationRevision,
        idempotencyKey: key,
      },
    },
  );
  expect((await duplicate.json()).resourceId).toBe(attempt.id);
  await expect
    .poll(
      async () => {
        const response = await learner.get(`/api/attempts/${attempt.id}`);
        return (await response.json()).attempt.status;
      },
      { timeout: 30000 },
    )
    .toBe("COMPLETED");
  const completedAttempt = (
    await (await learner.get(`/api/attempts/${attempt.id}`)).json()
  ).attempt;
  expect(completedAttempt.feedback.clinicalPending).toBe(true);
  expect(completedAttempt.feedback.mode).toBe("demo");
  expect(
    completedAttempt.feedback.items.every(
      (i: { category: string }) =>
        !["RISK", "CIAP", "OUTCOME", "PROCEDURE"].includes(i.category),
    ),
  ).toBe(true);
  const edited = await learner.put(`/api/simulations/${simulation.id}`, {
    data: {
      revision,
      draft: { ...draft, text: "Registro revisado pelo aluno." },
    },
  });
  expect(edited.ok(), await edited.text()).toBeTruthy();
  const after = (
    await (await learner.get(`/api/attempts/${attempt.id}`)).json()
  ).attempt;
  expect(after.snapshot.text).toBe(draft.text);
  const compact = (
    await (await learner.get(`/api/simulations/${simulation.id}`)).json()
  ).simulation;
  expect(compact.attempts).toEqual([]);
  expect(compact.messages).toEqual([]);
  const paged = await learner.get("/api/simulations?limit=1");
  expect((await paged.json()).items.length).toBeLessThanOrEqual(1);
  expect((await learner.get("/api/simulations?limit=101")).status()).toBe(400);
  const review = await instructor.post(`/api/attempts/${attempt.id}/reviews`, {
    data: { comment: "Revisão de teste: confira a organização do relato." },
  });
  expect(review.ok(), await review.text()).toBeTruthy();
  expect([403, 404]).toContain(
    (
      await other.post(`/api/attempts/${attempt.id}/reviews`, {
        data: { comment: "não permitido" },
      })
    ).status(),
  );
  await Promise.all([
    anonymous.dispose(),
    instructor.dispose(),
    learner.dispose(),
    other.dispose(),
  ]);
});

test("Interface: login, adicionar cidadão, preencher e retomar", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(learnerEmail);
  await page.getByLabel("Senha", { exact: true }).fill(learnerPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lista de atendimentos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar cidadão" }).click();
  await expect(
    page.getByText("Gestante", { exact: false }).first(),
  ).toBeVisible();
  await page
    .locator(".case-option")
    .first()
    .getByRole("button", { name: "Iniciar escuta" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Escuta inicial", exact: true }),
  ).toBeVisible();
  const record = page.getByRole("textbox", {
    name: "Descrição da escuta inicial",
    exact: true,
  });
  const text =
    "Paciente relata dor de cabeça. Dados da ficha consultados durante a escuta.";
  await record.fill(text);
  await page
    .getByRole("combobox", { name: "Motivo da consulta · CIAP-2 *" })
    .fill("W78");
  await page.getByRole("option", { name: /W78/ }).click();
  await page.getByRole("radio", { name: "Não aguda", exact: true }).check();
  await page
    .getByRole("radio", { name: "Liberar cidadão", exact: true })
    .check();
  await page.getByRole("button", { name: "Conversa", exact: true }).click();
  await page.getByLabel("Pergunta ao paciente").fill("Você tem alergias?");
  const acceptedChat = page.waitForResponse(
    (r) => r.url().endsWith("/messages") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  expect((await acceptedChat).status()).toBe(202);
  await expect(page.locator(".message.assistant").last()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".save-state")).toContainText("Salvo");
  await page.reload();
  await expect(record).toHaveText(text);
  await expect(
    page.getByRole("radio", { name: "Liberar cidadão", exact: true }),
  ).toBeChecked();
  const submit = page.getByRole("button", {
    name: /Concluir simulação|Enviar nova tentativa|Finalizar escuta inicial/,
  });
  await expect(submit).toBeEnabled({ timeout: 30000 });
  await submit.click();
  await expect(
    page.getByText("Seu registro, um passo adiante", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page
      .locator(".revision-fragment")
      .filter({ hasText: "dor de cabeça" })
      .first(),
  ).toBeVisible();
  await page
    .locator(".revision-fragment")
    .filter({ hasText: "dor de cabeça" })
    .first()
    .click();
  await page.getByRole("button", { name: "Aplicar sugestão" }).first().click();
  await page.getByRole("button", { name: "Usar revisão no registro" }).click();
  await expect(record).toContainText("cefaleia");
  await page
    .getByText("Ver registro original enviado", { exact: true })
    .click();
  await expect(page.locator(".revision-original")).toContainText(
    "dor de cabeça",
  );
  await expect(page.locator(".save-state")).toContainText("Salvo");
  const nextSubmission = page.waitForResponse(
    (r) => r.url().endsWith("/submit") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar nova tentativa" }).click();
  expect((await nextSubmission).status()).toBe(202);
  await expect(
    page.getByRole("button", { name: "Enviar nova tentativa" }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(
    page.getByText("Seu registro, um passo adiante", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".save-state")).toHaveText("Salvo");
  await page
    .getByRole("button", { name: "Ficha do cidadão", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: "test-results/acolhimento-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/acolhimento-mobile.png",
    fullPage: true,
  });
});
