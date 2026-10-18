# Acolhe+

Plataforma de **simulação educacional** de acolhimento para técnicos de enfermagem, com interface inspirada nas referências do PEC. Não é uma instalação oficial do PEC e não recebe prontuários reais.

## Executar localmente

Requisitos: Node.js 22.12+ (verificado nesta máquina com Node 24) e npm.

```powershell
npm install
npm run db:local
npm run db:seed
npm run dev
```

Abra **http://localhost:3000**. Use exatamente esse endereço; o servidor valida a origem das requisições.

O primeiro `db:local` cria `.env` com uma chave de sessão aleatória, banco SQLite em `prisma/dev.db` e modo demonstrativo explícito. Não sobrescreve uma configuração existente e não acessa bancos remotos.

Contas locais criadas pelo seed:

| Perfil | E-mail | Senha inicial local |
|---|---|---|
| Aluno | `aluno@acolhe.local` | `Acolhe+2026!` |
| Instrutor | `instrutor@acolhe.local` | `Acolhe+2026!` |

Essas senhas são exclusivamente para a demonstração local. Se `DEMO_PASSWORD` tiver sido alterada **antes do primeiro seed**, utilize o valor configurado. Reexecutar o seed não redefine senhas existentes. O seed é bloqueado em produção.

## O que está implementado

- Login com sessão criptografada, cookies HTTP-only, limite de tentativas e autorização por aluno/turma.
- Fila de atendimentos, busca, filtros, ordenação, seleção de casos e chamada simulada.
- Identificação fictícia, abas de apoio, CIAP-2, editor formatado, SIGTAP, risco, desfecho e encaminhamento.
- Ficha do caso, conversa com paciente limitado aos fatos e salvamento automático com detecção de conflito.
- Tentativas imutáveis, processamento persistente, devolutiva com destaques, sugestões e nova tentativa.
- Gestão de turmas, alunos, versões de casos, revisão e publicação; comentários do instrutor e acompanhamento.
- Três casos demonstrativos (gestante, pessoa com hipertensão e pessoa idosa), identificados como pendentes de revisão clínica.

Na demonstração, regras locais produzem sugestões de linguagem identificadas como demonstrativas. **Nenhum resultado é apresentado como análise de IA real quando o provedor não está configurado.** Os códigos, a classificação e o desfecho só são comparados à rubrica quando a versão do caso foi revisada. Isso não equivale a validação clínica externa dos casos.

## Configurar IA real

Configure no servidor:

```dotenv
AI_MODE="live"
AI_BASE_URL="https://seu-provedor.example/v1"
AI_API_KEY="sua-chave"
AI_MODEL="modelo-disponivel-no-seu-provedor"
ALLOW_DEMO_CASES="false"
```

O adaptador usa uma API compatível com Chat Completions e JSON. Nenhuma chave vai para o navegador. O paciente seleciona fatos do caso: texto clínico inventado pelo modelo não é repassado. A revisão de linguagem recebe texto e fatos; classificações e códigos são avaliados por regras da rubrica revisada, não pelo modelo.

Falhas do provedor mantêm a tentativa salva; após as tentativas automáticas, o aluno pode solicitar outra análise. Não há troca silenciosa para respostas demonstrativas.

## PostgreSQL e implantação

O esquema principal `prisma/schema.prisma` e as migrations são PostgreSQL. `prisma/local.prisma` é gerado para desenvolvimento SQLite e não deve ser usado em produção.

1. Provisione PostgreSQL (ou use `compose.yaml` com `POSTGRES_PASSWORD` definido).
2. Configure `DATABASE_URL`, `SESSION_SECRET` aleatória, `APP_URL` HTTPS e as variáveis de IA no ambiente do servidor.
3. Execute:

```powershell
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build
npm run start
```

4. Execute `npm run worker` em um segundo processo supervisionado. O servidor também dispara processamento após envios e consultas de tarefas pendentes; o worker mantém a recuperação mesmo sem um navegador aberto.
5. Para criar o primeiro instrutor, forneça `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12 caracteres ou mais) e opcionalmente `ADMIN_NAME` ao processo e execute `npm run admin:create`. O comando não altera contas existentes.
6. Cadastre turma/alunos, prepare os casos e publique apenas após revisão do responsável de enfermagem.

Mantenha aplicativo e worker no mesmo banco. Configure backup do PostgreSQL, HTTPS, política institucional de acesso/retenção e supervisão dos processos antes de um piloto real. Os testes locais não substituem a homologação com o banco e o provedor da implantação.

## Verificação

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes E2E exigem o banco local com seed e modo demonstrativo; criam dados de teste identificados. O Playwright inicia o servidor se a porta 3000 estiver livre. Screenshots e traces ficam em `test-results/`.

## Organização

| Diretório | Responsabilidade |
|---|---|
| `src/app` e `src/components` | Telas, editor e devolutiva |
| `src/lib/domain` | Casos, catálogos, validações e adaptador IA |
| `src/lib/server` | Sessão, autorização, API e tarefas persistentes |
| `src/lib/contracts.ts` | Interfaces compartilhadas |
| `prisma` | Esquemas, migrations e seed |
| `tests` | Testes de domínio, servidor e navegador |

Os catálogos são um **subconjunto demonstrativo**, não a tabela SIGTAP completa de uma competência atual. Fontes e versão estão em `src/lib/domain/catalogs.ts`. Novos códigos e critérios devem ser revisados antes de ampliar os casos.

## Limites desta entrega

- IA real depende das credenciais e do modelo do provedor; o modo local permite testar a experiência sem custos de API.
- O piloto com usuários reais depende da aprovação dos casos/protocolos por responsável de enfermagem.
- Não inclui voz, avatares, rankings ou integração com PEC/prontuários.
- SQLite serve ao desenvolvimento; a implantação PostgreSQL deve ser homologada no ambiente de destino.
