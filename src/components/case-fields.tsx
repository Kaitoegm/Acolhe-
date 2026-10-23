"use client";
import type { PatientFacts, Rubric, Risk, Outcome } from "@/lib/contracts";
import { riskLabels } from "./shell";
import { ProtocolFields } from "./evaluation/protocol-fields";
import { Choices, riskOptions, outcomeOptions } from "./instructor/choices";
import { ciapCatalog, sigtapCatalog } from "@/lib/domain/catalogs";
import { withEvaluation, evaluationConflicts } from "@/lib/instructor-form";
import { dimensionNames } from "@/lib/evaluation/publication";
export function CaseFields({
  patient,
  rubric,
  onPatient,
  onRubric,
  section = "all",
}: {
  patient: string;
  rubric: string;
  onPatient: (s: string) => void;
  onRubric: (s: string) => void;
  section?: "all" | "patient" | "conversation" | "criteria";
}) {
  let p: PatientFacts, r: Rubric;
  try {
    p = JSON.parse(patient);
    r = JSON.parse(rubric);
  } catch {
    return (
      <p className="error">
        Corrija o JSON na seção avançada para voltar aos campos do formulário.
      </p>
    );
  }
  const updateP = (value: Partial<PatientFacts>) =>
    onPatient(JSON.stringify({ ...p, ...value }, null, 2));
  const updateR = (value: Partial<Rubric>) =>
    onRubric(JSON.stringify({ ...r, ...value }, null, 2));
  return (
    <div className="case-fields">
      {(section === "all" || section === "patient") && (
        <section id="patient">
          <h3>Identificação do paciente fictício</h3>
          <div className="form-grid">
            {(
              [
                { key: "name", label: "Nome completo" },
                { key: "age", label: "Idade", placeholder: "Ex.: 35 anos" },
                { key: "sex", label: "Sexo" },
                {
                  key: "birthDate",
                  label: "Data de nascimento",
                  placeholder: "DD/MM/AAAA",
                },
                { key: "mother", label: "Nome da mãe" },
              ] as const
            ).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  required
                  value={p[f.key] || ""}
                  onChange={(e) => updateP({ [f.key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label>
            Queixa principal
            <textarea
              required
              value={p.chiefComplaint || ""}
              onChange={(e) => updateP({ chiefComplaint: e.target.value })}
            />
          </label>
          <label>
            História e antecedentes
            <textarea
              required
              value={p.history || ""}
              onChange={(e) => updateP({ history: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Alergias
              <input
                value={p.allergies || ""}
                onChange={(e) => updateP({ allergies: e.target.value })}
              />
            </label>
            <label>
              Medicamentos em uso
              <input
                value={p.medications || ""}
                onChange={(e) => updateP({ medications: e.target.value })}
              />
            </label>
          </div>
          <h3>Sinais vitais e medidas</h3>
          {(p.vitals || []).map((v, i) => (
            <div className="repeat-row" key={i}>
              <label>
                Medida
                <input
                  value={v.label}
                  placeholder="Pressão arterial"
                  onChange={(e) =>
                    updateP({
                      vitals: p.vitals.map((item, j) =>
                        j === i ? { ...item, label: e.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Valor e unidade
                <input
                  value={v.value}
                  placeholder="120/80 mmHg"
                  onChange={(e) =>
                    updateP({
                      vitals: p.vitals.map((item, j) =>
                        j === i ? { ...item, value: e.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  updateP({ vitals: p.vitals.filter((_, j) => j !== i) })
                }
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              updateP({
                vitals: [...(p.vitals || []), { label: "", value: "" }],
              })
            }
          >
            Adicionar medida
          </button>
          <Choices
            label="Procedimentos já realizados neste cenário"
            options={sigtapCatalog}
            value={p.performedProcedures || []}
            search
            onChange={(performedProcedures) => updateP({ performedProcedures })}
          />
          <p className="muted">
            Selecione apenas ações realizadas. Medidas históricas e ações
            previstas devem ser descritas na história.
          </p>
        </section>
      )}
      {(section === "all" || section === "conversation") && (
        <section>
          <h3>Respostas do paciente</h3>
          <p className="muted small">
            Defina os fatos que o paciente pode revelar durante a conversa.
            Palavras-chave são separadas por vírgulas.
          </p>
          {(p.facts || []).map((fact, i) => (
            <div className="repeat-row" key={i}>
              <details className="advanced-case">
                <summary>Assunto e palavras para reconhecer a pergunta</summary>
                <label>
                  Palavras-chave
                  <input
                    value={fact.keywords.join(", ")}
                    onChange={(e) =>
                      updateP({
                        facts: p.facts.map((item, j) =>
                          j === i
                            ? {
                                ...item,
                                keywords: e.target.value
                                  .split(",")
                                  .map((v) => v.trim()),
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </details>
              <label>
                Resposta
                <textarea
                  value={fact.answer}
                  onChange={(e) =>
                    updateP({
                      facts: p.facts.map((item, j) =>
                        j === i ? { ...item, answer: e.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  updateP({ facts: p.facts.filter((_, j) => j !== i) })
                }
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              updateP({
                facts: [...(p.facts || []), { keywords: [], answer: "" }],
              })
            }
          >
            Adicionar resposta
          </button>
          <details className="advanced-case">
            <summary>Prévia da conversa</summary>
            {p.facts.map((f, i) => (
              <div key={i}>
                <strong>{f.keywords.join(" / ") || "Assunto sem nome"}</strong>
                <p>{f.answer || "Resposta ainda não preenchida."}</p>
              </div>
            ))}
          </details>
        </section>
      )}
      {(section === "all" || section === "criteria") && (
        <section>
          <h3>Critérios da devolutiva</h3>
          <p className="muted small">
            Os critérios são privados do instrutor. A publicação exige revisão
            clínica.
          </p>
          {!r.evaluation && (
            <>
              <div className="form-grid">
                <div>
                  <Choices
                    label="Motivos aceitos"
                    options={ciapCatalog}
                    search
                    value={r.acceptedCiap || []}
                    onChange={(acceptedCiap) => updateR({ acceptedCiap })}
                  />
                </div>
                <div>
                  <Choices
                    label="Procedimentos esperados"
                    options={sigtapCatalog}
                    search
                    value={r.expectedProcedures || []}
                    onChange={(expectedProcedures) =>
                      updateR({ expectedProcedures })
                    }
                  />
                  <small>
                    Deixe vazio se nenhum procedimento for esperado.
                  </small>
                </div>
              </div>
              <fieldset className="criteria-options">
                <legend>Classificações de risco aceitas</legend>
                {Object.entries(riskLabels).map(([key, label]) => (
                  <label className="checkbox-label" key={key}>
                    <input
                      type="checkbox"
                      checked={(r.acceptedRisks || []).includes(key as Risk)}
                      onChange={(e) =>
                        updateR({
                          acceptedRisks: e.target.checked
                            ? [...r.acceptedRisks, key as Risk]
                            : r.acceptedRisks.filter((v) => v !== key),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="criteria-options">
                <legend>Desfechos aceitos</legend>
                {[
                  { key: "RELEASE", label: "Liberar cidadão" },
                  { key: "REFER", label: "Encaminhar para atendimento" },
                ].map(({ key, label }) => (
                  <label className="checkbox-label" key={key}>
                    <input
                      type="checkbox"
                      checked={(r.acceptedOutcomes || []).includes(
                        key as Outcome,
                      )}
                      onChange={(e) =>
                        updateR({
                          acceptedOutcomes: e.target.checked
                            ? [...r.acceptedOutcomes, key as Outcome]
                            : r.acceptedOutcomes.filter((v) => v !== key),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <details className="review-item" id="topics">
            <summary>Registro e fundamentação do caso</summary>
            <div className="review-item-body">
              <h4>Tópicos necessários no registro</h4>
              {(r.requiredTopics || []).map((topic, i) => (
                <div className="repeat-row" key={i}>
                  <label>
                    Tópico
                    <input
                      value={topic.label}
                      onChange={(e) =>
                        updateR({
                          requiredTopics: r.requiredTopics.map((item, j) =>
                            j === i ? { ...item, label: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Palavras-chave
                    <input
                      value={topic.keywords.join(", ")}
                      onChange={(e) =>
                        updateR({
                          requiredTopics: r.requiredTopics.map((item, j) =>
                            j === i
                              ? {
                                  ...item,
                                  keywords: e.target.value
                                    .split(",")
                                    .map((v) => v.trim()),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateR({
                        requiredTopics: r.requiredTopics.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateR({
                    requiredTopics: [
                      ...(r.requiredTopics || []),
                      { label: "", keywords: [] },
                    ],
                  })
                }
              >
                Adicionar tópico
              </button>
              <label>
                Fundamentação clínica
                <textarea
                  id="rationale"
                  aria-label="Fundamentação clínica"
                  required
                  value={r.rationale || ""}
                  onChange={(e) => updateR({ rationale: e.target.value })}
                />
              </label>
              <label>
                Referências
                <textarea
                  id="references"
                  aria-label="Referências"
                  required
                  value={(r.references || []).join("\n")}
                  onChange={(e) =>
                    updateR({ references: e.target.value.split("\n") })
                  }
                />
                <small>
                  Uma referência ou endereço por linha. Confira a atualidade
                  antes de aprovar.
                </small>
              </label>
            </div>
          </details>
          {!!evaluationConflicts(r).length && (
            <div className="publication-checklist">
              <p>
                Há respostas diferentes nas configurações anteriores do caso:{" "}
                {evaluationConflicts(r)
                  .map((d) => dimensionNames[d])
                  .join(", ")}
                . Confira antes de aprovar.
              </p>
              <button
                type="button"
                onClick={() =>
                  onRubric(
                    JSON.stringify(
                      withEvaluation(r, r.evaluation, true),
                      null,
                      2,
                    ),
                  )
                }
              >
                Usar as respostas dos itens de avaliação
              </button>
            </div>
          )}
          <ProtocolFields
            value={r.evaluation}
            onChange={(evaluation) =>
              onRubric(JSON.stringify(withEvaluation(r, evaluation), null, 2))
            }
          />
        </section>
      )}
    </div>
  );
}
