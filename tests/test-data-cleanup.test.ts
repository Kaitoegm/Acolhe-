import { describe, it, expect } from "vitest";
import {
  isAutomatedUser,
  isAutomatedClass,
} from "../src/lib/maintenance/test-data";
describe("conservative test data identification", () => {
  it("requires both generated email and known fixture name", () => {
    expect(
      isAutomatedUser({
        email: "instructor-e2e-9cd2fd00-36d6-4bef-8cb3-636ed0a6dd9b@test.local",
        name: "Instrutor teste automatizado",
        role: "INSTRUCTOR",
      }),
    ).toBe(true);
    expect(
      isAutomatedUser({
        email: "e2e-flow-1792538109829@acolhe.local",
        name: "Aluno E2E",
        role: "STUDENT",
      }),
    ).toBe(true);
    expect(
      isAutomatedUser({
        email: "instrutor@acolhe.local",
        name: "Instrutora demonstração",
        role: "INSTRUCTOR",
      }),
    ).toBe(false);
    expect(
      isAutomatedUser({
        email: "teste-1792538109829@acolhe.local",
        name: "Pessoa real",
        role: "STUDENT",
      }),
    ).toBe(false);
    expect(
      isAutomatedUser({
        email: "pessoa@example.com",
        name: "Aluno de teste",
        role: "STUDENT",
      }),
    ).toBe(false);
  });
  it("matches exact fixture class formats without deleting generic training classes", () => {
    expect(isAutomatedClass("Teste isolamento 1792538109829")).toBe(true);
    expect(
      isAutomatedClass(
        "Teste automatizado 9cd2fd00-36d6-4bef-8cb3-636ed0a6dd9b",
      ),
    ).toBe(true);
    expect(isAutomatedClass("Turma demonstração")).toBe(false);
    expect(isAutomatedClass("Teste da turma da UBS")).toBe(false);
  });
});
