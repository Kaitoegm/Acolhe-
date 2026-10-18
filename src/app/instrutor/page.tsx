'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Users, BookOpen, ClipboardList, CheckCircle2 } from 'lucide-react';
import { Shell, ErrorBox, statusLabels } from '@/components/shell';
import { CaseFields } from '@/components/case-fields';
import { Evolution } from '@/components/evolution';
import { api, post, errorMessage } from '@/lib/client';
import type { CasePrivate, PatientFacts, Rubric, QueueItem, UserView } from '@/lib/contracts';
type Dashboard = {
    classes: {
        id: string;
        name: string;
        studentCount: number;
    }[];
    students: {
        id: string;
        name: string;
        email: string;
        classIds: string[];
    }[];
    cases: CasePrivate[];
    simulations: (QueueItem & {
        studentName: string;
        studentId: string;
        className: string;
    })[];
};
const patientTemplate: PatientFacts = { name: '', age: '', sex: '', birthDate: '', mother: '', chiefComplaint: '', history: '', allergies: 'Não informado', medications: 'Não informado', vitals: [], facts: [], performedProcedures: [] };
const rubricTemplate: Rubric = { requiredTopics: [], acceptedCiap: [], expectedProcedures: [], acceptedRisks: [], acceptedOutcomes: [], rationale: '', references: [] };
export default function Instructor() {
    const [data, setData] = useState<Dashboard | null>(null), [tab, setTab] = useState('Acompanhamento'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [user, setUser] = useState<UserView | null>(null), [className, setClassName] = useState(''), [student, setStudent] = useState({ name: '', email: '', password: '', classId: '' }), [editing, setEditing] = useState<string | null>(null), [showCase, setShowCase] = useState(false), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [patient, setPatient] = useState(JSON.stringify(patientTemplate, null, 2)), [rubric, setRubric] = useState(JSON.stringify(rubricTemplate, null, 2)), [publishId, setPublishId] = useState(''), [classIds, setClassIds] = useState<string[]>([]), [reviewed, setReviewed] = useState(false), [filter, setFilter] = useState('');
    const onUser = useCallback((u: UserView) => setUser(u), []);
    const refresh = useCallback(async () => { try {
        const result = await api<Dashboard>('/api/instructor');
        setData(result);
    }
    catch (e) {
        setError(errorMessage(e));
    } }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    async function action(fn: () => Promise<unknown>, success: string) { setBusy(true); setError(''); setNotice(''); try {
        await fn();
        setNotice(success);
        await refresh();
        return true;
    }
    catch (e) {
        setError(errorMessage(e));
        return false;
    }
    finally {
        setBusy(false);
    } }
    function edit(c?: CasePrivate) { setEditing(c?.id || null); setTitle(c?.title || ''); setDescription(c?.description || ''); setPatient(JSON.stringify(c?.patient || patientTemplate, null, 2)); setRubric(JSON.stringify(c?.rubric || rubricTemplate, null, 2)); setShowCase(true); setPublishId(''); }
    return <Shell onUser={onUser}><main className="page instructor-page"><div className="page-heading"><div><div className="breadcrumb"><Link href="/">Atendimentos</Link><span>/</span> Instrutor</div><h1>Área do instrutor</h1><p className="muted">Acompanhe a aprendizagem e prepare os próximos casos.</p></div></div><ErrorBox message={error}/>{notice && <div className="success" role="status"><CheckCircle2 size={18}/>{notice}</div>}{user?.role === 'STUDENT' ? <p>Esta área é reservada aos instrutores. <Link href="/">Voltar aos atendimentos</Link></p> : <><nav className="tabs instructor-tabs" aria-label="Gestão">{[{ name: 'Acompanhamento', icon: <ClipboardList size={17}/> }, { name: 'Turmas e alunos', icon: <Users size={17}/> }, { name: 'Casos clínicos', icon: <BookOpen size={17}/> }].map(t => <button className={tab === t.name ? 'selected' : ''} onClick={() => setTab(t.name)} key={t.name}>{t.icon}{t.name}</button>)}</nav>{!data ? <p role="status">Carregando painel…</p> : tab === 'Acompanhamento' ? <section><div className="section-title"><h2>Atendimentos dos alunos <span className="count">{data.simulations.length}</span></h2><label className="searchbox"><input aria-label="Buscar aluno ou cidadão" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar aluno ou cidadão"/></label></div>{!data.simulations.length ? <div className="empty"><ClipboardList size={30}/><h3>A aprendizagem aparece aqui</h3><p>Quando os alunos iniciarem os casos atribuídos, você poderá acompanhar registros, tentativas e devolutivas.</p></div> : <div className="table-wrap"><table><thead><tr><th>Aluno / turma</th><th>Cidadão</th><th>Situação</th><th>Tentativas</th><th>Revisão</th></tr></thead><tbody>{data.simulations.filter(s => (s.studentName + ' ' + s.name).toLowerCase().includes(filter.toLowerCase())).map(s => <tr key={s.id}><td><strong>{s.studentName}</strong><small>{s.className || 'Sem turma'}</small></td><td>{s.name}<small>{s.age}</small></td><td>{statusLabels[s.status] || s.status}</td><td>{s.attempts}</td><td><Link href={'/acolhimento/' + s.id}>Ver atendimento →</Link></td></tr>)}</tbody></table></div>}<Evolution simulations={data.simulations}/></section> : tab === 'Turmas e alunos' ? <div className="management-grid"><section><h2>Turmas</h2><form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await action(() => post('/api/instructor/classes', { name: className }), 'Turma criada.'))
        setClassName(''); }}><label>Nome da nova turma<input required maxLength={120} placeholder="Ex.: Enfermagem · 2026/2" value={className} onChange={e => setClassName(e.target.value)}/></label><button className="primary" disabled={busy}><Plus size={17}/> Criar turma</button></form><div className="simple-list">{data.classes.length ? data.classes.map(c => <div key={c.id}><strong>{c.name}</strong><span>{c.studentCount} aluno(s)</span></div>) : <p className="muted">Crie a primeira turma para organizar os alunos.</p>}</div></section><section><h2>Cadastrar aluno</h2><form onSubmit={async (e) => { e.preventDefault(); if (await action(() => post('/api/instructor/students', student), 'Aluno cadastrado. Compartilhe as credenciais por um canal seguro.'))
        setStudent({ name: '', email: '', password: '', classId: student.classId }); }}><label>Nome completo<input required value={student.name} onChange={e => setStudent({ ...student, name: e.target.value })}/></label><label>E-mail<input type="email" required value={student.email} onChange={e => setStudent({ ...student, email: e.target.value })}/></label><label>Senha inicial<input type="password" required minLength={12} autoComplete="new-password" value={student.password} onChange={e => setStudent({ ...student, password: e.target.value })}/><small>Use pelo menos 12 caracteres.</small></label><label>Turma<select required value={student.classId} onChange={e => setStudent({ ...student, classId: e.target.value })}><option value="">Selecione a turma</option>{data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="primary" disabled={busy || !data.classes.length}>Cadastrar aluno</button></form><h3 className="space-top">Alunos cadastrados</h3><div className="simple-list">{data.students.map(s => <div key={s.id}><span><strong>{s.name}</strong><small>{s.email}</small></span><span>{s.classIds.map(id => data.classes.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'Sem turma'}</span></div>)}</div></section></div> : <section><div className="section-title"><div><h2>Casos clínicos</h2><p className="muted">Cada edição cria uma nova versão, preservando os atendimentos em andamento.</p></div><button className="primary" onClick={() => edit()}><Plus size={17}/> Novo caso</button></div>{showCase && <form className="case-editor" onSubmit={async (e) => { e.preventDefault(); let parsedPatient: PatientFacts, parsedRubric: Rubric; try {
        parsedPatient = JSON.parse(patient);
        parsedRubric = JSON.parse(rubric);
        if (!parsedPatient.name || !parsedPatient.chiefComplaint || !Array.isArray(parsedPatient.vitals) || !Array.isArray(parsedPatient.facts))
            throw new Error('Confira nome, queixa principal, sinais vitais e fatos do paciente.');
        if (!Array.isArray(parsedRubric.references) || !Array.isArray(parsedRubric.acceptedCiap) || !Array.isArray(parsedRubric.requiredTopics))
            throw new Error('Confira a estrutura dos critérios e das referências.');
    }
    catch (e) {
        setError('JSON inválido: ' + errorMessage(e));
        return;
    } const body = { title, description, patient: parsedPatient, rubric: parsedRubric }; if (await action(() => editing ? api('/api/instructor/cases/' + editing, { method: 'PUT', body: JSON.stringify(body) }) : post('/api/instructor/cases', body), editing ? 'Nova versão criada em revisão.' : 'Caso criado em revisão.'))
        setShowCase(false); }}><h3>{editing ? 'Editar caso · criar nova versão' : 'Criar caso de treinamento'}</h3><label>Título<input required value={title} maxLength={150} onChange={e => setTitle(e.target.value)}/></label><label>Descrição para o aluno<textarea required value={description} onChange={e => setDescription(e.target.value)}/></label><CaseFields patient={patient} rubric={rubric} onPatient={setPatient} onRubric={setRubric}/><details className="advanced-case"><summary>Edição avançada dos dados (JSON)</summary><div className="form-grid"><label>Paciente e fatos do cenário (JSON)<textarea className="json-editor" spellCheck={false} rows={20} required value={patient} onChange={e => setPatient(e.target.value)}/><small>vitals: objetos label/value. facts: objetos keywords (lista) e answer (texto). Só inclua informações fictícias.</small></label><label>Critérios de avaliação (JSON)<textarea className="json-editor" spellCheck={false} rows={20} required value={rubric} onChange={e => setRubric(e.target.value)}/><small>Riscos: NON_ACUTE, LOW, MEDIUM, HIGH. Desfechos: RELEASE, REFER. Inclua rationale e references antes de publicar.</small></label></div></details><div className="button-row"><button className="primary" disabled={busy}>Salvar versão em revisão</button><button type="button" onClick={() => setShowCase(false)}>Cancelar</button></div></form>}<div className="case-list">{data.cases.length ? data.cases.map(c => <article key={c.id} className="case-management"><div className="section-title"><div><h3>{c.title} <span className="version">v{c.version}</span></h3><p>{c.description}</p></div><span className={'badge ' + (c.status === 'PUBLISHED' ? 'published' : 'warning')}>{c.status === 'PUBLISHED' ? 'Publicado' : 'Em revisão'}</span></div><div className="case-meta"><span>{c.patient.name} · {c.patient.age}</span><span>{c.reviewedAt ? 'Revisado em ' + new Date(c.reviewedAt).toLocaleDateString('pt-BR') : 'Validação clínica pendente'}</span></div><div className="button-row"><button onClick={() => edit(c)}>Editar nova versão</button><button onClick={() => { setPublishId(publishId === c.id ? '' : c.id); setClassIds([]); setReviewed(false); }}>Revisar e publicar</button></div>{publishId === c.id && <form className="publish-form" onSubmit={async (e) => { e.preventDefault(); if (await action(() => post('/api/instructor/cases/' + c.id + '/publish', { classIds, reviewed: true }), 'Caso publicado para as turmas selecionadas.'))
        setPublishId(''); }}><h4>Revisão clínica e atribuição</h4><p><strong>Fundamentação:</strong> {c.rubric.rationale || 'Não informada. Edite o caso antes de publicar.'}</p><p><strong>Referências:</strong></p>{c.rubric.references.length ? <ul>{c.rubric.references.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p>Não informadas. Adicione referências antes de publicar.</p>}<details><summary>Conferir todos os critérios</summary><pre>{JSON.stringify(c.rubric, null, 2)}</pre></details><fieldset><legend>Disponibilizar para as turmas</legend>{data.classes.map(group => <label className="checkbox-label" key={group.id}><input type="checkbox" checked={classIds.includes(group.id)} onChange={e => setClassIds(e.target.checked ? [...classIds, group.id] : classIds.filter(id => id !== group.id))}/>{group.name}</label>)}</fieldset><label className="checkbox-label review-confirmation"><input type="checkbox" required checked={reviewed} onChange={e => setReviewed(e.target.checked)}/> Revisei os fatos, critérios, fundamentação e referências deste caso e aprovo seu uso formativo nas turmas selecionadas.</label><button className="primary" disabled={busy || !reviewed || !classIds.length || !c.rubric.rationale || !c.rubric.references.length}>Aprovar e publicar caso</button></form>}</article>) : <div className="empty"><h3>Nenhum caso criado</h3><p>Crie um caso, revise os critérios clínicos e publique para uma turma.</p></div>}</div></section>}</>}</main></Shell>;
}


