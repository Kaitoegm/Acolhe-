"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  BookOpen,
  RotateCcw,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { AttemptView, Draft } from "@/lib/contracts";
import type { EvaluationV2, FindingV2 } from "@/lib/evaluation/contracts";
import { buildTextMap, plainDocument } from "@/lib/evaluation/anchors";
import type { Decision } from "@/lib/evaluation/revisions";
import { canTransferRevision } from "@/lib/evaluation/revisions";
import { api, post, errorMessage } from "@/lib/client";
import { RevisionHistory } from "./history";
type View = {
  version: number;
  document: Record<string, unknown>;
  decisions: Record<string, Decision>;
};
const categories: Record<string, string> = {
  TERMINOLOGY: "Escrita profissional",
  CLARITY: "Clareza",
  ORDER: "Organização",
  OMISSION: "Informações a conferir",
  CIAP: "CIAP-2",
  PROCEDURE: "Procedimentos",
  RISK: "Alertas e risco",
  OUTCOME: "Direcionamento",
};
export function EvaluationReview({
  attempt,
  feedback,
  draft,
  onDraft,
  instructor,
}: {
  attempt: AttemptView;
  feedback: EvaluationV2;
  draft: Draft;
  onDraft: (d: Draft) => void;
  instructor: boolean;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [focus, setFocus] = useState(""),
    [replay, setReplay] = useState(0),
    [reduced, setReduced] = useState(false),
    [animate, setAnimate] = useState(true);
  const lastApplied = useRef<Record<string, unknown> | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setView(null);
    setError("");
    lastApplied.current = null;
    void api<View>("/api/attempts/" + attempt.id + "/revision")
      .then((v) => {
        if (token === generation.current) setView(v);
      })
      .catch((e) => {
        if (token === generation.current) setError(errorMessage(e));
      });
    return () => {
      generation.current++;
    };
  }, [attempt.id]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setReduced(
        media.matches ||
          localStorage.getItem("acolhe-reduced-motion") === "true",
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  async function decide(
    item: FindingV2,
    state: Decision,
    current = view,
  ): Promise<View | null> {
    if (!current) return null;
    const result = await post<View>(
      "/api/attempts/" + attempt.id + "/revision",
      {
        version: current.version,
        findingId: item.id,
        state,
        idempotencyKey: crypto.randomUUID(),
      },
    );
    setView(result);
    return result;
  }
  async function choose(item: FindingV2, state: Decision) {
    setBusy(true);
    setError("");
    try {
      await decide(item, state);
      setNotice(
        state === "accepted"
          ? "Melhoria incluída na revisão."
          : state === "rejected"
            ? "Texto original mantido."
            : "Decisão desfeita.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const corrections = feedback.items
    .filter((f) => f.replacement && f.anchor && f.original)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const errors = feedback.items.filter(
    (f) => f.kind === "ERROR" && f.level !== "ADEQUATE",
  );
  const canTransfer =
    view &&
    canTransferRevision(
      draft,
      attempt.snapshot,
      view.document,
      lastApplied.current,
    );
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, item] of corrections.entries()) {
    if (
      item.start === undefined ||
      item.end === undefined ||
      item.start < cursor ||
      attempt.snapshot.text.slice(item.start, item.end) !== item.original
    )
      continue;
    fragments.push(attempt.snapshot.text.slice(cursor, item.start));
    const accepted = view?.decisions[item.id] === "accepted";
    fragments.push(
      <button
        type="button"
        key={item.id}
        className={
          "revision-fragment " +
          (accepted ? "accepted " : "") +
          (focus === item.id ? "selected" : "")
        }
        aria-label={
          "Ver sugestão: " + item.original + " para " + item.replacement
        }
        onClick={() => {
          setFocus(item.id);
          document
            .getElementById("finding-" + item.id)
            ?.focus({ preventScroll: true });
        }}
        style={
          {
            "--reveal-delay": Math.min(index * 100, 1500) + "ms",
          } as CSSProperties
        }
      >
        <del>{item.original}</del>
        <ArrowRight size={12} aria-hidden="true" />
        <ins>{item.replacement}</ins>
        {accepted && <Check size={13} aria-label="Aceita" />}
      </button>,
    );
    cursor = item.end;
  }
  fragments.push(attempt.snapshot.text.slice(cursor));
  return (
    <div
      className={
        "evaluation-review " +
        (reduced ? "reduce-motion " : "") +
        (!animate ? "no-animation" : "")
      }
    >
      <div className="review-intro">
        <div className="review-emblem">
          <Sparkles size={23} />
        </div>
        <div>
          <h3>Seu registro, um passo adiante</h3>
          <p>
            Veja o que você registrou, entenda cada sugestão e escolha como
            melhorar.
          </p>
        </div>
      </div>
      <div className="review-counters" aria-label="Resumo da avaliação">
        <span>
          <strong>{errors.length}</strong> pontos para rever
        </span>
        <span>
          <strong>{corrections.length}</strong> melhorias de escrita
        </span>
        <span>
          <strong>
            {feedback.items.filter((i) => i.level === "ADEQUATE").length}
          </strong>{" "}
          critérios atendidos
        </span>
      </div>
      <p className="muted small">{feedback.summary}</p>
      {feedback.clinicalPending && (
        <p className="notice">
          <AlertCircle size={17} /> Avaliação clínica pendente de revisão pelo
          instrutor. As melhorias de escrita já podem ser exploradas.
        </p>
      )}
      {feedback.mode === "demo" && (
        <p className="small muted">
          Modo demonstrativo · exemplos de linguagem por regras locais. A
          análise contextual por IA depende do provedor configurado.
        </p>
      )}
      {feedback.coverage === "PARTIAL" && (
        <p className="notice">
          A análise apresenta uma parte das observações. Confira o restante com
          o instrutor.
        </p>
      )}
      {errors.some((i) => i.level === "ATTENTION") && (
        <div className="review-attention" role="status">
          <strong>Atenção ao direcionamento</strong>
          {errors
            .filter((i) => i.level === "ATTENTION")
            .map((i) => (
              <p key={i.id}>{i.explanation}</p>
            ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="review-toolbar">
        <span>Compare as mudanças sugeridas</span>
        <div>
          <button
            type="button"
            onClick={() => {
              setAnimate(false);
              setNotice("Todas as sugestões estão visíveis.");
            }}
          >
            Ver tudo agora
          </button>
          <button
            type="button"
            onClick={() => {
              setAnimate(true);
              setReplay((n) => n + 1);
            }}
          >
            <RotateCcw size={14} /> Repetir demonstração
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => {
                setReduced(e.target.checked);
                localStorage.setItem(
                  "acolhe-reduced-motion",
                  String(e.target.checked),
                );
              }}
            />
            Reduzir movimento
          </label>
        </div>
      </div>
      <div className="revision-workspace">
        <div className="revision-reading">
          <div className="revision-paper">
            <h4>Propostas sobre seu texto</h4>
            <p className="small muted">
              Selecione uma mudança para entender o motivo. Riscado: original.
              Sublinhado: sugestão.
            </p>
            <div
              key={replay}
              className="revision-text"
              aria-label="Comparação das sugestões"
            >
              {fragments}
            </div>
            {!corrections.length && (
              <p className="small muted">
                Nenhuma substituição automática identificada. Veja as
                observações ao lado.
              </p>
            )}
          </div>
          <details className="revision-original">
            <summary>Ver registro original enviado</summary>
            <p className="revision-text">{attempt.snapshot.text}</p>
            <dl className="snapshot-fields">
              <dt>CIAP-2</dt>
              <dd>{attempt.snapshot.ciap}</dd>
              <dt>Procedimentos</dt>
              <dd>{attempt.snapshot.procedures.join(", ") || "Nenhum"}</dd>
              <dt>Risco no exercício</dt>
              <dd>{attempt.snapshot.risk}</dd>
              <dt>Desfecho</dt>
              <dd>
                {attempt.snapshot.outcome === "REFER"
                  ? "Encaminhamento"
                  : "Liberação"}
              </dd>
            </dl>
          </details>
          {view && (
            <div className="revision-result">
              <h4>
                <CheckCircle2 size={17} /> Sua versão de revisão
              </h4>
              <p className="revision-text" aria-label="Texto revisado">
                {buildTextMap(view.document).text}
              </p>
              <p className="small muted">
                {
                  Object.values(view.decisions).filter((d) => d === "accepted")
                    .length
                }{" "}
                sugestões aceitas · tentativa original preservada
              </p>
              {!instructor && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !canTransfer}
                  onClick={() => {
                    const text = buildTextMap(view.document).text;
                    onDraft({ ...draft, text, document: view.document });
                    lastApplied.current = view.document;
                    setNotice(
                      "Revisão levada ao registro. Confira e envie uma nova tentativa quando terminar.",
                    );
                  }}
                >
                  Usar revisão no registro <ArrowRight size={15} />
                </button>
              )}
              {!instructor && !canTransfer && (
                <p className="notice">
                  Seu rascunho tem outras alterações. Compare as versões e
                  revise manualmente para preservar suas mudanças.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="revision-findings">
          <div className="section-title">
            <h4>Entenda cada observação</h4>
            {!instructor && corrections.length > 1 && (
              <button
                disabled={busy || !view}
                type="button"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    let current = view;
                    for (const item of corrections)
                      if (current && !current.decisions[item.id])
                        current = await decide(item, "accepted", current);
                    setNotice(
                      "Melhorias incluídas na revisão. Confira o resultado.",
                    );
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Aceitar melhorias de escrita
              </button>
            )}
          </div>
          {feedback.items.length === 0 && (
            <p className="muted">
              Nenhuma observação identificada nesta análise. Você pode discutir
              seu registro com o instrutor.
            </p>
          )}
          {feedback.items.map((item) => (
            <article
              tabIndex={-1}
              id={"finding-" + item.id}
              key={item.id}
              className={
                "finding " + (focus === item.id ? "focused " : "") + item.level
              }
              onFocus={() => setFocus(item.id)}
            >
              <div className="finding-heading">
                <span className={"level " + item.level}>
                  {item.level === "ADEQUATE"
                    ? "Adequado"
                    : item.kind === "IMPROVEMENT"
                      ? "Melhoria opcional"
                      : item.kind === "UNCERTAIN"
                        ? "Conferir"
                        : "Rever"}
                </span>
                <strong>{categories[item.category]}</strong>
              </div>
              {item.original && (
                <p className="finding-change">
                  <del>{item.original}</del>
                  {item.replacement && (
                    <>
                      <ArrowRight size={15} />
                      <ins>{item.replacement}</ins>
                    </>
                  )}
                </p>
              )}
              <h5>Por que revisar?</h5>
              <p>{item.explanation}</p>
              {!item.replacement && (
                <>
                  <h5>Próximo passo</h5>
                  <p>{item.suggestion}</p>
                </>
              )}
              {!!item.evidenceQuotes?.length && (
                <details className="finding-source">
                  <summary>
                    <BookOpen size={14} /> Ver informação do caso
                  </summary>
                  {item.evidenceQuotes.map((e) => (
                    <blockquote key={e.id}>
                      {e.text}
                      <small>Identificador: {e.id}</small>
                    </blockquote>
                  ))}
                </details>
              )}
              {!!item.sourceRefs.length && (
                <details className="finding-source">
                  <summary>
                    <BookOpen size={14} /> Ver fundamento
                  </summary>
                  {item.sourceRefs.map((id) => {
                    const source = feedback.sources.find((s) => s.id === id);
                    return source ? (
                      <div key={id}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                        <p>
                          {source.institution} · {source.version} ·{" "}
                          {source.section}
                          {source.printedPage
                            ? " · p. " + source.printedPage
                            : ""}
                        </p>
                        <blockquote>{source.excerpt}</blockquote>
                        <small>
                          Origem:{" "}
                          {source.origin === "MS"
                            ? "Ministério da Saúde"
                            : source.origin === "LOCAL"
                              ? "Protocolo local"
                              : "Rubrica pedagógica"}
                        </small>
                      </div>
                    ) : null;
                  })}
                </details>
              )}
              {!item.sourceRefs.length && (
                <small className="muted">
                  Critério: {item.criterion}. Sugestão pedagógica de
                  treinamento.
                </small>
              )}
              {!instructor && item.replacement && item.anchor && (
                <div className="finding-actions">
                  <button
                    type="button"
                    className={
                      view?.decisions[item.id] === "accepted"
                        ? "accepted-button"
                        : ""
                    }
                    disabled={
                      busy || !view || view.decisions[item.id] === "accepted"
                    }
                    onClick={() => void choose(item, "accepted")}
                  >
                    <Check size={14} />
                    {view?.decisions[item.id] === "accepted"
                      ? "Aceita na revisão"
                      : "Aplicar sugestão"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || !view || view.decisions[item.id] === "rejected"
                    }
                    onClick={() => void choose(item, "rejected")}
                  >
                    Manter meu texto
                  </button>
                  {view?.decisions[item.id] && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void choose(item, "pending")}
                    >
                      <RotateCcw size={13} /> Desfazer
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
      <RevisionHistory key={attempt.id} attemptId={attempt.id} />
    </div>
  );
}
