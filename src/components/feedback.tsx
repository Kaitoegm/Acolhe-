'use client';
import { useState } from 'react';
import type { AttemptView, Draft, FeedbackItem } from '@/lib/contracts';
import { post, errorMessage } from '@/lib/client';
import { ErrorBox, riskLabels } from './shell';
import { CheckCircle2, AlertCircle, MessageSquare, RotateCcw } from 'lucide-react';
const categories: Record<string, string> = { TERMINOLOGY: 'Terminologia', CLARITY: 'Clareza', ORDER: 'Organização', OMISSION: 'Completude', CIAP: 'CIAP-2', PROCEDURE: 'Procedimentos', RISK: 'Classificação de risco', OUTCOME: 'Desfecho' };
const levels: Record<string, string> = { ADEQUATE: 'Adequado', REVIEW: 'Revisar', ATTENTION: 'Atenção' };
export function Feedback({ attempts, draft, onDraft, instructor, onRefresh }: {
    attempts: AttemptView[];
    draft: Draft;
    onDraft: (d: Draft) => void;
    instructor: boolean;
    onRefresh: () => void;
}) {
    const [selection, setSelection] = useState(''), [focus, setFocus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [comment, setComment] = useState(''), [notice, setNotice] = useState('');
    const attempt = attempts.find(a => a.id === selection) || attempts[0];
    if (!attempt)
        return null;
    function focusCard(id: string) { setFocus(id); document.getElementById('feedback-' + id)?.focus({ preventScroll: true }); document.getElementById('feedback-' + id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); }
    function apply(item: FeedbackItem) { if (!item.original || typeof item.start !== 'number' || typeof item.end !== 'number' || attempt.snapshot.text.slice(item.start, item.end) !== item.original || draft.text !== attempt.snapshot.text) {
        setError('O registro foi alterado. Compare a sugestão e revise o texto manualmente para preservar suas mudanças.');
        return;
    } const text = draft.text.slice(0, item.start) + item.suggestion + draft.text.slice(item.end); if (text.length > 4000) {
        setError('A sugestão excede o limite de 4.000 caracteres.');
        return;
    } onDraft({ ...draft, text, document: null }); setNotice('Sugestão aplicada ao rascunho. A tentativa original foi preservada.'); }
    const highlights = (attempt.feedback?.items || []).filter(i => i.field === 'text' && typeof i.start === 'number' && typeof i.end === 'number' && i.end > i.start && attempt.snapshot.text.slice(i.start, i.end) === i.original).sort((a, b) => a.start! - b.start!);
    let cursor = 0;
    const parts: React.ReactNode[] = [];
    for (const item of highlights) {
        if (item.start! < cursor)
            continue;
        parts.push(attempt.snapshot.text.slice(cursor, item.start));
        parts.push(<button key={item.id} type="button" className={'inline-highlight ' + item.level + (focus === item.id ? ' selected' : '')} onClick={() => focusCard(item.id)} aria-label={'Ver comentário de ' + categories[item.category]}>{item.original}</button>);
        cursor = item.end!;
    }
    parts.push(attempt.snapshot.text.slice(cursor));
    return <section className="feedback-section" aria-labelledby="feedback-title"><div className="section-title"><div><h2 id="feedback-title">Devolutiva da escuta</h2><p className="muted">Revise seu raciocínio e aprimore o registro.</p></div><select aria-label="Selecionar tentativa" value={attempt.id} onChange={e => { setSelection(e.target.value); setFocus(''); }}>{attempts.map(a => <option value={a.id} key={a.id}>Tentativa {a.number} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</option>)}</select></div><ErrorBox message={error}/>{notice && <p className="success" role="status">{notice}</p>}{(attempt.status === 'RUNNING' || attempt.status === 'QUEUED') ? <div className="evaluation-pending" role="status"><span className="pulse-dot"/><strong>Analisando seu registro…</strong><p>A tentativa está salva. Você pode continuar consultando a ficha enquanto a devolutiva é preparada.</p><button onClick={onRefresh}>Atualizar situação</button></div> : attempt.status === 'FAILED' ? <div className="error"><strong>Não foi possível concluir a análise.</strong><p>{attempt.error || 'Seu registro continua salvo. Tente novamente.'}</p><button disabled={busy || instructor} onClick={async () => { setBusy(true); try {
        await post('/api/attempts/' + attempt.id + '/retry', {});
        onRefresh();
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
    } }}><RotateCcw size={16}/> Tentar novamente</button></div> : attempt.feedback ? <><div className="feedback-summary"><CheckCircle2 size={23}/><div><strong>Análise formativa disponível</strong><p>{attempt.feedback.summary}</p></div></div>{attempt.feedback.clinicalPending && <div className="training inline"><AlertCircle size={18}/><span>Validação clínica pendente. Os critérios deste caso precisam da revisão de um instrutor.</span></div>}{attempt.feedback.mode === 'demo' && <p className="muted small">Análise demonstrativa baseada em critérios locais; não representa validação clínica.</p>}<div className="feedback-layout"><div><h3>Registro enviado · tentativa {attempt.number}</h3><p className="muted small">Selecione um trecho destacado para ver o comentário.</p><div className="snapshot">{parts.length ? parts : 'Nenhuma descrição registrada.'}</div><dl className="snapshot-fields"><dt>CIAP-2</dt><dd>{attempt.snapshot.ciap || 'Não informado'}</dd><dt>Procedimentos</dt><dd>{attempt.snapshot.procedures.join(', ') || 'Nenhum'}</dd><dt>Risco</dt><dd>{riskLabels[attempt.snapshot.risk] || 'Não informado'}</dd><dt>Desfecho</dt><dd>{attempt.snapshot.outcome === 'REFER' ? 'Encaminhamento' : attempt.snapshot.outcome === 'RELEASE' ? 'Liberação' : 'Não informado'}</dd></dl></div><div className="feedback-cards">{attempt.feedback.items.map((item, index) => <article id={'feedback-' + item.id} tabIndex={-1} key={item.id} className={'feedback-card ' + item.level + (focus === item.id ? ' focused' : '')} style={{ animationDelay: index * 35 + 'ms' }} onFocus={() => setFocus(item.id)}><div className="feedback-card-top"><span className={'level ' + item.level}>{item.level === 'ADEQUATE' ? <CheckCircle2 size={15}/> : <AlertCircle size={15}/>} {levels[item.level]}</span><strong>{categories[item.category]}</strong></div>{item.original && <blockquote>“{item.original}”</blockquote>}<p>{item.explanation}</p><div className="suggestion"><strong>Sugestão</strong><p>{item.suggestion}</p></div><small>Critério: {item.criterion}</small>{!instructor && item.field === 'text' && item.original && item.level !== 'ADEQUATE' && <button className="small-button" disabled={draft.text !== attempt.snapshot.text} onClick={() => apply(item)}>Aplicar sugestão ao rascunho</button>}</article>)}</div></div></> : null}<div className="reviews"><h3><MessageSquare size={18}/> Revisão do instrutor</h3>{attempt.reviews.length ? attempt.reviews.map(r => <article key={r.id}><strong>{r.author}</strong><small>{new Date(r.createdAt).toLocaleString('pt-BR')}</small><p>{r.comment}</p></article>) : <p className="muted">Nenhum comentário do instrutor nesta tentativa.</p>}{instructor && <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
        await post('/api/attempts/' + attempt.id + '/reviews', { comment });
        setComment('');
        onRefresh();
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
    } }}><label>Comentário formativo<textarea required maxLength={4000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Acrescente orientações para a próxima escuta…"/></label><button className="primary" disabled={busy || !comment.trim()}>Publicar revisão</button></form>}</div></section>;
}

