"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shell, ErrorBox, statusLabels } from "@/components/shell";
import { Evolution } from "@/components/evolution";
import { api, post, errorMessage } from "@/lib/client";
import type { CaseSummary, QueueItem, Page, UserView } from "@/lib/contracts";
import { instructorCache as cache } from "./cache";
type Group = { id: string; name: string; studentCount: number };
type Student = { id: string; name: string; email: string; classIds: string[] };
type Activity = QueueItem & {
  studentName: string;
  studentId: string;
  className: string;
};
function usePaged<T extends { id: string }>(
  userId: string | undefined,
  path: string,
  params: Record<string, string>,
  enabled: boolean,
) {
  const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v),
    ).toString(),
    key = (userId || "") + path + "?" + query;
  const [page, setPage] = useState<Page<T>>({
      items: [],
      nextCursor: null,
      hasMore: false,
    }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    controller = useRef<AbortController|null>(null);
  const load = useCallback(
    async (cursor?: string,restoreCount=25) => {
      controller.current?.abort();
      const current=new AbortController();controller.current=current;
      setLoading(true);
      setError("");
      try {
        let result = await api<Page<T>>(
          path +
            "?" +
            query +
            (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
          {signal:current.signal},
        );
        if(!cursor){while(result.nextCursor&&result.items.length<restoreCount){if(current.signal.aborted)return;const next=await api<Page<T>>(path+'?'+query+'&cursor='+encodeURIComponent(result.nextCursor),{signal:current.signal});result={...next,items:[...result.items,...next.items]};}}
        if (current.signal.aborted) return;
        const old=(cache.get(key) as Page<T>|undefined)||{items:[]};
          const next = {
            ...result,
            items: cursor
              ? [
                  ...new Map(
                    [...old.items, ...result.items].map((v) => [v.id, v]),
                  ).values(),
                ]
              : result.items,
          };
          cache.set(key, next);
          if (cache.size > 30) cache.delete(cache.keys().next().value!);
          setPage(next);
      } catch (e) {
        if (!current.signal.aborted) setError(errorMessage(e));
      } finally {
        if (!current.signal.aborted) setLoading(false);
      }
    },
    [path, query, key],
  );
  useEffect(() => {
    controller.current?.abort();
    setLoading(false);
    setError('');
    if (!enabled || !userId) return;
    const saved = cache.get(key);
    if (saved) {
      setPage(saved as Page<T>);
      setError("");
    }
    else setPage({ items: [], nextCursor: null, hasMore: false });
    const timer = setTimeout(() => void load(undefined,saved?.items.length||25), 200);
    return () => {
      controller.current?.abort();
      clearTimeout(timer);
    };
  }, [key, enabled, userId, load]);
  return {
    ...page,
    loading,
    error,
    reload: () => load(),
    more: () => (page.nextCursor ? load(page.nextCursor) : Promise.resolve()),
  };
}
function More({
  list,
  label,
}: {
  list: { hasMore: boolean; loading: boolean; more: () => Promise<void> };
  label: string;
}) {
  return list.hasMore ? (
    <button
      type="button"
      disabled={list.loading}
      onClick={() => void list.more()}
    >
      {list.loading ? "Carregando…" : "Carregar mais " + label}
    </button>
  ) : null;
}
export function InstructorDashboard() {
  const [user, setUser] = useState<UserView | null>(null),
    [tab, setTab] = useState("Casos clínicos"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [selectedGroup, setSelectedGroup] = useState(""),
    [showClass, setShowClass] = useState(false),
    [showStudent, setShowStudent] = useState(false),
    [className, setClassName] = useState(""),
    [student, setStudent] = useState({
      name: "",
      email: "",
      password: "",
      classId: "",
    }),
    [activityQuery, setActivityQuery] = useState(""),
    [activityStatus, setActivityStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [restored, setRestored] = useState(false);
  const onUser = useCallback((u: UserView) => setUser(u), []),
    allowed = user?.role === "INSTRUCTOR";
  useEffect(() => {
    if (!user) return;
    try {
      const s = JSON.parse(
        sessionStorage.getItem("acolhe-instructor-" + user.id) || "null",
      );
      if (s) {
        if (
          ["Casos clínicos", "Turmas e alunos", "Acompanhamento"].includes(
            s.tab,
          )
        )
          setTab(s.tab);
        setQ(s.q || "");
        setStatus(s.status || "");
        setSelectedGroup(s.group || "");
        setActivityQuery(s.activityQuery || "");
        setActivityStatus(s.activityStatus || "");
      }
    } catch {}
    setRestored(true);
  }, [user]);
  useEffect(() => {
    if (!user || !restored) return;
    sessionStorage.setItem(
      "acolhe-instructor-" + user.id,
      JSON.stringify({
        tab,
        q,
        status,
        group: selectedGroup,
        activityQuery,
        activityStatus,
      }),
    );
  }, [
    user,
    restored,
    tab,
    q,
    status,
    selectedGroup,
    activityQuery,
    activityStatus,
  ]);
  useEffect(() => {
    const invalidate = () => {
      cache.clear();
    };
    window.addEventListener("acolhe-case-saved", invalidate);
    return () => window.removeEventListener("acolhe-case-saved", invalidate);
  }, []);
  const groups = usePaged<Group>(
    user?.id,
    "/api/instructor/classes",
    {},
    !!allowed && restored && tab === "Turmas e alunos",
  );
  const students = usePaged<Student>(
    user?.id,
    "/api/instructor/students",
    { classId: selectedGroup },
    !!allowed && restored && tab === "Turmas e alunos" && !!selectedGroup,
  );
  const cases = usePaged<CaseSummary>(
    user?.id,
    "/api/instructor/cases",
    tab === "Turmas e alunos"
      ? { classId: selectedGroup }
      : { q: q.trim(), status },
    !!allowed &&
      restored &&
      (tab === "Casos clínicos" ||
        (tab === "Turmas e alunos" && !!selectedGroup)),
  );
  const activities = usePaged<Activity>(
    user?.id,
    "/api/instructor/simulations",
    { q: activityQuery.trim(), status: activityStatus },
    !!allowed && restored && tab === "Acompanhamento",
  );
  const group = groups.items.find((g) => g.id === selectedGroup);
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      cache.clear();
      setNotice(success);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function changeTab(next: string) {
    setTab(next);
    setError("");
    setNotice("");
  }
  const caseList = (
    <>
      <p className="muted small">
        {cases.items.length} caso(s) carregado(s)
        {cases.hasMore ? " · há mais resultados" : ""}
      </p>
      <div className="instructor-case-list">
        {cases.items.map((c) => (
          <article className="case-management compact-case" key={c.id}>
            <div>
              <h3>{c.title}</h3>
              <p>
                {c.patientName} · {c.age}
              </p>
              <small>
                {c.classes?.map((g) => g.name).join(" · ") ||
                  "Ainda não disponibilizado para turmas"}
              </small>
            </div>
            <span
              className={
                "case-state " + (c.status === "PUBLISHED" ? "published" : "")
              }
            >
              {c.status === "PUBLISHED" ? "Publicado" : "Em revisão"}
            </span>
            <Link className="button" href={"/instrutor/casos/" + c.id}>
              {c.status === "PUBLISHED" ? "Abrir caso" : "Revisar caso"} →
            </Link>
          </article>
        ))}
      </div>
      {!cases.loading && !cases.items.length && (
        <div className="instructor-empty">
          <h3>Nenhum caso encontrado</h3>
          <p>Ajuste os filtros ou crie um caso para começar.</p>
        </div>
      )}
      <More list={cases} label="casos" />
    </>
  );
  return (
    <Shell onUser={onUser}>
      <main className="page instructor-page">
        <div className="page-heading">
          <div>
            <h1>Área do instrutor</h1>
            <p className="muted">
              Prepare os casos, organize suas turmas e acompanhe a aprendizagem.
            </p>
          </div>
        </div>
        <ErrorBox
          message={
            error ||
            cases.error ||
            groups.error ||
            students.error ||
            activities.error
          }
        />
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        {user?.role === "STUDENT" ? (
          <p>Esta área é reservada aos instrutores.</p>
        ) : (
          <>
            <nav className="tabs instructor-tabs" aria-label="Gestão">
              {["Casos clínicos", "Turmas e alunos", "Acompanhamento"].map(
                (t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    className={tab === t ? "selected" : ""}
                    onClick={() => changeTab(t)}
                  >
                    {t}
                  </button>
                ),
              )}
            </nav>
            {tab === "Casos clínicos" ? (
              <section>
                <div className="section-title">
                  <div>
                    <h2>Casos clínicos</h2>
                    <p className="muted">
                      Escolha um caso para revisar ou continue de onde parou.
                    </p>
                  </div>
                  <Link className="button primary" href="/instrutor/casos/novo">
                    Criar caso
                  </Link>
                </div>
                <div className="instructor-toolbar">
                  <label>
                    Buscar caso
                    <input
                      type="search"
                      maxLength={150}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Título atual ou anterior"
                    />
                  </label>
                  <label>
                    Situação
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="REVIEW">Em revisão</option>
                      <option value="PUBLISHED">Publicados</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={cases.loading}
                    onClick={() => void cases.reload()}
                  >
                    Atualizar lista
                  </button>
                </div>
                {cases.loading && <p role="status">Carregando casos…</p>}
                {caseList}
              </section>
            ) : tab === "Turmas e alunos" ? (
              <section>
                <div className="section-title">
                  <div>
                    <h2>
                      {selectedGroup
                        ? group?.name || "Turma selecionada"
                        : "Suas turmas"}
                    </h2>
                    <p className="muted">
                      {selectedGroup
                        ? "Alunos e casos disponíveis para esta turma."
                        : "Abra uma turma para gerenciar alunos e consultar os casos."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowClass((v) => !v)}>
                    {showClass ? "Fechar cadastro" : "Criar turma"}
                  </button>
                </div>
                {showClass && (
                  <form
                    className="instructor-inline-panel"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await action(
                          () =>
                            post("/api/instructor/classes", {
                              name: className,
                            }),
                          "Turma criada.",
                        )
                      ) {
                        setClassName("");
                        setShowClass(false);
                        await groups.reload();
                      }
                    }}
                  >
                    <label>
                      Nome da nova turma
                      <input
                        required
                        maxLength={120}
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        placeholder="Ex.: Técnicos de enfermagem · manhã"
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Salvar turma
                    </button>
                  </form>
                )}
                {!selectedGroup ? (
                  <>
                    <div className="instructor-group-list">
                      {groups.items.map((g) => (
                        <button
                          type="button"
                          key={g.id}
                          onClick={() => {
                            setSelectedGroup(g.id);
                            setStudent((s) => ({ ...s, classId: g.id }));
                            setShowStudent(false);
                          }}
                        >
                          <span>
                            <strong>{g.name}</strong>
                            <small>{g.studentCount} aluno(s)</small>
                          </span>
                          <span>Abrir turma →</span>
                        </button>
                      ))}
                    </div>
                    {!groups.loading && !groups.items.length && (
                      <p>Crie sua primeira turma para organizar os alunos.</p>
                    )}
                    <More list={groups} label="turmas" />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroup("");
                        setShowStudent(false);
                      }}
                    >
                      ← Todas as turmas
                    </button>
                    <div className="section-title">
                      <h3>Alunos da turma</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setStudent((s) => ({ ...s, classId: selectedGroup }));
                          setShowStudent((v) => !v);
                        }}
                      >
                        {showStudent
                          ? "Fechar cadastro de aluno"
                          : "Adicionar aluno"}
                      </button>
                    </div>
                    {showStudent && (
                      <form
                        className="instructor-inline-panel"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await action(
                              () => post("/api/instructor/students", student),
                              "Aluno cadastrado. Compartilhe as credenciais por um canal seguro.",
                            )
                          ) {
                            setStudent({
                              name: "",
                              email: "",
                              password: "",
                              classId: selectedGroup,
                            });
                            setShowStudent(false);
                            await Promise.all([
                              students.reload(),
                              groups.reload(),
                            ]);
                          }
                        }}
                      >
                        <div className="form-grid">
                          <label>
                            Nome completo
                            <input
                              required
                              value={student.name}
                              onChange={(e) =>
                                setStudent({ ...student, name: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            E-mail
                            <input
                              required
                              type="email"
                              value={student.email}
                              onChange={(e) =>
                                setStudent({
                                  ...student,
                                  email: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Senha inicial
                            <input
                              required
                              type="password"
                              aria-label="Senha inicial"
                              minLength={12}
                              autoComplete="new-password"
                              value={student.password}
                              onChange={(e) =>
                                setStudent({
                                  ...student,
                                  password: e.target.value,
                                })
                              }
                            />
                            <small>Use pelo menos 12 caracteres.</small>
                          </label>
                        </div>
                        <button className="primary" disabled={busy}>
                          Cadastrar aluno
                        </button>
                      </form>
                    )}
                    {students.loading && (
                      <p role="status">Carregando alunos…</p>
                    )}
                    <div className="simple-list">
                      {students.items.map((s) => (
                        <div key={s.id}>
                          <strong>{s.name}</strong>
                          <span>{s.email}</span>
                        </div>
                      ))}
                    </div>
                    {!students.loading && !students.items.length && (
                      <p>
                        Nenhum aluno nesta turma. Use Adicionar aluno para
                        cadastrar.
                      </p>
                    )}
                    <More list={students} label="alunos" />
                    <h3 className="space-top">Casos disponibilizados</h3>
                    {caseList}
                    <p>
                      <Link href="/instrutor/casos/novo">Criar um caso</Link> ou
                      abra Casos clínicos para escolher e disponibilizar um caso
                      existente.
                    </p>
                  </>
                )}
              </section>
            ) : (
              <section>
                <div className="section-title">
                  <div>
                    <h2>Atividades dos alunos</h2>
                    <p className="muted">
                      Abra uma atividade para ver conversa, registro,
                      devolutivas e comentar.
                    </p>
                  </div>
                </div>
                <div className="instructor-toolbar">
                  <label>
                    Buscar paciente
                    <input
                      type="search"
                      maxLength={150}
                      value={activityQuery}
                      onChange={(e) => setActivityQuery(e.target.value)}
                      placeholder="Nome fictício do paciente"
                    />
                  </label>
                  <label>
                    Situação da atividade
                    <select
                      value={activityStatus}
                      onChange={(e) => setActivityStatus(e.target.value)}
                    >
                      <option value="">Todas</option>
                      {Object.entries(statusLabels)
                        .filter(([k]) =>
                          [
                            "DRAFT",
                            "QUEUED",
                            "RUNNING",
                            "COMPLETED",
                            "FAILED",
                          ].includes(k),
                        )
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    disabled={activities.loading}
                    onClick={() => void activities.reload()}
                  >
                    Atualizar atividades
                  </button>
                </div>
                {activities.loading && (
                  <p role="status">Carregando atividades…</p>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Aluno / turma</th>
                        <th>Caso</th>
                        <th>Situação</th>
                        <th>Tentativas</th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.items.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.studentName}</strong>
                            <small>{s.className}</small>
                          </td>
                          <td>{s.name}</td>
                          <td>{statusLabels[s.status] || s.status}</td>
                          <td>{s.attempts}</td>
                          <td>
                            <Link href={"/acolhimento/" + s.id}>
                              Ver atividade →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!activities.loading && !activities.items.length && (
                  <p>
                    As atividades aparecerão aqui quando os alunos iniciarem os
                    casos disponibilizados.
                  </p>
                )}
                <p className="muted small">
                  {activities.items.length} atividade(s) carregada(s).
                </p>
                <More list={activities} label="atividades" />
                <details className="instructor-evolution">
                  <summary>Consultar evolução por dimensão</summary>
                  <Evolution simulations={activities.items} />
                </details>
              </section>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
