'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeartPulse, ArrowRight, GraduationCap } from 'lucide-react';
import { post, errorMessage } from '@/lib/client';
import { ErrorBox } from '@/components/shell';
export default function Login() { const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const router = useRouter(); return <main className="login-page"><section className="login-intro"><HeartPulse size={48}/><h1>Acolhe<span>+</span></h1><h2>A escuta é o primeiro cuidado.</h2><p>Um espaço para praticar o acolhimento, desenvolver o raciocínio e aprender com cada atendimento.</p><div><GraduationCap size={21}/> Simulação de acolhimento na atenção primária</div></section><section className="login-form"><div><span className="badge">Ambiente de aprendizagem</span><h2>Boas-vindas ao Acolhe+</h2><p className="muted">Entre com a conta fornecida pelo seu instrutor.</p><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
    await post('/api/login', { email, password });
    router.push('/');
}
catch (e) {
    setError(errorMessage(e));
}
finally {
    setBusy(false);
} }}><ErrorBox message={error}/><label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu.email@instituicao.com.br"/></label><label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}<ArrowRight size={18}/></button></form>{process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO_PASSWORD && <details><summary>Contas de demonstração</summary><p>Aluno: aluno@acolhe.local<br />Instrutor: instrutor@acolhe.local<br />Senha: {process.env.NEXT_PUBLIC_DEMO_PASSWORD}</p></details>}<p className="login-disclaimer">Somente dados fictícios. Este ambiente não substitui supervisão clínica e não deve ser utilizado em atendimentos reais.</p></div></section></main>; }
