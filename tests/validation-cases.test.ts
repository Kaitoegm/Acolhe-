import { describe, it, expect } from "vitest";
import { validationCases } from "../src/lib/domain/validation-cases";
import { ciapCatalog, sigtapCatalog } from "../src/lib/domain/catalogs";
describe("banco original pendente de validação humana", () => {
  it("tem40 identificações únicas e8 módulos", () => {
    expect(validationCases).toHaveLength(40);
    expect(new Set(validationCases.map((c) => c.slug)).size).toBe(40);
    expect(new Set(validationCases.map((c) => c.patient.name)).size).toBe(40);
    expect(new Set(validationCases.map((c) => c.review.module)).size).toBe(8);
  });
  it("inclui entrevista, ficha e revisão específicas sem aprovação automática", () => {
    for (const c of validationCases) {
      expect(c.patient.facts.length).toBeGreaterThanOrEqual(4);
      for (const f of c.patient.facts) {
        expect(f.keywords.length).toBeGreaterThan(0);
        expect(f.answer.length).toBeGreaterThan(10);
      }
      for (const value of [
        c.patient.name,
        c.patient.age,
        c.patient.birthDate,
        c.patient.mother,
        c.patient.chiefComplaint,
        c.patient.history,
        c.patient.medications,
        c.patient.allergies,
        c.review.expectedRecord,
        c.rubric.rationale,
      ])
        expect(value.length).toBeGreaterThan(0);
      expect(c.patient.name).toContain("fictícia");
      expect(c.rubric.evaluation).toBeUndefined();
      expect(JSON.stringify(c)).not.toMatch(
        /"(?:approved|reviewed|verified)":true/,
      );
      expect(c.review.questionsForReviewer.length).toBeGreaterThan(0);
      expect(c.rubric.requiredTopics.length).toBeGreaterThanOrEqual(4);
    }
  });
  it("usa apenas catálogo e procedimentos efetivamente realizados", () => {
    const ciap = new Set(ciapCatalog.map((c) => c.code));
    const procedures = new Set(sigtapCatalog.map((c) => c.code));
    for (const c of validationCases) {
      for (const code of c.rubric.acceptedCiap)
        expect(ciap.has(code)).toBe(true);
      for (const code of c.patient.performedProcedures)
        expect(procedures.has(code)).toBe(true);
      for (const code of c.rubric.expectedProcedures)
        expect(c.patient.performedProcedures).toContain(code);
      if (c.patient.performedProcedures.includes("0301100039"))
        expect(
          c.patient.vitals.some((v) => v.label.startsWith("PA atual")),
        ).toBe(true);
      if (c.patient.performedProcedures.includes("0214010015"))
        expect(
          c.patient.vitals.some((v) => v.label.startsWith("Glicemia atual")),
        ).toBe(true);
    }
    expect(
      validationCases
        .filter((c) => c.patient.performedProcedures.includes("0401010023"))
        .map((c) => c.slug),
    ).toEqual(["30-ferida-mao"]);
  });
  it("mantém idade coerente na data fixa e contempla adultos e crianças", () => {
    let children = 0;
    let adults = 0;
    for (const c of validationCases) {
      const birth = new Date(`${c.patient.birthDate}T12:00:00Z`);
      const date = new Date("2026-10-21T12:00:00Z");
      const days = Math.floor((date.getTime() - birth.getTime()) / 86400000);
      if (c.patient.age.endsWith("dias")) {
        expect(c.patient.age).toBe(`${days} dias`);
        children++;
      } else {
        let age = date.getUTCFullYear() - birth.getUTCFullYear();
        if (
          date.getUTCMonth() < birth.getUTCMonth() ||
          (date.getUTCMonth() === birth.getUTCMonth() &&
            date.getUTCDate() < birth.getUTCDate())
        )
          age--;
        expect(c.patient.age).toBe(`${age} anos`);
        if (age < 18) children++;
        else adults++;
      }
    }
    expect(children).toBeGreaterThan(0);
    expect(adults).toBeGreaterThan(0);
  });
  it("evita títulos que revelem diagnóstico e oferece diversidade de propostas", () => {
    for (const c of validationCases)
      expect(c.title).not.toMatch(
        /hipertens|hipoglic|dengue|infarto|AVC|anafilax|alto risco|baixo risco|urgência|emergência|pneumonia|pielonefrite/i,
      );
    expect(
      new Set(validationCases.flatMap((c) => c.rubric.acceptedRisks)),
    ).toEqual(new Set(["NON_ACUTE", "LOW", "MEDIUM", "HIGH"]));
    expect(
      new Set(validationCases.flatMap((c) => c.rubric.acceptedOutcomes)),
    ).toEqual(new Set(["REFER"]));
    expect(
      validationCases.find((c) => c.slug === "36-cartao")?.patient
        .performedProcedures,
    ).toEqual([]);
  });
});
