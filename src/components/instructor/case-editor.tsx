"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, ErrorBox } from "@/components/shell";
import { CaseFields } from "@/components/case-fields";
import { api, post, ApiError, errorMessage } from "@/lib/client";
import type {
  CasePrivate,
  PatientFacts,
  Rubric,
  UserView,
  Page,
} from "@/lib/contracts";
import {
  publicationIssues,
  type PublicationIssue,
} from "@/lib/evaluation/publication";
import { invalidateInstructorCache } from "./cache";
import { isCaseFormShape } from "@/lib/instructor-form";
const patientTemplate: PatientFacts = {
  name: "",
  age: "",
  sex: "",
  birthDate: "",
  mother: "Não informado",
  chiefComplaint: "",
  history: "",
  allergies: "Não informado",
  medications: "Não informado",
  vitals: [],
  facts: [],
  performedProcedures: [],
};
const rubricTemplate: Rubric = {
  requiredTopics: [],
  acceptedCiap: [],
  expectedProcedures: [],
  acceptedRisks: [],
  acceptedOutcomes: [],
  rationale: "",
  references: [],
};
const steps = [
  "Paciente e história",
  "Conversa",
  "O que avaliar",
  "Conferir e disponibilizar",
];
type Group = { id: string; name: string; studentCount: number };
export function CaseEditor({ caseId }: { caseId: string }) {
  const router = useRouter(),
    heading = useRef<HTMLHeadingElement>(null);
  const [user, setUser] = useState<UserView | null>(null),
    [id, setId] = useState(caseId),
    [version, setVersion] = useState(0),
    [step, setStep] = useState(0),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [patient, setPatient] = useState(JSON.stringify(patientTemplate)),
    [rubric, setRubric] = useState(JSON.stringify(rubricTemplate)),
    [baseline, setBaseline] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [groups, setGroups] = useState<Group[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false),
    [serverIssues, setServerIssues] = useState<PublicationIssue[]>([]),
    [history, setHistory] = useState<
      { version: number; status: string; reviewedAt: string | null }[]
    >([]),
    [historyCursor, setHistoryCursor] = useState<string | null | undefined>(
      undefined,
    );
  const onUser = useCallback((u: UserView) => setUser(u), []);
  const snapshot = JSON.stringify([title, description, patient, rubric]);
  const dirty = ready && snapshot !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (user?.role !== "INSTRUCTOR") return;
    let active = true;
    (async () => {
      try {
        if (caseId !== "novo") {
          const { case: c } = await api<{ case: CasePrivate }>(
            "/api/instructor/cases/" + caseId,
          );
          if (!active) return;
          setId(c.id);
          setTitle(c.title);
          setDescription(c.description);
          setPatient(JSON.stringify(c.patient));
          setRubric(JSON.stringify(c.rubric));
          setBaseline(
            JSON.stringify([
              c.title,
              c.description,
              JSON.stringify(c.patient),
              JSON.stringify(c.rubric),
            ]),
          );
          setVersion(c.version);
          setSelected(c.classIds || []);
          try {
            const draft = JSON.parse(
              sessionStorage.getItem(
                "acolhe-case-draft-" + user.id + "-" + caseId,
              ) || "null",
            );
            if (
              draft &&
              isCaseFormShape(
                JSON.parse(draft.patient),
                JSON.parse(draft.rubric),
              )
            ) {
              setTitle(draft.title);
              setDescription(draft.description);
              setPatient(draft.patient);
              setRubric(draft.rubric);
              setVersion(draft.version);
              setNotice(
                draft.version === c.version
                  ? "Rascunho recuperado neste navegador. Revise e salve para registrar as alterações."
                  : "Rascunho recuperado de uma versão anterior. O caso mudou em outra janela; salve uma cópia dos seus ajustes antes de recarregar.",
              );
            }
          } catch {}
        } else {
          setBaseline(
            JSON.stringify([
              "",
              "",
              JSON.stringify(patientTemplate),
              JSON.stringify(rubricTemplate),
            ]),
          );
          try {
            const draft = JSON.parse(
              sessionStorage.getItem(
                "acolhe-case-draft-" + user.id + "-novo",
              ) || "null",
            );
            if (
              draft &&
              isCaseFormShape(
                JSON.parse(draft.patient),
                JSON.parse(draft.rubric),
              )
            ) {
              setTitle(draft.title);
              setDescription(draft.description);
              setPatient(draft.patient);
              setRubric(draft.rubric);
              setNotice(
                "Rascunho recuperado neste navegador. Revise e salve para registrar as alterações.",
              );
            }
          } catch {}
        }
        setReady(true);
        const page = await api<Page<Group>>("/api/instructor/classes");
        if (active) {
          setGroups(page.items);
          setCursor(page.nextCursor);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [caseId, user?.role]);
  useEffect(() => {
    if (!ready || !user) return;
    try {
      const key = "acolhe-case-draft-" + user.id + "-" + caseId;
      if (dirty)
        sessionStorage.setItem(
          key,
          JSON.stringify({ title, description, patient, rubric, version }),
        );
      else sessionStorage.removeItem(key);
    } catch {
      setError(
        "Não foi possível guardar a recuperação neste navegador. Salve o rascunho antes de sair.",
      );
    }
  }, [ready, user, caseId, dirty, snapshot, version]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const leave = (e: MouseEvent) => {
      if (!dirtyRef.current || e.ctrlKey || e.metaKey) return;
      const target = (e.target as Element)?.closest(
        'a,button[aria-label="Sair"]',
      );
      if (!target || target.getAttribute("target") === "_blank") return;
      if (
        !window.confirm(
          "Há alterações não salvas. Sair desta página? O rascunho poderá ser recuperado neste navegador.",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", leave, true);
    };
  }, []);
  useEffect(() => {
    setReviewed(false);
    setServerIssues([]);
  }, [snapshot, selected]);
  let p: PatientFacts | null = null,
    r: Rubric | null = null;
  try {
    p = JSON.parse(patient);
    r = JSON.parse(rubric);
  } catch {}
  if (!isCaseFormShape(p, r)) {
    p = null;
    r = null;
  }
  const issues =
    p && r
      ? publicationIssues(p, r)
      : [
          {
            code: "JSON",
            target: "advanced",
            message: "Confira o formato dos dados nas configurações avançadas.",
          },
        ];
  const allIssues = [
    ...issues,
    ...serverIssues.filter(
      (s) => !issues.some((i) => i.code === s.code && i.target === s.target),
    ),
  ];
  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function focusIssue(issue: PublicationIssue) {
    go(issue.target === "patient" ? 0 : 2);
    requestAnimationFrame(() => {
      const el = document.getElementById(issue.target);
      if (!el) return;
      el.closest("details")?.setAttribute("open", "");
      if (el.tagName === "DETAILS") el.setAttribute("open", "");
      el.scrollIntoView({ block: "center" });
      const field = el.matches("input,textarea,select")
        ? el
        : el.querySelector("input,select,textarea,summary");
      (field as HTMLElement | null)?.focus();
    });
  }
  async function save() {
    setError("");
    setNotice("");
    if (!p || !r) {
      setError("Confira os dados nas configurações avançadas.");
      return;
    }
    if (title.trim().length < 3 || !p.name.trim() || !p.chiefComplaint.trim()) {
      setError(
        "Para salvar, preencha um título, o nome fictício e a queixa. Os critérios podem continuar em revisão.",
      );
      go(0);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title,
        description,
        patient: p,
        rubric: r,
        ...(id !== "novo" ? { expectedVersion: version } : {}),
      };
      const saved = await api<{ id: string; version: number }>(
        "/api/instructor/cases" + (id === "novo" ? "" : "/" + id),
        {
          method: id === "novo" ? "POST" : "PUT",
          body: JSON.stringify(payload),
        },
      );
      invalidateInstructorCache();
      setId(saved.id);
      setVersion(saved.version);
      setBaseline(snapshot);
      setNotice("Rascunho salvo. Você pode continuar a revisão.");
      if (id === "novo") {
        dirtyRef.current = false;
        router.replace("/instrutor/casos/" + saved.id);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (dirty || allIssues.length || !reviewed || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<{ version: number }>(
        "/api/instructor/cases/" + id + "/publish",
        {
          classIds: selected,
          reviewed: true,
          expectedVersion: version,
        },
      );
      invalidateInstructorCache();
      setVersion(result.version);
      setReviewed(false);
      setNotice("Caso aprovado e disponibilizado para as turmas selecionadas.");
      setHistory([]);
      setHistoryCursor(undefined);
    } catch (e) {
      if (e instanceof ApiError && e.issues) setServerIssues(e.issues);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function moreGroups() {
    try {
      const page = await api<Page<Group>>(
        "/api/instructor/classes?cursor=" + encodeURIComponent(cursor!),
      );
      setGroups((old) => [
        ...new Map([...old, ...page.items].map((g) => [g.id, g])).values(),
      ]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function loadHistory() {
    try {
      const page = await api<
        Page<{ version: number; status: string; reviewedAt: string | null }>
      >(
        "/api/instructor/cases/" +
          id +
          "/versions" +
          (historyCursor ? "?cursor=" + encodeURIComponent(historyCursor) : ""),
      );
      setHistory((old) => [...old, ...page.items]);
      setHistoryCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Shell onUser={onUser}>
      <main className="page instructor-page instructor-editor">
        <Link href="/instrutor">← Voltar aos casos</Link>
        <div className="page-heading">
          <div>
            <h1>
              {caseId === "novo" ? "Criar caso" : title || "Revisar caso"}
            </h1>
            <p className="muted">
              {version ? `Versão ${version} · ` : ""}Revise uma etapa por vez.
              Salvar rascunho mantém o caso em preparação.
            </p>
          </div>
        </div>
        <ErrorBox message={error} />
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {user?.role === "STUDENT" ? (
          <p>Esta área é reservada aos instrutores.</p>
        ) : !ready ? (
          <p role="status">Carregando caso…</p>
        ) : (
          <>
            <nav className="editor-steps" aria-label="Etapas da revisão">
              {steps.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => go(i)}
                >
                  <span>{i + 1}</span>
                  {s}
                </button>
              ))}
            </nav>
            <section className="editor-content">
              <h2 ref={heading} tabIndex={-1}>
                {steps[step]}
              </h2>
              {step === 0 && (
                <>
                  <label>
                    Título do caso
                    <input
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Descrição para o aluno
                    <textarea
                      value={description}
                      maxLength={3000}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                </>
              )}
              {step < 3 && p && r && (
                <CaseFields
                  patient={patient}
                  rubric={rubric}
                  onPatient={setPatient}
                  onRubric={setRubric}
                  section={
                    (["patient", "conversation", "criteria"] as const)[step]
                  }
                />
              )}
              {step === 3 && (
                <>
                  <div className="case-review-summary">
                    <h3>Resumo do caso</h3>
                    <dl>
                      <dt>Paciente</dt>
                      <dd>
                        {p?.name} · {p?.age}
                      </dd>
                      <dt>Queixa</dt>
                      <dd>{p?.chiefComplaint}</dd>
                      <dt>Entrevista</dt>
                      <dd>{p?.facts.length || 0} respostas preparadas</dd>
                      <dt>Avaliação</dt>
                      <dd>
                        {r?.evaluation?.criteria.length ??
                          r?.requiredTopics.length ??
                          0}{" "}
                        itens preparados
                      </dd>
                    </dl>
                  </div>
                  <section className="publication-checklist" aria-live="polite">
                    <h3>
                      {allIssues.length
                        ? `${allIssues.length} pendência(s) para revisar`
                        : "Conteúdo pronto para sua aprovação"}
                    </h3>
                    {allIssues.length ? (
                      <ul>
                        {allIssues.map((issue, i) => (
                          <li key={issue.code + issue.target + i}>
                            <span>{issue.message}</span>
                            <button
                              type="button"
                              onClick={() => focusIssue(issue)}
                            >
                              Revisar
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Confira o resumo, escolha as turmas e confirme sua
                        aprovação.
                      </p>
                    )}
                    {dirty && (
                      <p>
                        Salve o rascunho para aprovar a versão que está vendo.
                      </p>
                    )}
                  </section>
                  <fieldset className="class-selection">
                    <legend>
                      Para quais turmas este caso ficará disponível?
                    </legend>
                    {!groups.length && (
                      <p>
                        Crie uma turma em Turmas e alunos para disponibilizar
                        este caso.
                      </p>
                    )}
                    {groups.map((g) => (
                      <label key={g.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selected.includes(g.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, g.id]
                                : selected.filter((v) => v !== g.id),
                            )
                          }
                        />
                        {g.name}
                      </label>
                    ))}
                    {selected
                      .filter((v) => !groups.some((g) => g.id === v))
                      .map((v) => (
                        <p key={v}>
                          Turma já selecionada, ainda não carregada.{" "}
                          <button
                            type="button"
                            onClick={() =>
                              setSelected(selected.filter((x) => x !== v))
                            }
                          >
                            Retirar da seleção
                          </button>
                        </p>
                      ))}
                    {cursor && (
                      <button type="button" onClick={moreGroups}>
                        Carregar mais turmas
                      </button>
                    )}
                  </fieldset>
                  <label className="checkbox-label review-confirmation">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    Revisei os fatos, as respostas esperadas e as referências.
                    Aprovo o uso formativo desta versão nas turmas selecionadas.
                  </label>
                  <button
                    className="primary"
                    type="button"
                    disabled={
                      busy ||
                      dirty ||
                      !!allIssues.length ||
                      !reviewed ||
                      !selected.length ||
                      id === "novo"
                    }
                    onClick={publish}
                  >
                    Aprovar e disponibilizar
                  </button>
                  {id !== "novo" && (
                    <details
                      className="advanced-case"
                      onToggle={(e) => {
                        if (e.currentTarget.open && historyCursor === undefined)
                          void loadHistory();
                      }}
                    >
                      <summary>Histórico de versões</summary>
                      {history.map((v) => (
                        <p key={v.version}>
                          Versão {v.version} ·{" "}
                          {v.status === "PUBLISHED"
                            ? "Publicada"
                            : "Em revisão"}
                          {v.reviewedAt
                            ? " · aprovada em " +
                              new Date(v.reviewedAt).toLocaleDateString("pt-BR")
                            : ""}
                        </p>
                      ))}
                      {historyCursor && (
                        <button type="button" onClick={loadHistory}>
                          Carregar versões anteriores
                        </button>
                      )}
                    </details>
                  )}
                </>
              )}
              <details className="advanced-case" id="advanced">
                <summary>Configurações avançadas dos dados</summary>
                <p>
                  Use para ajustes específicos. As alterações também aparecem
                  nos campos das etapas.
                </p>
                <label>
                  Paciente (JSON)
                  <textarea
                    aria-label="Paciente (JSON)"
                    rows={12}
                    value={patient}
                    onChange={(e) => setPatient(e.target.value)}
                  />
                </label>
                <label>
                  Critérios (JSON)
                  <textarea
                    aria-label="Critérios (JSON)"
                    rows={12}
                    value={rubric}
                    onChange={(e) => setRubric(e.target.value)}
                  />
                </label>
              </details>
            </section>
            <footer className="editor-footer">
              <span role="status">
                {dirty
                  ? "Alterações não salvas"
                  : "Rascunho sem alterações pendentes"}
              </span>
              <div className="button-row">
                {step > 0 && (
                  <button type="button" onClick={() => go(step - 1)}>
                    Anterior
                  </button>
                )}
                <button type="button" disabled={busy} onClick={save}>
                  {busy ? "Aguarde…" : "Salvar rascunho"}
                </button>
                {step < 3 && (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => go(step + 1)}
                  >
                    Continuar
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </main>
    </Shell>
  );
}
