"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { ErrorBox } from "./shell";

type Dimension = {
  category: string;
  ADEQUATE: number;
  REVIEW: number;
  ATTENTION: number;
};
type Progress = {
  nature?: { errors: number; improvements: number; uncertain: number };
  totalAttempts: number;
  dimensions: Dimension[];
  latest: {
    id: string;
    number: number;
    createdAt: string;
    dimensions: Dimension[];
  }[];
};
const dimensions: Record<string, string> = {
  TERMINOLOGY: "Terminologia",
  CLARITY: "Clareza",
  ORDER: "Organização",
  OMISSION: "Completude",
  CIAP: "CIAP-2",
  PROCEDURE: "Procedimentos",
  RISK: "Classificação de risco",
  OUTCOME: "Desfecho",
};
const levels = {
  ADEQUATE: "adequado",
  REVIEW: "revisar",
  ATTENTION: "atenção",
};

export function Evolution({
  simulations,
}: {
  simulations: {
    id: string;
    studentName: string;
    name: string;
    attempts: number;
  }[];
}) {
  const [id, setId] = useState(""),
    [data, setData] = useState<Progress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const completed = [...(data?.latest || [])].reverse();
  function counts(dimension?: Dimension) {
    if (
      !dimension ||
      !Object.keys(levels).some(
        (level) => dimension[level as keyof typeof levels],
      )
    )
      return <span className="muted">Sem observação</span>;
    return (
      <div className="dimension-levels">
        {(Object.keys(levels) as (keyof typeof levels)[]).map((level) =>
          dimension[level] ? (
            <span className={"level " + level} key={level}>
              {dimension[level]} {levels[level]}
            </span>
          ) : null,
        )}
      </div>
    );
  }
  return (
    <section className="evolution">
      <h2>Evolução por dimensão</h2>
      <p className="muted small">
        Compare as duas devolutivas mais recentes e o acumulado das tentativas.
        Os indicadores descrevem observações formativas, sem produzir uma nota
        clínica.
      </p>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setData(null);
          try {
            setData(
              await api<Progress>(
                "/api/instructor/simulations/" + id + "/progress",
              ),
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Aluno e atendimento
          <select
            required
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setData(null);
            }}
          >
            <option value="">Selecione um atendimento</option>
            {simulations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentName} — {s.name} ({s.attempts} tentativa(s))
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !id}>
          {busy ? "Carregando…" : "Comparar tentativas"}
        </button>
      </form>
      <ErrorBox message={error} />
      {data && (
        <>
          <h3 className="space-top">
            {simulations.find((s) => s.id === id)?.name}
          </h3>
          {data.nature && (
            <p className="notice">
              {data.nature.errors} pontos para rever ·{" "}
              {data.nature.improvements} melhorias opcionais de escrita ·{" "}
              {data.nature.uncertain} observações para conferir. Melhorias de
              linguagem não equivalem a erro clínico.
            </p>
          )}
          {completed.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dimensão</th>
                      {completed.map((a) => (
                        <th key={a.id}>
                          Tentativa {a.number}
                          <small>
                            {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                          </small>
                        </th>
                      ))}
                      <th>Acumulado · {data.totalAttempts} tentativa(s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dimensions).map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row">{label}</th>
                        {completed.map((a) => (
                          <td key={a.id}>
                            {counts(
                              a.dimensions.find((d) => d.category === key),
                            )}
                          </td>
                        ))}
                        <td>
                          {counts(
                            data.dimensions.find((d) => d.category === key),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">
                As quantidades dependem dos critérios e do conteúdo de cada
                tentativa. Consulte o registro e os comentários antes de
                interpretar mudanças.
              </p>
            </>
          ) : (
            <p className="notice">
              Este atendimento ainda não tem uma devolutiva concluída.
            </p>
          )}
        </>
      )}
    </section>
  );
}
