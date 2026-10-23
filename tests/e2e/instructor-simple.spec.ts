import { test, expect } from "@playwright/test";
import { classroomFixture, cleanupClassroomFixtures } from "./fixtures";
test.afterAll(cleanupClassroomFixtures);
test("instrutor: revisão guiada, pendências, publicação e turmas", async ({
  page,
}) => {
  test.setTimeout(25000);
  const fixture = await classroomFixture();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(fixture.email);
  await page.getByLabel("Senha", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  const response = await page.request.get("/api/instructor/cases");
  const list = await response.json();
  const caseId = list.items[0].id;
  const c = (
    await (await page.request.get("/api/instructor/cases/" + caseId)).json()
  ).case;
  c.rubric.evaluation = {
    sources: [
      {
        id: "s",
        title: "Referência pedagógica de teste",
        institution: "Teste",
        version: "1",
        url: "https://example.invalid/fixture",
        section: "Fixture",
        excerpt: "Somente teste automatizado, sem uso clínico.",
        origin: "PEDAGOGICAL",
        verified: false,
        hash: "",
      },
    ],
    criteria: [
      {
        id: "p",
        version: 1,
        dimension: "RISK",
        field: "risk",
        operator: "ONE_OF",
        origin: "PEDAGOGICAL",
        severity: "REVIEW",
        acceptedAnswers: c.rubric.acceptedRisks,
        rationale: "Somente fixture para testar o fluxo.",
        sourceRefs: ["s"],
        applicability: "UNKNOWN",
      },
    ],
  };
  const put = await page.request.put("/api/instructor/cases/" + caseId, {
    data: c,
    headers: { Origin: "http://localhost:3000" },
  });
  expect(put.ok(), await put.text()).toBe(true);
  await page.goto("/instrutor");
  await expect(page.getByRole("link", { name: "Revisar caso" })).toHaveCount(3);
  await page.getByLabel("Buscar caso", { exact: true }).fill(c.title);
  await expect(page.getByRole("link", { name: "Revisar caso" })).toHaveCount(1);
  await page.getByRole("link", { name: "Revisar caso" }).click();
  await page.getByLabel('Título do caso',{exact:true}).fill(c.title+' · revisão');
  page.once('dialog',dialog=>dialog.accept());
  await page.goBack();
  await expect(page).toHaveURL('/instrutor');
  await page.screenshot({path:'test-results/instructor-return.png'});
  await page.getByRole('link',{name:'Revisar caso',exact:true}).click();
  await expect(page.getByLabel('Título do caso',{exact:true})).toHaveValue(c.title+' · revisão');
  await page
    .getByRole("button", { name: "4 Conferir e disponibilizar", exact: true })
    .click();
  await expect(page.getByText(/Decida se Prioridade/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aprovar e disponibilizar", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".publication-checklist li")
    .filter({ hasText: "Decida se Prioridade" })
    .getByRole("button", { name: "Revisar", exact: true })
    .click();
  await expect(
    page.getByLabel("Este item deve ser avaliado neste caso?"),
  ).toBeVisible();
  await page
    .getByLabel("Este item deve ser avaliado neste caso?")
    .selectOption("APPLIES");
  await page.locator("#source-s > summary").click();
  await page
    .getByLabel("Conferi este trecho e sua relação com o caso", { exact: true })
    .check();
  await page.getByRole("button", { name: "2 Conversa", exact: true }).click();
  const reply = page.getByLabel(/^Resposta/).first();
  const original = await reply.inputValue();
  await reply.fill(original + " Informação adicional da fixture.");
  await page
    .getByRole("button", { name: "1 Paciente e história", exact: true })
    .click();
  await page.getByRole("button", { name: "2 Conversa", exact: true }).click();
  await expect(reply).toHaveValue(
    original + " Informação adicional da fixture.",
  );
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(
    page.getByText("Rascunho salvo. Você pode continuar a revisão.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "4 Conferir e disponibilizar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conteúdo pronto para sua aprovação" }),
  ).toBeVisible();
  await page.getByLabel(/Revisei os fatos, as respostas esperadas/).check();
  await expect(
    page.getByRole("button", { name: "Aprovar e disponibilizar", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Aprovar e disponibilizar", exact: true })
    .click();
  await expect(
    page.getByText(
      "Caso aprovado e disponibilizado para as turmas selecionadas.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Voltar aos casos", exact: true })
    .click();
  await expect(page.getByLabel("Buscar caso", { exact: true })).toHaveValue(
    c.title,
  );
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Turmas e alunos", exact: true })
    .click();
  await expect(
    page.getByLabel("Nome da nova turma", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Abrir turma/ }).click();
  await page
    .getByRole("button", { name: "Adicionar aluno", exact: true })
    .click();
  await page
    .getByLabel("Nome completo", { exact: true })
    .fill("Aluno teste automatizado");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("e2e-flow-" + Date.now() + "@acolhe.local");
  await page
    .getByLabel("Senha inicial", { exact: true })
    .fill("Senha-de-fixture-2026!");
  await page
    .getByRole("button", { name: "Cadastrar aluno", exact: true })
    .click();
  await expect(
    page.getByText("Aluno teste automatizado", { exact: true }),
  ).toBeVisible();
  const versions = await page.request.get(
    "/api/instructor/cases/" + caseId + "/versions",
  );
  expect(versions.ok()).toBe(true);
  expect((await versions.json()).items.length).toBeGreaterThanOrEqual(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/instructor-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
