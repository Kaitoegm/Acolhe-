"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  MessageCircle,
  Send,
  UserRound,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { Shell, ErrorBox, Loading, riskLabels } from "@/components/shell";
import { ClinicalEditor, CatalogSelect } from "@/components/editor";
import { Feedback } from "@/components/feedback";
import { FieldFeedback } from "@/components/field-feedback";
import { api, post, errorMessage } from "@/lib/client";
import {
  SERVICES,
  type SimulationView,
  type Draft,
  type CatalogItem,
  type UserView,
  type MessageView,
  type AttemptView,
  type AttemptSummary,
  type Page,
  type SimulationStatus,
  type UsageView,
} from "@/lib/contracts";
export default function SimulationPage() {
  const { id } = useParams<{
    id: string;
  }>();
  const [simulation, setSimulation] = useState<SimulationView | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [user, setUser] = useState<UserView | null>(null),
    [catalogs, setCatalogs] = useState<{
      ciap: CatalogItem[];
      sigtap: CatalogItem[];
    }>({ ciap: [], sigtap: [] }),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Salvo"),
    [tab, setTab] = useState("Escuta inicial"),
    [side, setSide] = useState(true),
    [sideTab, setSideTab] = useState("Ficha do cidadão"),
    [message, setMessage] = useState(""),
    [sending, setSending] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [notice, setNotice] = useState("");
  const draftRef = useRef<Draft | null>(null),
    revision = useRef(0),
    generation = useRef(0),
    savedGeneration = useRef(0),
    savePromise = useRef<Promise<void> | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    submitKey = useRef<string | null>(null),
    mounted = useRef(true);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]),
    [attemptCursor, setAttemptCursor] = useState<string | null>(null),
    [messageCursor, setMessageCursor] = useState<string | null>(null),
    [selectedAttempt, setSelectedAttempt] = useState(""),
    [attemptDetail, setAttemptDetail] = useState<AttemptView | null>(null),
    [status, setStatus] = useState<SimulationStatus | null>(null),
    [usage, setUsage] = useState<UsageView | null>(null),
    [historyBusy, setHistoryBusy] = useState(false);
  const conversationRevision = useRef(0),
    chatKey = useRef<string | null>(null),
    statusRef = useRef<SimulationStatus | null>(null),
    selectedRef = useRef(""),
    messagesLoaded = useRef(false),
    attemptsLoaded = useRef(false);
  selectedRef.current = selectedAttempt;
  const loadMessages = useCallback(
    async (cursor?: string) => {
      const page = await api<Page<MessageView>>(
        "/api/simulations/" +
          id +
          "/messages" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      setSimulation((old) =>
        old
          ? {
              ...old,
              messages: [
                ...new Map(
                  [...old.messages, ...page.items].map((row) => [row.id, row]),
                ).values(),
              ].sort(
                (a, b) =>
                  a.createdAt.localeCompare(b.createdAt) ||
                  a.id.localeCompare(b.id),
              ),
            }
          : old,
      );
      if (cursor || !messagesLoaded.current) setMessageCursor(page.nextCursor);
      messagesLoaded.current = true;
    },
    [id],
  );
  const loadAttempts = useCallback(
    async (cursor?: string) => {
      const page = await api<Page<AttemptSummary>>(
        "/api/simulations/" +
          id +
          "/attempts" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      setAttempts((old) =>
        [
          ...new Map(
            [...old, ...page.items].map((row) => [row.id, row]),
          ).values(),
        ].sort((a, b) => b.number - a.number),
      );
      if (cursor || !attemptsLoaded.current) setAttemptCursor(page.nextCursor);
      attemptsLoaded.current = true;
      if (!selectedRef.current && page.items[0])
        setSelectedAttempt(page.items[0].id);
    },
    [id],
  );
  const loadDetail = useCallback(async (attemptId: string) => {
    const result = await api<{ attempt: AttemptView }>(
      "/api/attempts/" + attemptId,
    );
    if (selectedRef.current === attemptId) setAttemptDetail(result.attempt);
    setSimulation((old) =>
      old ? { ...old, attempts: [result.attempt] } : old,
    );
  }, []);
  useEffect(() => {
    if (!selectedAttempt) return;
    setAttemptDetail(null);
    void loadDetail(selectedAttempt).catch((e) => setError(errorMessage(e)));
  }, [selectedAttempt, loadDetail]);
  const loadUsage = useCallback(async () => {
    try {
      setUsage(await api<UsageView>("/api/usage"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  const instructor = user?.role === "INSTRUCTOR";
  const receiveUser = useCallback((u: UserView) => setUser(u), []);
  useEffect(() => {
    mounted.current = true;
    Promise.all([
      api<{
        simulation: SimulationView;
      }>("/api/simulations/" + id),
      api<{
        ciap: CatalogItem[];
        sigtap: CatalogItem[];
      }>("/api/catalogs"),
    ])
      .then(([r, c]) => {
        if (!mounted.current) return;
        setSimulation(r.simulation);
        setDraft(r.simulation.draft);
        draftRef.current = r.simulation.draft;
        revision.current = r.simulation.revision;
        conversationRevision.current = r.simulation.conversationRevision;
        setCatalogs(c);
        void Promise.all([loadMessages(), loadAttempts(), loadUsage()]).catch(
          (e) => setError(errorMessage(e)),
        );
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [id, loadMessages, loadAttempts, loadUsage]);
  const flush = useCallback(async () => {
    if (instructor || !draftRef.current) return;
    if (savePromise.current) {
      await savePromise.current;
      if (savedGeneration.current === generation.current) return;
    }
    const run = async () => {
      while (savedGeneration.current < generation.current) {
        const g = generation.current;
        const current = draftRef.current;
        setSaveState("Salvando…");
        try {
          const r = await api<{
            revision: number;
          }>("/api/simulations/" + id, {
            method: "PUT",
            body: JSON.stringify({
              draft: current,
              revision: revision.current,
            }),
          });
          revision.current = r.revision;
          savedGeneration.current = g;
          setSaveState(
            savedGeneration.current === generation.current
              ? "Salvo"
              : "Alterações pendentes",
          );
        } catch (e) {
          setSaveState("Falha ao salvar");
          setError(errorMessage(e));
          throw e;
        }
      }
    };
    savePromise.current = run();
    try {
      await savePromise.current;
    } finally {
      savePromise.current = null;
    }
  }, [id, instructor]);
  function change(next: Draft) {
    if (instructor) return;
    draftRef.current = next;
    setDraft(next);
    generation.current++;
    submitKey.current = null;
    setSaveState("Alterações pendentes");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush().catch(() => {}), 750);
  }
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (generation.current !== savedGeneration.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  useEffect(() => {
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        generation.current === savedGeneration.current
      )
        return;
      const anchor = (event.target as HTMLElement).closest("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void flush()
        .then(() => window.location.assign(destination.href))
        .catch(() => {});
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [flush]);
  const refresh = useCallback(async () => {
    try {
      const next = await api<SimulationStatus>(
        "/api/simulations/" + id + "/status",
      );
      const previous = statusRef.current;
      statusRef.current = next;
      setStatus(next);
      if (next.conversationRevision !== conversationRevision.current) {
        conversationRevision.current = next.conversationRevision;
        await loadMessages();
      }
      setSimulation((old) =>
        old
          ? {
              ...old,
              status: next.status,
              latestAttempt: next.latestAttempt,
              conversationRevision: next.conversationRevision,
            }
          : old,
      );
      if (
        next.latestAttempt &&
        (!previous ||
          next.latestAttempt.id !== previous.latestAttempt?.id ||
          next.latestAttempt.status !== previous.latestAttempt?.status)
      ) {
        await loadAttempts();
        if (selectedRef.current) await loadDetail(selectedRef.current);
        await loadUsage();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, loadMessages, loadAttempts, loadDetail, loadUsage]);
  const pendingChat =
    status?.pendingChat?.status === "QUEUED" ||
    status?.pendingChat?.status === "RUNNING";
  const pending = ["QUEUED", "RUNNING"].includes(
    status?.latestAttempt?.status || simulation?.latestAttempt?.status || "",
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!pending && !pendingChat) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      stopped = false,
      delay = 2000;
    const poll = async () => {
      if (stopped || document.hidden) return;
      await refresh();
      delay = Math.min(delay + 1000, 10000);
      if (!stopped) timer = setTimeout(poll, delay);
    };
    const visible = () => {
      if (timer) clearTimeout(timer);
      if (!document.hidden) {
        delay = 2000;
        void poll();
      }
    };
    timer = setTimeout(poll, delay);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pending, pendingChat, refresh]);
  async function submit() {
    if (!draft || instructor) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await flush();
      if (!submitKey.current) submitKey.current = crypto.randomUUID();
      await post("/api/simulations/" + id + "/submit", {
        revision: revision.current,
        conversationRevision: conversationRevision.current,
        idempotencyKey: submitKey.current,
      });
      setSelectedAttempt("");
      selectedRef.current = "";
      await refresh();
      await loadUsage();
      setNotice(
        "Registro enviado. Sua tentativa foi preservada para comparação.",
      );
      setTimeout(
        () =>
          document
            .getElementById("feedback-title")
            ?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
              block: "start",
            }),
        100,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }
  if (!simulation || !draft)
    return (
      <Shell onUser={receiveUser}>
        {error ? (
          <main className="page">
            <ErrorBox message={error} />
            <Link href="/">Voltar à lista</Link>
          </main>
        ) : (
          <Loading />
        )}
      </Shell>
    );
  const p = simulation.case.patient;
  const disabled = instructor || submitting || !user;
  return (
    <Shell onUser={receiveUser}>
      <main className="care-page">
        <div className="care-top">
          <Link href="/">
            <ArrowLeft size={17} /> Lista de atendimentos
          </Link>
          <span
            className={
              "save-state " + (saveState.includes("Falha") ? "failed" : "")
            }
            aria-live="polite"
          >
            {instructor ? (
              "Visualização do instrutor"
            ) : (
              <>
                <Check size={14} />
                {saveState}
              </>
            )}
            {saveState.includes("Falha") && (
              <button onClick={() => void flush().catch(() => {})}>
                Tentar salvar
              </button>
            )}
          </span>
        </div>
        <section className="patient-header">
          <div className="avatar">
            <UserRound size={28} />
          </div>
          <div>
            <h1>{p.name}</h1>
            <p>
              {p.age} <span>·</span> {p.sex} <span>·</span> Nascimento:{" "}
              {p.birthDate}
            </p>
          </div>
          <span className="service-badge">DEMANDA ESPONTÂNEA</span>
        </section>
        <nav className="tabs" aria-label="Seções do atendimento">
          {[
            "Folha de rosto",
            "Escuta inicial",
            "Cadastro do cidadão",
            "Agendamentos",
          ].map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <ErrorBox message={error} />
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {status && !status.worker.healthy && (
          <div className="notice" role="status">
            Serviço de respostas indisponível no momento. Os trabalhos aceitos
            aguardam na fila; seu registro continua disponível para edição.
          </div>
        )}
        {status?.latestTurn?.status === "FAILED" && (
          <ErrorBox
            message={
              status.latestTurn.error ||
              "A resposta do paciente falhou. Você pode enviar uma nova pergunta."
            }
          />
        )}
        {simulation.case.status !== "PUBLISHED" && (
          <div className="clinical-banner">
            <AlertCircle size={16} /> Caso demonstrativo em revisão. A
            devolutiva clínica exige validação do instrutor.
          </div>
        )}
        <div className={"care-layout " + (!side ? "collapsed" : "")}>
          <div className="care-main">
            {tab === "Escuta inicial" ? (
              <>
                <div className="section-title">
                  <h2>Escuta inicial</h2>
                  <button
                    className="subtle"
                    aria-expanded={side}
                    onClick={() => setSide(!side)}
                  >
                    <ClipboardList size={17} />
                    {side ? "Recolher ficha" : "Abrir ficha e conversa"}
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <fieldset disabled={disabled} className="clinical-fields">
                    <CatalogSelect
                      label="Motivo da consulta · CIAP-2 *"
                      items={catalogs.ciap}
                      value={draft.ciap}
                      onSelect={(ciap) => change({ ...draft, ciap })}
                      disabled={disabled}
                    />
                    <FieldFeedback
                      attempts={simulation.attempts}
                      field="ciap"
                    />
                    <div className="field-heading">
                      <label>Descrição da escuta inicial *</label>
                      <span>Registre os achados e a conduta</span>
                    </div>
                    <ClinicalEditor
                      draft={draft}
                      disabled={disabled}
                      onChange={(text, document) =>
                        change({ ...draftRef.current!, text, document })
                      }
                    />
                    <FieldFeedback
                      attempts={simulation.attempts}
                      field="text"
                    />
                    <CatalogSelect
                      label="Procedimentos realizados · SIGTAP"
                      items={catalogs.sigtap}
                      onSelect={(code) => {
                        if (!draft.procedures.includes(code))
                          change({
                            ...draft,
                            procedures: [...draft.procedures, code],
                          });
                      }}
                      disabled={disabled}
                    />
                    {draft.procedures.length > 0 && (
                      <div className="chips">
                        {draft.procedures.map((code) => (
                          <span key={code}>
                            {code} ·{" "}
                            {catalogs.sigtap.find((i) => i.code === code)
                              ?.label || "Procedimento"}
                            <button
                              type="button"
                              aria-label={"Remover procedimento " + code}
                              onClick={() =>
                                change({
                                  ...draft,
                                  procedures: draft.procedures.filter(
                                    (p) => p !== code,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <FieldFeedback
                      attempts={simulation.attempts}
                      field="procedures"
                    />
                    <fieldset className="risk-field">
                      <legend>
                        Classificação de risco / vulnerabilidade *
                      </legend>
                      <p className="muted small">Exercício supervisionado: reconheça sinais de alerta e comunique à equipe. A classificação formal é atribuição do enfermeiro.</p>
                      <div className="risk-options">
                        {Object.entries(riskLabels).map(([key, label]) => (
                          <label
                            key={key}
                            className={
                              "risk-tile " +
                              key +
                              (draft.risk === key ? " chosen" : "")
                            }
                          >
                            <input
                              type="radio"
                              name="risk"
                              required
                              checked={draft.risk === key}
                              onChange={() =>
                                change({ ...draft, risk: key as Draft["risk"] })
                              }
                            />
                            <span className="risk-color" />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <FieldFeedback
                      attempts={simulation.attempts}
                      field="risk"
                    />
                    <fieldset className="outcome-field">
                      <legend>Desfecho da escuta inicial *</legend>
                      <div className="radio-row">
                        <label>
                          <input
                            type="radio"
                            name="outcome"
                            required
                            checked={draft.outcome === "RELEASE"}
                            onChange={() =>
                              change({
                                ...draft,
                                outcome: "RELEASE",
                                professional: "",
                                team: "",
                              })
                            }
                          />{" "}
                          Liberar cidadão
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="outcome"
                            required
                            checked={draft.outcome === "REFER"}
                            onChange={() =>
                              change({ ...draft, outcome: "REFER" })
                            }
                          />{" "}
                          Encaminhar para atendimento
                        </label>
                      </div>
                      {draft.outcome === "REFER" && (
                        <div className="referral">
                          <div className="form-grid">
                            <label>
                              Profissional
                              <input
                                required
                                value={draft.professional}
                                maxLength={120}
                                placeholder="Nome ou categoria profissional"
                                onChange={(e) =>
                                  change({
                                    ...draft,
                                    professional: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Equipe
                              <input
                                required
                                value={draft.team}
                                maxLength={120}
                                placeholder="Equipe de referência"
                                onChange={(e) =>
                                  change({ ...draft, team: e.target.value })
                                }
                              />
                            </label>
                          </div>
                          <fieldset className="services">
                            <legend>Tipos de serviço *</legend>
                            <div>
                              {SERVICES.map((service) => (
                                <label key={service}>
                                  <input
                                    type="checkbox"
                                    checked={draft.services.includes(service)}
                                    onChange={(e) =>
                                      change({
                                        ...draft,
                                        services: e.target.checked
                                          ? [...draft.services, service]
                                          : draft.services.filter(
                                              (s) => s !== service,
                                            ),
                                      })
                                    }
                                  />
                                  {service}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        </div>
                      )}
                    </fieldset>
                    <FieldFeedback
                      attempts={simulation.attempts}
                      field="outcome"
                    />
                  </fieldset>
                  <div className="form-footer">
                    <span>
                      {instructor
                        ? "Registro do aluno · somente leitura"
                        : "* Campos obrigatórios"}
                    </span>
                    {!instructor && (
                      <button
                        className="primary"
                        disabled={
                          disabled ||
                          !!pending ||
                          !!pendingChat ||
                          (usage
                            ? !usage.shared.evaluation ||
                              usage.evaluation.remaining <= 0
                            : false) ||
                          !draft.ciap ||
                          !draft.text.trim() ||
                          !draft.risk ||
                          !draft.outcome ||
                          (draft.outcome === "REFER" && !draft.services.length)
                        }
                      >
                        <Check size={18} />
                        {submitting
                          ? "Enviando…"
                          : pendingChat
                            ? "Aguardando resposta do paciente"
                            : pending
                              ? "Aguardando devolutiva"
                              : simulation.attempts.length
                                ? "Enviar nova tentativa"
                                : "Concluir simulação"}
                      </button>
                    )}
                  </div>
                </form>
                <UsageNotice
                  usage={usage}
                  kind="evaluation"
                  onRefresh={loadUsage}
                />
                {attempts.length > 0 && (
                  <section>
                    <label>
                      Tentativa
                      <select
                        value={selectedAttempt}
                        onChange={(e) => setSelectedAttempt(e.target.value)}
                      >
                        {attempts.map((a) => (
                          <option key={a.id} value={a.id}>
                            Tentativa {a.number} · {a.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    {attemptCursor && (
                      <button
                        disabled={historyBusy}
                        onClick={async () => {
                          setHistoryBusy(true);
                          try {
                            await loadAttempts(attemptCursor);
                          } catch (e) {
                            setError(errorMessage(e));
                          } finally {
                            setHistoryBusy(false);
                          }
                        }}
                      >
                        Carregar tentativas anteriores
                      </button>
                    )}
                  </section>
                )}
                {attemptDetail && (
                  <Feedback
                    progress={status?.latestAttempt?.id===attemptDetail.id?status.latestAttempt.progress:attemptDetail.progress}
                    attempts={[attemptDetail]}
                    draft={draft}
                    onDraft={change}
                    instructor={instructor}
                    onRefresh={() => {
                      void refresh();
                      void loadDetail(selectedAttempt).catch((e) =>
                        setError(errorMessage(e)),
                      );
                    }}
                  />
                )}{" "}
              </>
            ) : tab === "Folha de rosto" ? (
              <section className="tab-content">
                <h2>Folha de rosto</h2>
                <h3>Motivo da procura</h3>
                <p>{p.chiefComplaint}</p>
                <h3>História conhecida</h3>
                <p>{p.history}</p>
                <h3>Alergias</h3>
                <p>{p.allergies}</p>
                <h3>Medicamentos em uso</h3>
                <p>{p.medications}</p>
                <button onClick={() => setTab("Escuta inicial")}>
                  Registrar escuta inicial
                </button>
              </section>
            ) : tab === "Cadastro do cidadão" ? (
              <section className="tab-content">
                <h2>Cadastro do cidadão</h2>
                <p className="muted">
                  Identificação fictícia fornecida pelo caso de treinamento.
                </p>
                <dl className="identity">
                  <dt>Nome completo</dt>
                  <dd>{p.name}</dd>
                  <dt>Idade</dt>
                  <dd>{p.age}</dd>
                  <dt>Sexo</dt>
                  <dd>{p.sex}</dd>
                  <dt>Data de nascimento</dt>
                  <dd>{p.birthDate}</dd>
                  <dt>Nome da mãe</dt>
                  <dd>{p.mother}</dd>
                </dl>
              </section>
            ) : (
              <section className="empty">
                <h2>Nenhum agendamento neste caso</h2>
                <p>
                  Esta simulação representa uma demanda espontânea. Registre o
                  encaminhamento no desfecho da escuta.
                </p>
                <button onClick={() => setTab("Escuta inicial")}>
                  Voltar à escuta
                </button>
              </section>
            )}
          </div>
          {side && (
            <aside className="patient-panel">
              <div className="panel-tabs">
                {["Ficha do cidadão", "Conversa"].map((t) => (
                  <button
                    key={t}
                    className={sideTab === t ? "selected" : ""}
                    onClick={() => setSideTab(t)}
                  >
                    {t === "Conversa" ? (
                      <MessageCircle size={16} />
                    ) : (
                      <ClipboardList size={16} />
                    )}{" "}
                    {t}
                  </button>
                ))}
              </div>
              {sideTab === "Ficha do cidadão" ? (
                <div className="patient-facts">
                  <div className="section-title">
                    <h3>Informações do caso</h3>
                    <span className="badge">v{simulation.case.version}</span>
                  </div>
                  <p className="muted small">{simulation.case.title}</p>
                  <h4>Queixa principal</h4>
                  <p>{p.chiefComplaint}</p>
                  <h4>Sinais vitais e medidas</h4>
                  <dl className="vitals">
                    {p.vitals.map((v, i) => (
                      <div key={i}>
                        <dt>{v.label}</dt>
                        <dd>{v.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <details open>
                    <summary>Antecedentes e informações</summary>
                    <h4>História</h4>
                    <p>{p.history}</p>
                    <h4>Alergias</h4>
                    <p>{p.allergies}</p>
                    <h4>Medicamentos</h4>
                    <p>{p.medications}</p>
                  </details>
                  <details>
                    <summary>Procedimentos no cenário</summary>
                    {p.performedProcedures.length ? (
                      <ul>
                        {p.performedProcedures.map((v) => (
                          <li key={v}>{v}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>Nenhum procedimento informado.</p>
                    )}
                  </details>
                  <button
                    className="panel-chat-button"
                    onClick={() => setSideTab("Conversa")}
                  >
                    <MessageCircle size={17} /> Conversar com o paciente
                  </button>
                </div>
              ) : (
                <div className="chat">
                  <p className="chat-help">
                    Pergunte ao paciente sobre sua queixa. As respostas se
                    limitam às informações deste caso.
                  </p>
                  <UsageNotice
                    usage={usage}
                    kind="chat"
                    onRefresh={loadUsage}
                  />
                  <div className="messages" aria-live="polite">
                    {messageCursor && (
                      <button
                        disabled={historyBusy}
                        onClick={async () => {
                          setHistoryBusy(true);
                          try {
                            await loadMessages(messageCursor);
                          } catch (e) {
                            setError(errorMessage(e));
                          } finally {
                            setHistoryBusy(false);
                          }
                        }}
                      >
                        Mensagens anteriores
                      </button>
                    )}
                    {!simulation.messages.length && (
                      <div className="chat-empty">
                        <MessageCircle size={28} />
                        <p>Comece com uma pergunta aberta.</p>
                        <small>“O que trouxe você à unidade hoje?”</small>
                      </div>
                    )}
                    {simulation.messages.map((m) => (
                      <div className={"message " + m.role} key={m.id}>
                        <strong>
                          {m.role === "user" ? "Você" : p.name.split(" ")[0]}
                        </strong>
                        <p>{m.content}</p>
                      </div>
                    ))}
                    {(sending || pendingChat) && (
                      <p role="status" className="muted">
                        {status?.worker.healthy
                          ? "Aguardando resposta do paciente…"
                          : "Pergunta na fila, aguardando o serviço de respostas."}
                      </p>
                    )}
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!message.trim()) return;
                      setSending(true);
                      setError("");
                      try {
                        if (saveTimer.current) clearTimeout(saveTimer.current);
                        await flush();
                        if (!chatKey.current)
                          chatKey.current = crypto.randomUUID();
                        const accepted = await post<{
                          conversationRevision: number;
                        }>("/api/simulations/" + id + "/messages", {
                          content: message,
                          revision: revision.current,
                          conversationRevision: conversationRevision.current,
                          idempotencyKey: chatKey.current,
                        });
                        conversationRevision.current =
                          accepted.conversationRevision;
                        chatKey.current = null;
                        submitKey.current = null;
                        await loadMessages();
                        await refresh();
                        await loadUsage();
                        setMessage("");
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor="patient-question">
                      Pergunta ao paciente
                    </label>
                    <textarea
                      id="patient-question"
                      value={message}
                      disabled={disabled || sending || !!pendingChat}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        chatKey.current = null;
                      }}
                      placeholder={
                        instructor
                          ? "Conversa do aluno · somente leitura"
                          : "Escreva sua pergunta…"
                      }
                    />
                    <button
                      className="primary"
                      disabled={
                        disabled ||
                        sending ||
                        !!pendingChat ||
                        (usage
                          ? !usage.shared.chat || usage.chat.remaining <= 0
                          : false) ||
                        !message.trim()
                      }
                    >
                      <Send size={16} /> Enviar
                    </button>
                  </form>
                </div>
              )}
            </aside>
          )}
        </div>
      </main>
    </Shell>
  );
}

function UsageNotice({
  usage,
  kind,
  onRefresh,
}: {
  usage: UsageView | null;
  kind: "chat" | "evaluation";
  onRefresh: () => void;
}) {
  if (!usage) return null;
  const quota = usage[kind];
  return (
    <p className="muted small" role="status">
      {kind === "chat" ? "Conversas" : "Avaliações"}: {quota.remaining}{" "}
      disponíveis · {quota.used} usadas · {quota.reserved} em processamento.
      Renova em{" "}
      {new Date(quota.resetsAt).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}{" "}
      (São Paulo).
      {!usage.shared[kind] &&
        " Limite compartilhado indisponível no momento."}
      <button type="button" onClick={onRefresh}>
        Atualizar limites
      </button>
    </p>
  );
}
