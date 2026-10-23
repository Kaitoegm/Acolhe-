# Acolhe+

Avaliação com revisão animada: veja [o guia de uso e configuração](docs/evaluation-v2.md) e [a verificação da implementação](docs/evaluation-execution.md).

Plataforma de **simulação educacional** de acolhimento para técnicos de enfermagem, com interface inspirada nas referências do PEC. Não é uma instalação oficial do PEC e não recebe prontuários reais.

## Executar localmente

Requisitos: Node.js 22.12+ (verificado nesta máquina com Node 24) e npm.

```powershell
npm install
npm run db:local
npm run db:backfill
npm run db:seed
npm run dev
```

Em outro terminal, execute `npm run worker`. Conversas e avaliações aguardam esse processo; a aplicação web somente registra os pedidos na fila.

Abra **http://localhost:3000**. Use exatamente esse endereço; o servidor valida a origem das requisições.

O primeiro `db:local` cria `.env` com uma chave de sessão aleatória, banco SQLite em `prisma/dev.db` e modo demonstrativo explícito. Não sobrescreve uma configuração existente e não acessa bancos remotos.

Contas locais criadas pelo seed:

| Perfil | E-mail | Senha inicial local |
|---|---|---|
| Aluno | `aluno@acolhe.local` | `Acolhe+2026!` |
| Instrutor | `instrutor@acolhe.local` | `Acolhe+2026!` |

Essas senhas são exclusivamente o padrão de uma instalação local nova. Se `DEMO_PASSWORD` tiver sido alterada, utilize o valor configurado. A versão atual do seed sincroniza as senhas das duas contas demonstrativas com essa variável ao ser executada. O seed é bloqueado em produção.

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
ALLOW_DEMO_CASES="false"
```

Coloque `AI_BASE_URL`, `AI_API_KEY` e `AI_MODEL` exclusivamente em `.env.worker` (veja `.env.worker.example`) ou nas variáveis de ambiente do processo worker. A aplicação web não precisa da chave do provedor. Mantenha `AI_MODE` igual nos dois processos.

O adaptador usa uma API compatível com Chat Completions e JSON. Nenhuma chave vai para o navegador. O paciente seleciona fatos do caso: texto clínico inventado pelo modelo não é repassado. A revisão de linguagem recebe texto e fatos; classificações e códigos são avaliados por regras da rubrica revisada, não pelo modelo.

Falhas do provedor mantêm a tentativa salva; após as tentativas automáticas, o aluno pode solicitar outra análise. Não há troca silenciosa para respostas demonstrativas.

## PostgreSQL e implantação

O esquema principal `prisma/schema.prisma` e as migrations são PostgreSQL. `prisma/local.prisma` é gerado para desenvolvimento SQLite e não deve ser usado em produção.

1. Provisione PostgreSQL (ou use `compose.yaml` com `POSTGRES_PASSWORD` definido).
2. Configure `DATABASE_URL`, `SESSION_SECRET` aleatória, `APP_URL` HTTPS e limites de quota no ambiente web/worker. As credenciais do provedor ficam somente no worker.
3. Execute:

```powershell
npm ci
npm run db:generate
npx prisma migrate deploy
npm run db:backfill
npm run build
npm run start
```

4. Execute `npm run worker` em um segundo processo supervisionado. Somente o worker executa IA. As consultas de status não processam nem alteram trabalhos.
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
# Com a web rodando, carga HTTP local com fixtures isoladas e limpeza automática:
npm run test:load
```

Os testes E2E exigem o banco local atualizado com seed e modo demonstrativo; criam dados de teste identificados. O Playwright inicia a web se a porta 3000 estiver livre e inicia um worker separado. Screenshots e traces ficam em `test-results/`.

## Quotas e operação da fila

As listagens usam páginas de 25 itens (máximo 100), cursores assinados vinculados ao usuário e filtros no banco. Históricos são carregados sob demanda. Pedidos aceitos de conversa/avaliação retornam HTTP 202; falta de quota retorna 429 com horário de renovação.

Limites diários UTC: aluno 100 conversas/20 avaliações; responsável pelas turmas 3.000/300; implantação 6.000/600. O provedor tem teto independente de 10.000 chamadas/dia, incluindo retries. Variáveis `AI_QUOTA_*` em `.env.example` permitem configurar esses valores. São limites de volume, não um orçamento monetário garantido.

Cada aluno pode ter dois trabalhos pendentes. Uma simulação aceita um turno de conversa pendente; o rascunho pode ser editado enquanto o paciente responde. Salvamento e leitura permanecem disponíveis quando a quota se esgota. Há no máximo três chamadas automáticas por geração; retry manual exige nova unidade. Falhas anteriores ao envio liberam a reserva; chamadas já despachadas permanecem contabilizadas.

No máximo dois slots globais permitem execução simultânea, mesmo com várias instâncias do worker. Leases duram 120 segundos, renovados a cada 20. Configure supervisão e reinício automático do processo. O heartbeat permite à interface indicar worker indisponível; a web nunca assume seu processamento.

Para atualizar uma instalação existente, pause novos envios e drene a fila antiga antes das migrations. Execute o backfill, inicie o worker novo e depois a web nova. Trabalhos antigos que restarem sem reserva são marcados como falha recuperável, mantendo o snapshot para nova análise com quota. Não misture produtores antigos e novos.

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

O [caderno de casos para validação](docs/casos-para-validacao.md) reúne os cenários e os pontos de revisão do responsável. `npm run db:cases` importa os casos como pendentes, sem publicá-los ou atribuí-los a alunos; repetir o comando preserva edições existentes. A [documentação de manutenção](docs/case-bank-execution.md) explica a limpeza conservadora dos dados de testes e seus backups.

- IA real depende das credenciais e do modelo do provedor; o modo local permite testar a experiência sem custos de API.
- O piloto com usuários reais depende da aprovação dos casos/protocolos por responsável de enfermagem.
- Não inclui voz, avatares, rankings ou integração com PEC/prontuários.
- SQLite serve ao desenvolvimento; a implantação PostgreSQL deve ser homologada no ambiente de destino.
