'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, MessageCircle, Send, UserRound, ClipboardList, AlertCircle } from 'lucide-react';
import { Shell, ErrorBox, Loading, riskLabels } from '@/components/shell';
import { ClinicalEditor, CatalogSelect } from '@/components/editor';
import { Feedback } from '@/components/feedback';
import { FieldFeedback } from '@/components/field-feedback';
import { api, post, errorMessage } from '@/lib/client';
import { SERVICES, type SimulationView, type Draft, type CatalogItem, type UserView, type MessageView, type AttemptView } from '@/lib/contracts';
export default function SimulationPage() {
    const { id } = useParams<{
        id: string;
    }>();
    const [simulation, setSimulation] = useState<SimulationView | null>(null), [draft, setDraft] = useState<Draft | null>(null), [user, setUser] = useState<UserView | null>(null), [catalogs, setCatalogs] = useState<{
        ciap: CatalogItem[];
        sigtap: CatalogItem[];
    }>({ ciap: [], sigtap: [] }), [error, setError] = useState(''), [saveState, setSaveState] = useState('Salvo'), [tab, setTab] = useState('Escuta inicial'), [side, setSide] = useState(true), [sideTab, setSideTab] = useState('Ficha do cidadão'), [message, setMessage] = useState(''), [sending, setSending] = useState(false), [submitting, setSubmitting] = useState(false), [notice, setNotice] = useState('');
    const draftRef = useRef<Draft | null>(null), revision = useRef(0), generation = useRef(0), savedGeneration = useRef(0), savePromise = useRef<Promise<void> | null>(null), saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), submitKey = useRef<string | null>(null), mounted = useRef(true);
    const instructor = user?.role === 'INSTRUCTOR';
    const receiveUser = useCallback((u: UserView) => setUser(u), []);
    useEffect(() => { mounted.current = true; Promise.all([api<{
            simulation: SimulationView;
        }>('/api/simulations/' + id), api<{
            ciap: CatalogItem[];
            sigtap: CatalogItem[];
        }>('/api/catalogs')]).then(([r, c]) => { if (!mounted.current)
        return; setSimulation(r.simulation); setDraft(r.simulation.draft); draftRef.current = r.simulation.draft; revision.current = r.simulation.revision; setCatalogs(c); }).catch(e => setError(errorMessage(e))); return () => { mounted.current = false; if (saveTimer.current)
        clearTimeout(saveTimer.current); }; }, [id]);
    const flush = useCallback(async () => { if (instructor || !draftRef.current)
        return; if (savePromise.current) {
        await savePromise.current;
        if (savedGeneration.current === generation.current)
            return;
    } const run = async () => { while (savedGeneration.current < generation.current) {
        const g = generation.current;
        const current = draftRef.current;
        setSaveState('Salvando…');
        try {
            const r = await api<{
                revision: number;
            }>('/api/simulations/' + id, { method: 'PUT', body: JSON.stringify({ draft: current, revision: revision.current }) });
            revision.current = r.revision;
            savedGeneration.current = g;
            setSaveState(savedGeneration.current === generation.current ? 'Salvo' : 'Alterações pendentes');
        }
        catch (e) {
            setSaveState('Falha ao salvar');
            setError(errorMessage(e));
            throw e;
        }
    } }; savePromise.current = run(); try {
        await savePromise.current;
    }
    finally {
        savePromise.current = null;
    } }, [id, instructor]);
    function change(next: Draft) { if (instructor)
        return; draftRef.current = next; setDraft(next); generation.current++; submitKey.current = null; setSaveState('Alterações pendentes'); if (saveTimer.current)
        clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void flush().catch(() => { }), 750); }
    useEffect(() => { const before = (event: BeforeUnloadEvent) => { if (generation.current !== savedGeneration.current) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, []);
    useEffect(() => { const leave = (event: MouseEvent) => { if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || generation.current === savedGeneration.current)
        return; const anchor = (event.target as HTMLElement).closest('a'); if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download'))
        return; const destination = new URL(anchor.href, window.location.href); if (destination.origin !== window.location.origin || destination.href === window.location.href)
        return; event.preventDefault(); event.stopPropagation(); void flush().then(() => window.location.assign(destination.href)).catch(() => { }); }; document.addEventListener('click', leave, true); return () => document.removeEventListener('click', leave, true); }, [flush]);
    const refresh = useCallback(async () => { try {
        const r = await api<{
            simulation: SimulationView;
        }>('/api/simulations/' + id);
        setSimulation(previous => previous ? { ...previous, attempts: r.simulation.attempts, status: r.simulation.status } : r.simulation);
    }
    catch (e) {
        setError(errorMessage(e));
    } }, [id]);
    const pending = simulation?.attempts.some(a => a.status === 'RUNNING' || a.status === 'QUEUED');
    useEffect(() => { if (!pending)
        return; let count = 0; const timer = setInterval(() => { count++; void refresh(); if (count >= 60) {
        clearInterval(timer);
        setNotice('A análise está levando mais tempo. Sua tentativa está salva; use Atualizar situação para consultar novamente.');
    } }, 3000); return () => clearInterval(timer); }, [pending, refresh]);
    async function submit() { if (!draft || instructor)
        return; setSubmitting(true); setError(''); setNotice(''); try {
        if (saveTimer.current)
            clearTimeout(saveTimer.current);
        await flush();
        if (!submitKey.current)
            submitKey.current = crypto.randomUUID();
        const r = await post<{
            attempt: AttemptView;
        }>('/api/simulations/' + id + '/submit', { revision: revision.current, idempotencyKey: submitKey.current });
        setSimulation(s => s ? { ...s, attempts: [r.attempt, ...s.attempts.filter(a => a.id !== r.attempt.id)] } : s);
        setNotice('Registro enviado. Sua tentativa foi preservada para comparação.');
        setTimeout(() => document.getElementById('feedback-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 100);
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setSubmitting(false);
    } }
    if (!simulation || !draft)
        return <Shell onUser={receiveUser}>{error ? <main className="page"><ErrorBox message={error}/><Link href="/">Voltar à lista</Link></main> : <Loading />}</Shell>;
    const p = simulation.case.patient;
    const disabled = instructor || submitting || sending || !user;
    return <Shell onUser={receiveUser}><main className="care-page"><div className="care-top"><Link href="/"><ArrowLeft size={17}/> Lista de atendimentos</Link><span className={'save-state ' + (saveState.includes('Falha') ? 'failed' : '')} aria-live="polite">{instructor ? 'Visualização do instrutor' : <><Check size={14}/>{saveState}</>}{saveState.includes('Falha') && <button onClick={() => void flush().catch(() => { })}>Tentar salvar</button>}</span></div><section className="patient-header"><div className="avatar"><UserRound size={28}/></div><div><h1>{p.name}</h1><p>{p.age} <span>·</span> {p.sex} <span>·</span> Nascimento: {p.birthDate}</p></div><span className="service-badge">DEMANDA ESPONTÂNEA</span></section><nav className="tabs" aria-label="Seções do atendimento">{['Folha de rosto', 'Escuta inicial', 'Cadastro do cidadão', 'Agendamentos'].map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav><ErrorBox message={error}/>{notice && <div className="notice" role="status">{notice}</div>}{simulation.case.status !== 'PUBLISHED' && <div className="clinical-banner"><AlertCircle size={16}/> Caso demonstrativo em revisão. A devolutiva clínica exige validação do instrutor.</div>}<div className={'care-layout ' + (!side ? 'collapsed' : '')}><div className="care-main">{tab === 'Escuta inicial' ? <><div className="section-title"><h2>Escuta inicial</h2><button className="subtle" aria-expanded={side} onClick={() => setSide(!side)}><ClipboardList size={17}/>{side ? 'Recolher ficha' : 'Abrir ficha e conversa'}</button></div><form onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={disabled} className="clinical-fields"><CatalogSelect label="Motivo da consulta · CIAP-2 *" items={catalogs.ciap} value={draft.ciap} onSelect={ciap => change({ ...draft, ciap })} disabled={disabled}/><FieldFeedback attempts={simulation.attempts} field="ciap"/><div className="field-heading"><label>Descrição da escuta inicial *</label><span>Registre os achados e a conduta</span></div><ClinicalEditor draft={draft} disabled={disabled} onChange={(text, document) => change({ ...draftRef.current!, text, document })}/><FieldFeedback attempts={simulation.attempts} field="text"/><CatalogSelect label="Procedimentos realizados · SIGTAP" items={catalogs.sigtap} onSelect={code => { if (!draft.procedures.includes(code))
        change({ ...draft, procedures: [...draft.procedures, code] }); }} disabled={disabled}/>{draft.procedures.length > 0 && <div className="chips">{draft.procedures.map(code => <span key={code}>{code} · {catalogs.sigtap.find(i => i.code === code)?.label || 'Procedimento'}<button type="button" aria-label={'Remover procedimento ' + code} onClick={() => change({ ...draft, procedures: draft.procedures.filter(p => p !== code) })}>×</button></span>)}</div>}<FieldFeedback attempts={simulation.attempts} field="procedures"/><fieldset className="risk-field"><legend>Classificação de risco / vulnerabilidade *</legend><div className="risk-options">{Object.entries(riskLabels).map(([key, label]) => <label key={key} className={'risk-tile ' + key + (draft.risk === key ? ' chosen' : '')}><input type="radio" name="risk" required checked={draft.risk === key} onChange={() => change({ ...draft, risk: key as Draft['risk'] })}/><span className="risk-color"/><span>{label}</span></label>)}</div></fieldset><FieldFeedback attempts={simulation.attempts} field="risk"/><fieldset className="outcome-field"><legend>Desfecho da escuta inicial *</legend><div className="radio-row"><label><input type="radio" name="outcome" required checked={draft.outcome === 'RELEASE'} onChange={() => change({ ...draft, outcome: 'RELEASE', professional: '', team: '' })}/> Liberar cidadão</label><label><input type="radio" name="outcome" required checked={draft.outcome === 'REFER'} onChange={() => change({ ...draft, outcome: 'REFER' })}/> Encaminhar para atendimento</label></div>{draft.outcome === 'REFER' && <div className="referral"><div className="form-grid"><label>Profissional<input required value={draft.professional} maxLength={120} placeholder="Nome ou categoria profissional" onChange={e => change({ ...draft, professional: e.target.value })}/></label><label>Equipe<input required value={draft.team} maxLength={120} placeholder="Equipe de referência" onChange={e => change({ ...draft, team: e.target.value })}/></label></div><fieldset className="services"><legend>Tipos de serviço *</legend><div>{SERVICES.map(service => <label key={service}><input type="checkbox" checked={draft.services.includes(service)} onChange={e => change({ ...draft, services: e.target.checked ? [...draft.services, service] : draft.services.filter(s => s !== service) })}/>{service}</label>)}</div></fieldset></div>}</fieldset><FieldFeedback attempts={simulation.attempts} field="outcome"/></fieldset><div className="form-footer"><span>{instructor ? 'Registro do aluno · somente leitura' : '* Campos obrigatórios'}</span>{!instructor && <button className="primary" disabled={disabled || !!pending || !draft.ciap || !draft.text.trim() || !draft.risk || !draft.outcome || (draft.outcome === 'REFER' && !draft.services.length)}><Check size={18}/>{submitting ? 'Enviando…' : pending ? 'Aguardando devolutiva' : simulation.attempts.length ? 'Enviar nova tentativa' : 'Concluir simulação'}</button>}</div></form><Feedback attempts={simulation.attempts} draft={draft} onDraft={change} instructor={instructor} onRefresh={() => void refresh()}/></> : tab === 'Folha de rosto' ? <section className="tab-content"><h2>Folha de rosto</h2><h3>Motivo da procura</h3><p>{p.chiefComplaint}</p><h3>História conhecida</h3><p>{p.history}</p><h3>Alergias</h3><p>{p.allergies}</p><h3>Medicamentos em uso</h3><p>{p.medications}</p><button onClick={() => setTab('Escuta inicial')}>Registrar escuta inicial</button></section> : tab === 'Cadastro do cidadão' ? <section className="tab-content"><h2>Cadastro do cidadão</h2><p className="muted">Identificação fictícia fornecida pelo caso de treinamento.</p><dl className="identity"><dt>Nome completo</dt><dd>{p.name}</dd><dt>Idade</dt><dd>{p.age}</dd><dt>Sexo</dt><dd>{p.sex}</dd><dt>Data de nascimento</dt><dd>{p.birthDate}</dd><dt>Nome da mãe</dt><dd>{p.mother}</dd></dl></section> : <section className="empty"><h2>Nenhum agendamento neste caso</h2><p>Esta simulação representa uma demanda espontânea. Registre o encaminhamento no desfecho da escuta.</p><button onClick={() => setTab('Escuta inicial')}>Voltar à escuta</button></section>}</div>{side && <aside className="patient-panel"><div className="panel-tabs">{['Ficha do cidadão', 'Conversa'].map(t => <button key={t} className={sideTab === t ? 'selected' : ''} onClick={() => setSideTab(t)}>{t === 'Conversa' ? <MessageCircle size={16}/> : <ClipboardList size={16}/>} {t}</button>)}</div>{sideTab === 'Ficha do cidadão' ? <div className="patient-facts"><div className="section-title"><h3>Informações do caso</h3><span className="badge">v{simulation.case.version}</span></div><p className="muted small">{simulation.case.title}</p><h4>Queixa principal</h4><p>{p.chiefComplaint}</p><h4>Sinais vitais e medidas</h4><dl className="vitals">{p.vitals.map((v, i) => <div key={i}><dt>{v.label}</dt><dd>{v.value}</dd></div>)}</dl><details open><summary>Antecedentes e informações</summary><h4>História</h4><p>{p.history}</p><h4>Alergias</h4><p>{p.allergies}</p><h4>Medicamentos</h4><p>{p.medications}</p></details><details><summary>Procedimentos no cenário</summary>{p.performedProcedures.length ? <ul>{p.performedProcedures.map(v => <li key={v}>{v}</li>)}</ul> : <p>Nenhum procedimento informado.</p>}</details><button className="panel-chat-button" onClick={() => setSideTab('Conversa')}><MessageCircle size={17}/> Conversar com o paciente</button></div> : <div className="chat"><p className="chat-help">Pergunte ao paciente sobre sua queixa. As respostas se limitam às informações deste caso.</p><div className="messages" aria-live="polite">{!simulation.messages.length && <div className="chat-empty"><MessageCircle size={28}/><p>Comece com uma pergunta aberta.</p><small>“O que trouxe você à unidade hoje?”</small></div>}{simulation.messages.map(m => <div className={'message ' + m.role} key={m.id}><strong>{m.role === 'user' ? 'Você' : p.name.split(' ')[0]}</strong><p>{m.content}</p></div>)}{sending && <p role="status" className="muted">Paciente respondendo…</p>}</div><form onSubmit={async (e) => { e.preventDefault(); if (!message.trim())
        return; setSending(true); setError(''); try {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await flush();
        const r = await post<{
            messages: MessageView[]; revision: number;
        }>('/api/simulations/' + id + '/messages', { content: message });
        revision.current = r.revision;
        submitKey.current = null;
        setSimulation(s => s ? { ...s, messages: r.messages } : s);
        setMessage('');
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setSending(false);
    } }}><label className="sr-only" htmlFor="patient-question">Pergunta ao paciente</label><textarea id="patient-question" value={message} disabled={disabled || sending} maxLength={2000} rows={3} onChange={e => setMessage(e.target.value)} placeholder={instructor ? 'Conversa do aluno · somente leitura' : 'Escreva sua pergunta…'}/><button className="primary" disabled={disabled || sending || !message.trim()}><Send size={16}/> Enviar</button></form></div>}</aside>}</div></main></Shell>;
}



