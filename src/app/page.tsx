'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, SlidersHorizontal, Megaphone, ClipboardPen, X } from 'lucide-react';
import { Shell, ErrorBox, riskLabels, statusLabels } from '@/components/shell';
import { api, post, errorMessage } from '@/lib/client';
import type { CasePublic, QueueItem } from '@/lib/contracts';
export default function QueuePage() {
    const [rows, setRows] = useState<QueueItem[]>([]), [cases, setCases] = useState<CasePublic[]>([]), [search, setSearch] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [adding, setAdding] = useState(false), [busy, setBusy] = useState(''), [toast, setToast] = useState(''), [filters, setFilters] = useState(false), [status, setStatus] = useState(''), [risk, setRisk] = useState(''), [order, setOrder] = useState('oldest');
    const router = useRouter();
    useEffect(() => { Promise.all([api<{
            simulations: QueueItem[];
        }>('/api/simulations'), api<{
            cases: CasePublic[];
        }>('/api/cases')]).then(([a, b]) => { setRows(a.simulations); setCases(b.cases); }).catch(e => setError(errorMessage(e))).finally(() => setLoading(false)); }, []);
    useEffect(() => { if (toast) {
        const t = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(t);
    } }, [toast]);
    const visible = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) && (!status || r.status === status) && (!risk || r.risk === risk)).sort((a, b) => order === 'risk' ? (['HIGH', 'MEDIUM', 'LOW', 'NON_ACUTE', ''].indexOf(a.risk) - ['HIGH', 'MEDIUM', 'LOW', 'NON_ACUTE', ''].indexOf(b.risk)) : order === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt));
    return <Shell><main className="page"><div className="page-heading"><div><div className="breadcrumb">Atendimento <span>/</span> Escuta inicial</div><h1>Lista de atendimentos</h1></div><button className="primary" onClick={() => setAdding(!adding)}><Plus size={18}/> Adicionar cidadão</button></div><ErrorBox message={error}/>{adding && <section className="case-picker"><div className="section-title"><h2>Escolha um caso para praticar</h2><button className="icon-button" aria-label="Fechar seleção" onClick={() => setAdding(false)}><X size={20}/></button></div><p className="muted">Uma nova simulação será adicionada à sua lista.</p>{cases.length === 0 ? <p>Nenhum caso disponível. Peça ao instrutor que publique um caso para sua turma.</p> : cases.map(c => <div className="case-option" key={c.id}><div><strong>{c.title}</strong><p>{c.patient.name} · {c.patient.age}</p><small>{c.description}</small>{c.status !== 'PUBLISHED' && <span className="badge warning">Critérios em revisão</span>}</div><button disabled={!!busy} onClick={async () => { setBusy(c.id); setError(''); try {
        const r = await post<{
            simulation: {
                id: string;
            };
        }>('/api/simulations', { caseId: c.id });
        router.push('/acolhimento/' + r.simulation.id);
    }
    catch (e) {
        setError(errorMessage(e));
        setBusy('');
    } }}>{busy === c.id ? 'Abrindo…' : 'Iniciar escuta'}</button></div>)}</section>}<section className="queue"><div className="filterbar"><label className="searchbox"><Search size={18}/><input aria-label="Buscar cidadão" placeholder="Buscar por nome do cidadão" value={search} onChange={e => setSearch(e.target.value)}/></label><span className="mine"><ClipboardPen size={15}/> Meus atendimentos</span><label className="sort">Ordenar por<select aria-label="Ordenar atendimentos" value={order} onChange={e => setOrder(e.target.value)}><option value="oldest">Ordem de chegada</option><option value="risk">Classificação de risco</option><option value="newest">Mais recentes</option></select></label><button className="filter-button" aria-expanded={filters} onClick={() => setFilters(!filters)}><SlidersHorizontal size={17}/> Filtros</button></div>{filters && <div className="extra-filters"><label>Situação<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todas</option>{[...new Set(rows.map(r => r.status))].map(s => <option key={s} value={s}>{statusLabels[s] || s}</option>)}</select></label><label>Risco<select value={risk} onChange={e => setRisk(e.target.value)}><option value="">Todos</option>{Object.entries(riskLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button onClick={() => { setStatus(''); setRisk(''); setSearch(''); }}>Limpar filtros</button></div>}<div className="queue-caption"><strong>{visible.length} atendimento{visible.length !== 1 ? 's' : ''}</strong><span>Lista individual de simulações</span></div><div className="queue-column-head"><span>Situação</span><span>Cidadão</span><span>Tipo de atendimento</span><span>Ações</span></div>{loading ? <div className="empty" role="status">Carregando sua lista…</div> : visible.length === 0 ? <div className="empty"><ClipboardPen size={32}/><h2>{rows.length ? 'Nenhum atendimento encontrado' : 'Sua próxima escuta começa aqui'}</h2><p>{rows.length ? 'Experimente ajustar os filtros.' : 'Adicione um cidadão para iniciar uma simulação de acolhimento.'}</p>{!rows.length && <button onClick={() => setAdding(true)}>Selecionar caso</button>}</div> : visible.map(r => <article className="queue-row" key={r.id}><div><span className={'status-dot ' + (r.attempts ? 'done' : '')}/><span>{statusLabels[r.status] || r.status}</span>{r.risk && <small className={'risk-label ' + r.risk}>{riskLabels[r.risk]}</small>}</div><div><Link className="patient-name" href={'/acolhimento/' + r.id}>{r.name}</Link><small>{r.age}</small></div><div><span className="service-badge">DEMANDA ESPONTÂNEA</span><small>{new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div><div className="row-actions"><Link className="button subtle" href={'/acolhimento/' + r.id}><ClipboardPen size={17}/> Escuta inicial</Link><button className="icon-button" title="Chamar cidadão" aria-label={'Chamar ' + r.name} onClick={() => setToast(r.name + ' chamado(a) para a escuta inicial. Esta é uma chamada simulada.')}><Megaphone size={19}/></button></div></article>)}</section><p className="queue-note">Cada atendimento é uma oportunidade de praticar. Seus registros são salvos automaticamente.</p></main>{toast && <div className="toast" role="status">{toast}</div>}</Shell>;
}
