import { describe, it, expect } from "vitest";
import { publicationIssues } from "../src/lib/evaluation/publication";
import { demoCases } from "../src/lib/domain";
import { validationCases } from "../src/lib/domain/validation-cases";
import { withEvaluation, isCaseFormShape } from "../src/lib/instructor-form";
import { caseSchema } from "../src/lib/server/validation";

describe("revisão orientada do instrutor", () => {
  it('conferir uma referência não resolve respostas anteriores conflitantes',()=>{
    const c=structuredClone(demoCases[0]);
    const criteria=[{id:'c',version:1,dimension:'RISK' as const,field:'risk' as const,operator:'ONE_OF' as const,origin:'LOCAL' as const,severity:'REVIEW' as const,acceptedAnswers:['HIGH'],rationale:'Razão do item',sourceRefs:['s'],applicability:'APPLIES' as const}];
    c.rubric.evaluation={sources:[],criteria};
    const updated=withEvaluation(c.rubric,structuredClone(c.rubric.evaluation));
    expect(updated.acceptedRisks).toEqual(c.rubric.acceptedRisks);
    expect(withEvaluation(c.rubric,c.rubric.evaluation,true).acceptedRisks).toEqual(['HIGH']);
  });
  it("permite salvar referências incompletas em rascunho e mantém a publicação bloqueada", () => {
    const c = structuredClone(validationCases[0]);
    c.rubric.evaluation = {
      sources: [
        {
          id: "s",
          title: "",
          institution: "",
          version: "",
          url: "",
          section: "",
          excerpt: "",
          origin: "LOCAL",
          verified: false,
          hash: "",
        },
      ],
      criteria: [],
    };
    expect(caseSchema.safeParse(c).success).toBe(true);
    expect(publicationIssues(c.patient, c.rubric).length).toBeGreaterThan(0);
    expect(isCaseFormShape(c.patient, c.rubric)).toBe(true);
    expect(isCaseFormShape({}, c.rubric)).toBe(false);
    expect(
      isCaseFormShape(c.patient, { ...c.rubric, requiredTopics: null }),
    ).toBe(false);
  });
  it("mantém múltiplos critérios, decisões e referências ao atualizar respostas", () => {
    const rubric = structuredClone(demoCases[0].rubric);
    const criteria = ["HIGH", "LOW"].map((v, i) => ({
      id: "c" + i,
      version: 2,
      dimension: "RISK" as const,
      field: "risk" as const,
      operator: "ONE_OF" as const,
      origin: "LOCAL" as const,
      severity: "REVIEW" as const,
      acceptedAnswers: [v],
      rationale: "Motivo próprio " + i,
      sourceRefs: ["s"],
      applicability:
        i === 0 ? ("APPLIES" as const) : ("NOT_APPLICABLE" as const),
    }));
    const bundle = { sources: [], criteria };
    const updated = withEvaluation(rubric, bundle);
    expect(updated.evaluation).toEqual(bundle);
    expect(updated.acceptedRisks).toEqual(["HIGH", "LOW"]);
    expect(updated.references).toEqual(rubric.references);
    expect(rubric.acceptedRisks).not.toEqual(["HIGH", "LOW"]);
  });
  it("lista todas as decisões pendentes com o item responsável, sem aprová-las", () => {
    const c = structuredClone(validationCases[0]);
    c.rubric.evaluation = {
      sources: [
        {
          id: "s",
          title: "Referência",
          institution: "MS",
          version: "1",
          url: "https://bvsms.saude.gov.br/",
          section: "",
          excerpt: "Trecho em revisão",
          origin: "MS",
          verified: false,
          hash: "",
        },
      ],
      criteria: ["RISK", "OUTCOME"].map((dimension, i) => ({
        id: "c" + i,
        version: 1,
        dimension: dimension as "RISK" | "OUTCOME",
        field: i === 0 ? ("risk" as const) : ("outcome" as const),
        operator: "ONE_OF" as const,
        origin: "LOCAL" as const,
        severity: "REVIEW" as const,
        acceptedAnswers: [i === 0 ? "HIGH" : "REFER"],
        rationale: "Conferir o caso",
        sourceRefs: ["s"],
        applicability: "UNKNOWN" as const,
      })),
    };
    const issues = publicationIssues(c.patient, c.rubric);
    expect(issues.filter((i) => i.code === "APPLICABILITY")).toHaveLength(2);
    expect(issues.filter((i) => i.code === "SOURCE_REVIEW")).toHaveLength(1);
    expect(issues.find((i) => i.code === "APPLICABILITY")?.target).toBe(
      "criterion-c0",
    );
    expect(c.rubric.evaluation.criteria[0].applicability).toBe("UNKNOWN");
  });
  it("preserva a revisão do legado e não permite códigos inventados", () => {
    const c = structuredClone(demoCases[0]);
    expect(publicationIssues(c.patient, c.rubric)).toEqual([]);
    c.rubric.acceptedCiap = ["INVENTADO"];
    expect(
      publicationIssues(c.patient, c.rubric).some((i) => i.code === "CATALOG"),
    ).toBe(true);
  });
});
