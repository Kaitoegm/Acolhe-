import { classroomFixture, cleanupClassroomFixtures } from "./fixtures";
test.afterAll(async () => {
  await cleanupClassroomFixtures();
});
import { test, expect, request } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
test.use({ extraHTTPHeaders: { Origin: "http://localhost:3000" } });
test("revisão v2: comparação, decisões persistentes, movimento reduzido e múltiplas correções", async ({
  page,
}) => {
  const fixture = await classroomFixture();
  const teacher = await request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { Origin: "http://localhost:3000" },
  });
  expect(
    (
      await teacher.post("/api/login", {
        data: { email: fixture.email, password: fixture.password },
      })
    ).ok(),
  ).toBe(true);
  const email = `review-e2e-${Date.now()}@acolhe.local`,
    password = "Revisao-integracao-2026!";
  expect(
    (
      await teacher.post("/api/instructor/students", {
        data: {
          name: "Aluno revisão animada",
          email,
          password,
          classId: fixture.classId,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lista de atendimentos" }),
  ).toBeVisible();
  const cases = await (await page.request.get("/api/cases")).json();
  const response = await page.request.post("/api/simulations", {
    data: { caseId: cases.items[0].id },
  });
  expect(response.status(), await response.text()).toBe(200);
  const started = await response.json();
  const s = started.simulation;
  const text =
    "Paciente relata cocô endurecido e xixi. Refere: “meu cocô está duro”. Nega febre. PA 120/80 mmHg.";
  const draft = {
    ...s.draft,
    text,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text, marks: [{ type: "bold" }] }],
        },
      ],
    },
    ciap: "W78",
    risk: "NON_ACUTE",
    outcome: "RELEASE",
  };
  const saved = await (
    await page.request.put("/api/simulations/" + s.id, {
      data: { draft, revision: s.revision },
    })
  ).json();
  const submitted = await page.request.post(
    "/api/simulations/" + s.id + "/submit",
    {
      data: {
        revision: saved.revision,
        conversationRevision: s.conversationRevision,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  expect(submitted.status()).toBe(202);
  const attemptId = (await submitted.json()).resourceId;
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/attempts/" + attemptId)).json())
          .attempt.status,
      { timeout: 30000 },
    )
    .toBe("COMPLETED");
  await page.goto("/acolhimento/" + s.id);
  await expect(
    page.getByRole("heading", { name: "Seu registro, um passo adiante" }),
  ).toBeVisible();
  await expect(page.locator(".revision-fragment")).toHaveCount(2);
  await page.getByLabel("Reduzir movimento", { exact: true }).check();
  await page
    .getByRole("button", { name: "Aplicar sugestão", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Texto revisado")).toContainText(
    "fezes endurecidas",
  );
  await page.reload();
  await expect(page.getByLabel("Texto revisado")).toContainText(
    "fezes endurecidas",
  );
  await expect(
    page.getByLabel("Reduzir movimento", { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Aplicar sugestão", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Texto revisado")).toContainText("urina");
  await page
    .locator(".finding")
    .first()
    .getByRole("button", { name: "Desfazer", exact: true })
    .click();
  await expect(page.getByLabel("Texto revisado")).toContainText(
    "cocô endurecido",
  );
  await expect(page.getByLabel("Texto revisado")).toContainText("urina");
  await page
    .getByRole("button", { name: "Aplicar sugestão", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Usar revisão no registro" }).click();
  const editor = page.getByRole("textbox", {
    name: "Descrição da escuta inicial",
    exact: true,
  });
  await expect(editor).toContainText("fezes endurecidas e urina");
  await expect(editor.locator("strong")).toContainText("fezes");
  await expect(editor).toContainText("“meu cocô está duro”");
  await expect(page.locator(".save-state")).toContainText("Salvo");
  const original = (
    await (await page.request.get("/api/attempts/" + attemptId)).json()
  ).attempt.snapshot.text;
  expect(original).toBe(text);
  const actions = await (
    await teacher.get(
      "/api/attempts/" + attemptId + "/revision-actions?limit=2",
    )
  ).json();
  expect(actions.items).toHaveLength(2);
  expect(actions.hasMore).toBe(true);
  await page
    .locator(".evaluation-review")
    .screenshot({ path: "test-results/revisao-animada-desktop.png" });
  await page.setViewportSize({ width: 360, height: 820 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".evaluation-review")
    .screenshot({ path: "test-results/revisao-animada-mobile.png" });
  await teacher.dispose();
});
