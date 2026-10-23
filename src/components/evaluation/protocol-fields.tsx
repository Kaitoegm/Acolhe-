"use client";
import {
  Choices,
  riskOptions,
  outcomeOptions,
} from "@/components/instructor/choices";
import { ciapCatalog, sigtapCatalog } from "@/lib/domain/catalogs";
import { dimensionNames } from "@/lib/evaluation/publication";
import type {
  EvaluationBundle,
  ProtocolSource,
  CriterionV2,
} from "@/lib/evaluation/contracts";
const sourceTemplate: ProtocolSource = {
  id: "fonte-1",
  title: "",
  institution: "Ministério da Saúde",
  version: "",
  url: "https://bvsms.saude.gov.br/",
  section: "",
  excerpt: "",
  origin: "MS",
  verified: false,
  hash: "",
};
const criterionTemplate: CriterionV2 = {
  id: "criterio-1",
  version: 1,
  dimension: "RISK",
  origin: "MS",
  field: "risk",
  operator: "ONE_OF",
  acceptedAnswers: [],
  severity: "ATTENTION",
  rationale: "",
  sourceRefs: [],
  applicability: "UNKNOWN",
};
const official = [
  [
    "Acolhimento à demanda espontânea — volume I",
    "2011",
    "https://bvsms.saude.gov.br/bvs/publicacoes/acolhimento_demanda_espontanea.pdf",
  ],
  [
    "Acolhimento à demanda espontânea — volume II",
    "2012",
    "https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_28.pdf",
  ],
  [
    "PCDT Hipertensão Arterial Sistêmica",
    "2025",
    "https://www.gov.br/saude/pt-br/assuntos/pcdt/h/hipertensao-arterial-sistemica.pdf/view",
  ],
  [
    "Protocolos da Atenção Básica: Saúde das Mulheres",
    "2016",
    "https://bvsms.saude.gov.br/bvs/publicacoes/protocolo_atencao_%20basica_saude_mulher.pdf",
  ],
];
export function ProtocolFields({
  value,
  onChange,
}: {
  value?: EvaluationBundle;
  onChange: (v: EvaluationBundle | undefined) => void;
}) {
  const bundle = value ?? { sources: [], criteria: [] };
  const source = (i: number, patch: Partial<ProtocolSource>) =>
    onChange({
      ...bundle,
      sources: bundle.sources.map((s, j) =>
        i === j
          ? {
              ...s,
              ...patch,
              hash: "",
              verified: "verified" in patch ? patch.verified! : false,
            }
          : s,
      ),
    });
  const criterion = (i: number, patch: Partial<CriterionV2>) =>
    onChange({
      ...bundle,
      criteria: bundle.criteria.map((c, j) =>
        i === j
          ? { ...c, ...patch, approvedBy: undefined, approvedAt: undefined }
          : c,
      ),
    });
  return (
    <section className="protocol-fields" id="criteria">
      <h3>O que avaliar e por quê</h3>
      <p className="muted">
        Vincule cada critério ao trecho que você conferiu. O cadastro de um
        endereço não representa revisão clínica.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? bundle : undefined)}
        />
        Usar critérios com referências
      </label>
      {value && (
        <>
          <details className="advanced-case">
            <summary>Sugestões de referências oficiais</summary>
            <div className="protocol-starters">
              <span>Começar com uma referência oficial</span>
              {official.map(([title, version, url]) => (
                <button
                  type="button"
                  key={url}
                  onClick={() =>
                    onChange({
                      ...bundle,
                      sources: [
                        ...bundle.sources,
                        {
                          ...sourceTemplate,
                          id: "fonte-" + crypto.randomUUID().slice(0, 8),
                          title,
                          version,
                          url,
                        },
                      ],
                    })
                  }
                >
                  {title}
                </button>
              ))}
            </div>
          </details>
          <p className="small muted">
            Cadernos históricos precisam ser confrontados com atualizações.
            Documentos locais e critérios de linguagem devem ter sua própria
            identificação.
          </p>
          {bundle.sources.map((s, i) => (
            <details key={i} className="review-item" id={"source-" + s.id}>
              <summary>
                <span>{s.title || `Referência ${i + 1}`}</span>
                <span className="review-state">
                  {s.verified ? "Conferida" : "Falta conferir"}
                </span>
              </summary>
              <div className="review-item-body">
                <div className="form-grid">
                  <details className="advanced-case">
                    <summary>Identificação avançada</summary>
                    <label>
                      Identificador
                      <input
                        value={s.id}
                        onChange={(e) => {
                          const id = e.target.value;
                          onChange({
                            ...bundle,
                            sources: bundle.sources.map((v, j) =>
                              j === i
                                ? { ...v, id, hash: "", verified: false }
                                : v,
                            ),
                            criteria: bundle.criteria.map((c) => ({
                              ...c,
                              sourceRefs: c.sourceRefs.map((ref) =>
                                ref === s.id ? id : ref,
                              ),
                              approvedBy: undefined,
                              approvedAt: undefined,
                            })),
                          });
                        }}
                      />
                    </label>
                  </details>
                  <label>
                    Origem
                    <select
                      value={s.origin}
                      onChange={(e) =>
                        source(i, {
                          origin: e.target.value as ProtocolSource["origin"],
                        })
                      }
                    >
                      <option value="MS">Ministério da Saúde</option>
                      <option value="LOCAL">Protocolo local</option>
                      <option value="PEDAGOGICAL">Rubrica pedagógica</option>
                    </select>
                  </label>
                  <label>
                    Título
                    <input
                      value={s.title}
                      onChange={(e) => source(i, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    Instituição
                    <input
                      value={s.institution}
                      onChange={(e) =>
                        source(i, { institution: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Edição / ano
                    <input
                      value={s.version}
                      onChange={(e) => source(i, { version: e.target.value })}
                    />
                  </label>
                  <label>
                    Endereço oficial
                    <input
                      type="url"
                      value={s.url}
                      onChange={(e) => source(i, { url: e.target.value })}
                    />
                    {s.url.startsWith("https://") && (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        Abrir referência ↗
                      </a>
                    )}
                  </label>
                  <label>
                    Seção / capítulo
                    <input
                      value={s.section}
                      onChange={(e) => source(i, { section: e.target.value })}
                    />
                  </label>
                  <label>
                    Página impressa
                    <input
                      value={s.printedPage ?? ""}
                      onChange={(e) =>
                        source(i, { printedPage: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Trecho que fundamenta o critério
                  <textarea
                    value={s.excerpt}
                    onChange={(e) => source(i, { excerpt: e.target.value })}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={s.verified}
                    onChange={(e) => source(i, { verified: e.target.checked })}
                  />
                  Conferi este trecho e sua relação com o caso
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...bundle,
                      sources: bundle.sources.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remover fonte
                </button>
              </div>
            </details>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...bundle,
                sources: [
                  ...bundle.sources,
                  {
                    ...sourceTemplate,
                    id: "fonte-" + crypto.randomUUID().slice(0, 8),
                  },
                ],
              })
            }
          >
            Adicionar fonte
          </button>
          <h4>Itens que serão observados na resposta do aluno</h4>
          <p className="small muted">
            No treinamento de técnicos, enfatize reconhecimento, registro e
            comunicação. Classificação formal de risco é atribuição do
            enfermeiro; as escolhas aqui são exercícios supervisionados.
          </p>
          {bundle.criteria.map((c, i) => (
            <details key={i} className="review-item" id={"criterion-" + c.id}>
              <summary>
                <span>
                  {dimensionNames[c.dimension]} · item {i + 1}
                </span>
                <span className="review-state">
                  {c.applicability === "UNKNOWN"
                    ? "Falta revisar"
                    : c.applicability === "APPLIES"
                      ? "Será avaliado"
                      : "Fora da avaliação"}
                </span>
              </summary>
              <div className="review-item-body">
                <div className="form-grid">
                  <details className="advanced-case">
                    <summary>Identificação avançada</summary>
                    <label>
                      Identificador
                      <input
                        value={c.id}
                        onChange={(e) => criterion(i, { id: e.target.value })}
                      />
                    </label>
                  </details>
                  <label>
                    O que será avaliado
                    <select
                      value={c.dimension}
                      onChange={(e) => {
                        const dimension = e.target
                          .value as CriterionV2["dimension"];
                        const field = {
                          CIAP: "ciap",
                          PROCEDURE: "procedures",
                          RISK: "risk",
                          OUTCOME: "outcome",
                          OMISSION: "text",
                        }[dimension] as CriterionV2["field"];
                        criterion(i, {
                          dimension,
                          field,
                          operator:
                            dimension === "PROCEDURE"
                              ? "PERFORMED_ONLY"
                              : dimension === "OMISSION"
                                ? "RECORD_EVIDENCE"
                                : "ONE_OF",
                        });
                      }}
                    >
                      {["CIAP", "PROCEDURE", "RISK", "OUTCOME", "OMISSION"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {
                              {
                                CIAP: "CIAP-2",
                                PROCEDURE: "Procedimentos",
                                RISK: "Alertas e risco no exercício",
                                OUTCOME: "Direcionamento",
                                OMISSION: "Completude do registro",
                              }[v]
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Origem
                    <select
                      value={c.origin}
                      onChange={(e) =>
                        criterion(i, {
                          origin: e.target.value as CriterionV2["origin"],
                        })
                      }
                    >
                      <option value="MS">Ministério da Saúde</option>
                      <option value="LOCAL">Protocolo local</option>
                      <option value="PEDAGOGICAL">Rubrica pedagógica</option>
                    </select>
                  </label>
                  <label>
                    Este item deve ser avaliado neste caso?
                    <select
                      value={c.applicability}
                      onChange={(e) =>
                        criterion(i, {
                          applicability: e.target
                            .value as CriterionV2["applicability"],
                        })
                      }
                    >
                      <option value="UNKNOWN">Ainda vou revisar</option>
                      <option value="APPLIES">Sim</option>
                      <option value="NOT_APPLICABLE">Não</option>
                    </select>
                  </label>
                  <label>
                    Prioridade da observação
                    <select
                      value={c.severity}
                      onChange={(e) =>
                        criterion(i, {
                          severity: e.target.value as "REVIEW" | "ATTENTION",
                        })
                      }
                    >
                      <option value="REVIEW">Rever</option>
                      <option value="ATTENTION">Atenção</option>
                    </select>
                  </label>
                  {c.dimension !== "OMISSION" && (
                    <Choices
                      label="Respostas aceitas"
                      options={
                        c.dimension === "CIAP"
                          ? ciapCatalog
                          : c.dimension === "PROCEDURE"
                            ? sigtapCatalog
                            : c.dimension === "RISK"
                              ? riskOptions
                              : outcomeOptions
                      }
                      value={c.acceptedAnswers}
                      search={["CIAP", "PROCEDURE"].includes(c.dimension)}
                      onChange={(acceptedAnswers) =>
                        criterion(i, { acceptedAnswers })
                      }
                    />
                  )}
                </div>
                <label>
                  Por que avaliar este item e o que deve aparecer no registro?
                  <textarea
                    value={c.rationale}
                    onChange={(e) =>
                      criterion(i, { rationale: e.target.value })
                    }
                  />
                </label>
                <fieldset>
                  <legend>Fontes deste critério</legend>
                  {bundle.sources.map((s) => (
                    <label className="checkbox-label" key={s.id}>
                      <input
                        type="checkbox"
                        checked={c.sourceRefs.includes(s.id)}
                        onChange={(e) =>
                          criterion(i, {
                            sourceRefs: e.target.checked
                              ? [...c.sourceRefs, s.id]
                              : c.sourceRefs.filter((id) => id !== s.id),
                          })
                        }
                      />
                      {s.title || s.id}
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...bundle,
                      criteria: bundle.criteria.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remover critério
                </button>
              </div>
            </details>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...bundle,
                criteria: [
                  ...bundle.criteria,
                  {
                    ...criterionTemplate,
                    id: "criterio-" + crypto.randomUUID().slice(0, 8),
                  },
                ],
              })
            }
          >
            Adicionar critério
          </button>
        </>
      )}
    </section>
  );
}
