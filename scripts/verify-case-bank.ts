import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, request } from "@playwright/test";
import { db } from "../src/lib/server/db";
async function main() {
  const cases = await db.clinicalCase.findMany({
    where: { slug: { startsWith: "validation-v1-" } },
    select: {
      id: true,
      currentStatus: true,
      demo: true,
      versions: {
        select: { reviewedAt: true, reviewedBy: true },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  assert.equal(cases.length, 40);
  assert(
    cases.every(
      (c) =>
        c.currentStatus === "PENDING_REVIEW" &&
        !c.demo &&
        !c.versions[0].reviewedAt &&
        !c.versions[0].reviewedBy,
    ),
  );
  assert.equal(
    await db.assignment.count({
      where: { caseId: { in: cases.map((c) => c.id) } },
    }),
    0,
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => console.error("Browser:", error.message));
    await page.goto("http://localhost:3000/login");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("instrutor@acolhe.local");
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.DEMO_PASSWORD || "");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL("http://localhost:3000/");
    await page.goto("http://localhost:3000/instrutor");
    await page
      .getByRole("button", { name: "Casos clínicos", exact: true })
      .click();
    await page.locator(".case-management").first().waitFor();
    const more = page.getByRole("button", {
      name: "Carregar mais casos",
      exact: true,
    });
    if (await more.count()) await more.click();
    await page.waitForFunction(
      () => document.querySelectorAll(".case-management").length === 43,
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/banco-casos-instrutor.png" });
    await page
      .locator(".case-management")
      .first()
      .getByRole("link", { name: "Revisar caso", exact: true })
      .click();
    await page
      .getByRole("button", { name: "3 O que avaliar", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "O que avaliar", exact: true })
      .waitFor();
    await page.screenshot({ path: "test-results/banco-caso-editor.png" });
    assert.match(
      await page
        .getByLabel("Fundamentação clínica", { exact: true })
        .inputValue(),
      /Competências:/,
    );
    assert.equal(
      await page
        .getByLabel("Conferi este trecho e sua relação com o caso", {
          exact: true,
        })
        .isChecked(),
      false,
    );
    const student = await request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Origin: "http://localhost:3000" },
    });
    try {
      assert.equal(
        (
          await student.post("/api/login", {
            data: {
              email: "aluno@acolhe.local",
              password: process.env.DEMO_PASSWORD || "",
            },
          })
        ).status(),
        200,
      );
      assert.equal(
        (await student.get("/api/cases/" + cases[0].id)).status(),
        404,
      );
    } finally {
      await student.dispose();
    }
    console.log(
      JSON.stringify(
        {
          pendingCases: 40,
          totalInstructorCases: 43,
          sourceApproval: false,
          assigned: 0,
          studentAccess: "denied",
          screenshot: "test-results/banco-casos-instrutor.png",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
