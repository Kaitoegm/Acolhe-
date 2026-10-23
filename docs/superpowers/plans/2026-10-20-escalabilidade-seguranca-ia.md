# Acolhe+ — plano de paginação, worker de IA e quotas

**Status:** implementado e verificado localmente; homologação PostgreSQL/provedor de implantação pendente. Evidências em `docs/execution-security.md`.
**Objetivo:** limitar trabalho e consumo por requisição, separar a execução de IA do servidor web e controlar uso concorrente sem perder rascunhos ou tentativas.
**Base:** implementação aprovada em `docs/implementation.md`; inspeção do código em 20/10/2026.
**Arquitetura:** manter Next.js, Prisma e PostgreSQL. Reutilizar a fila persistente existente, ampliando-a para conversa e avaliação. Não introduzir Redis ou outro serviço de fila nesta etapa.
**Execução:** implementar por entregas com testes de regressão antes de cada mudança. Usar Superpowers executing-plans ou subagent-driven-development. Não publicar em produção nesta tarefa.

## 1. Diagnóstico e limites

Problemas confirmados:

- `src/lib/server/api.ts`: listagens de atendimentos, casos, turmas e alunos sem paginação. A fila usa `simulationInclude`, carregando mensagens, tentativas, snapshots e comentários que não aparecem na lista.
- `src/lib/server/views.ts`: detalhe de simulação inclui todo o histórico. Uma simples atualização de status transfere novamente o histórico inteiro.
- `src/lib/server/api.ts`: `kick()` usa `after()` para executar avaliações na aplicação web, inclusive após um GET. O chat chama `patientReply()` dentro da requisição.
- `src/lib/server/jobs.ts`: já existe claim com lease e persistência, mas o processamento não está exclusivamente no worker.
- Há limite de mensagens por atendimento e proteção do login, mas não há quota de IA por aluno, responsável/turmas ou implantação. Tentativas manuais podem reiniciar o orçamento de retries.

**Invariantes:** autorização por usuário/turma em toda consulta; gabarito privado; snapshot original imutável; consulta GET sem escrita ou execução de IA; nenhuma chave do provedor no processo web; quotas verificadas no servidor; falha nunca vira aprovação.

As correções já realizadas de validação de rascunho, campos obrigatórios e publicação de critérios são pré-requisito, não substituem este plano.

## 2. Entrega A — consultas limitadas e contratos de leitura

### Contrato

Criar `Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean }`. Padrão: 25 itens, máximo: 100. Parâmetros `limit`, `cursor`, `q`, `status`, `risk`, `classId` e `order` são validados e só aceitos nas rotas que os suportam; valores inválidos retornam 400.

Cursor opaco, assinado com chave do servidor, contém versão, ordenação, último conjunto de chaves e hash dos filtros/escopo. Não contém dados clínicos. Cursor de outro usuário, filtro ou ordenação é rejeitado; mesmo um cursor válido nunca substitui filtros de autorização.

Listagens:

- `GET /api/simulations`: resumo da fila paginado; busca e filtros executados no banco.
- `GET /api/cases`: catálogo resumido paginado. Ficha completa somente no detalhe autorizado.
- `GET /api/instructor/classes`, `/students`, `/cases`, `/simulations`: endpoints separados, carregados apenas quando a respectiva aba é aberta.
- `GET /api/simulations/:id`: ficha e rascunho, com resumo da tentativa mais recente; sem coleções integrais.
- `GET /api/simulations/:id/messages` e `/attempts`: históricos paginados. Tentativas retornam metadados, sem snapshot.
- `GET /api/attempts/:id`: snapshot e devolutiva de uma tentativa autorizada. Comentários em `/api/attempts/:id/reviews`, também paginados.
- `GET /api/simulations/:id/status`: somente revisões, estados dos trabalhos ativos e IDs de resultados novos. GET não chama `kick`, atualiza heartbeat ou resgata leases.
- `GET /api/instructor/simulations/:id/progress`: agregação por dimensão no servidor, sem transferir todos os snapshots.

### Consultas e experiência

- Usar `select` mínimo e `_count` para totais locais, nunca o include do detalhe na fila. Remover o carregamento de todos os casos para autorizar um único `caseId`.
- Paginar por chave com `take: limit + 1`; não usar offsets crescentes.
- Ordenação padrão: `createdAt DESC, id DESC`. Ordem de chegada inverte ambas. Tentativas: `number DESC, id DESC`; mensagens/comentários: `createdAt DESC, id DESC`.
- Preservar ordenação por risco com coluna `riskRank` mantida junto do rascunho: alta=0, intermediária=1, baixa=2, não aguda=3, não preenchida=4. Cursor usa `riskRank, createdAt, id`.
- Mudanças concorrentes de risco podem mover registros entre páginas: a lista é uma visão atual, não um snapshot histórico. Deduplicar por ID no cliente e reiniciar paginação após alteração de risco ou filtros. Botão Atualizar reinicia a consulta.
- “Carregar mais” para fila/casos; “Mensagens anteriores” para conversa. Carregar detalhes de tentativa sob demanda. Não simular paginação cortando um array completo no navegador.
- Busca por nome no banco, sem diferenciar maiúsculas/minúsculas; preservar filtros por status/risco/turma. Prisma PostgreSQL e SQLite têm diferenças: testar a implementação local e a de produção explicitamente.
- Índices compostos por `studentId`/`classId` + chaves de ordenação; mensagens por `simulationId, createdAt, id`; tentativas por `simulationId, number`; comentários por `attemptId, createdAt, id`. Inspecionar `EXPLAIN ANALYZE` em PostgreSQL.
- Catálogos estáticos atuais podem permanecer em memória porque são pequenos e limitados. Não aplicar essa exceção a futuros catálogos completos importados.

**Aceite:** 250 registros com empates de data são percorridos sem duplicação ou perda quando os dados não mudam; limite nunca ultrapassa 100; payload da fila não contém mensagens, rubricas, snapshots ou devolutivas; aluno/instrutor de outra turma não atravessa o escopo via cursor.

## 3. Entrega B — execução exclusiva pelo worker

### Dados e fluxo

Ampliar `Job` com `kind` (`EVALUATION` ou `PATIENT_REPLY`), `generation`, `ownerId`, `instructorId` e vínculo exclusivo com tentativa ou turno. Manter estados QUEUED/RUNNING/COMPLETED/FAILED, tentativas, disponibilidade, lease e token. Criar `ChatTurn` com mensagem do aluno, snapshot dos fatos e contexto limitado da conversa, resultado, erro e chave de idempotência.

- Web autentica, autoriza, valida, reserva quota e grava entrada + job em uma única transação. Retorna **202** com `{ jobId, resourceId, status }`. Não espera pelo provedor.
- `POST /messages` passa a receber `{ content, revision, idempotencyKey }`. Persistir a mensagem imediatamente; resposta do paciente aparece quando o worker terminar. Limitar a um turno pendente por simulação. Enquanto ele estiver pendente, permitir editar o registro, mas bloquear nova mensagem e conclusão; não congelar conversa incompleta numa avaliação.
- Submissão mantém idempotência por simulação/revisão. Retry manual cria uma nova geração de execução sobre o mesmo snapshot, com nova reserva de quota. Repetir a mesma chave retorna a execução existente.
- Worker é o único módulo que importa o adaptador de IA e recebe `AI_API_KEY`. Remover `after()`, `kick()` e importações de `patientReply`/`evaluateSubmission` da camada HTTP.
- Ao terminar um turno, persistir resposta e estado atomicamente sem substituir o rascunho. Introduzir `conversationRevision` separado da revisão do rascunho; a conclusão verifica ambas.
- O worker revalida conta ativa e vínculo da turma antes de chamar o provedor. Sem autorização vigente, cancela o trabalho antes do envio e libera reservas não consumidas.

### Recuperação e operação

- Claim atômico no PostgreSQL, com lease de 120 segundos e heartbeat a cada 20 segundos. Persistência de resultado exige token e geração atuais.
- Timeout do provedor: 30 segundos. Máximo de 3 chamadas por geração; backoff de 5 e 15 segundos com jitter limitado. Retries e recuperação de lease contam nesse mesmo limite.
- Exaustão do limite termina em FAILED inclusive após crashes; não deixar jobs expirados serem reexecutados indefinidamente.
- Reiniciar worker recupera trabalhos elegíveis, sem gerar outro snapshot ou outra mensagem. Persistência local é idempotente; **não prometer execução exatamente uma vez no provedor**. Usar chave de idempotência upstream quando suportada e contabilizar chamadas de resultado incerto conservadoramente.
- Shutdown interrompe novas aquisições, permite finalizar a chamada ativa e encerra após prazo. Um supervisor reinicia o processo.
- Concorrência global inicial: 2 chamadas, usando dois slots/leases no banco compartilhados por todas as réplicas. Não confundir limite por processo com limite global.
- Heartbeat do worker em tabela própria. Web informa fila aguardando serviço se heartbeat estiver atrasado; não assume execução nem tenta substituir o worker.
- Polling de status: 2 segundos inicialmente, aumentando até 10 segundos; pausar quando aba estiver oculta e parar em estado terminal. Consultar histórico completo somente se houver resultado novo.

**Aceite:** web sem chave de IA continua aceitando trabalhos; worker parado deixa jobs persistidos, sem chamadas ao provedor; reinício processa a fila; dois workers não publicam dois resultados; GET repetido não altera banco nem chama IA.

## 4. Entrega C — quotas persistentes e limites de consumo

### Defaults propostos para o piloto

Valores são limites técnicos iniciais, configuráveis no servidor; não são estimativa de demanda da prefeitura.

| Escopo | Conversas aceitas/dia | Avaliações ou retries manuais/dia |
|---|---:|---:|
| Aluno | 100 | 20 |
| Instrutor responsável, somando suas turmas | 3.000 | 300 |
| Implantação inteira | 6.000 | 600 |

Além disso: por aluno, 10 novas mensagens/minuto, 3 avaliações/minuto e no máximo 2 jobs pendentes; por simulação, 1 turno de conversa pendente. Teto global separado de **10.000 chamadas ao provedor/dia**, incluindo retries automáticos e resultados incertos. Reinício de processo não zera contadores.

Dias e minutos são janelas UTC calculadas pelo servidor; interface mostra horário de renovação em America/Sao_Paulo. Esses limites controlam volume, não garantem uma fatura monetária: o custo depende do modelo. Limitar a entrada total a 32.000 bytes e a saída a 1.800 tokens por chamada; payload maior falha antes de chamar IA, sem truncar fatos clínicos silenciosamente.

### Persistência e contabilidade

- `UsageBucket`: escopo, ID, tipo de operação, início da janela, reservados e consumidos; chave composta única.
- `UsageReservation`: chave idempotente, usuário, job/geração, estado RESERVED/CONSUMED/RELEASED e vínculos aos buckets.
- `AiInvocation`: job/geração/número da chamada, estado, início/fim, identificação do modelo, uso informado pelo provedor quando disponível. Não guardar prompts ou dados clínicos nesse log operacional.
- Transação reserva unidades em **todos** os buckets aplicáveis, cria recurso e job. Atualizações condicionais (`usado + reservado < limite`) em ordem fixa; falha em qualquer bucket desfaz tudo. Testar concorrência em PostgreSQL real.
- A unidade do usuário é consumida quando o worker inicia a primeira chamada; cancelamento anterior libera a reserva uma única vez. Falha ou timeout após despacho permanece consumido, com explicação na interface. O retry manual é uma nova unidade.
- Cada tentativa de chamada reserva e consome separadamente o orçamento global de provedor. Retries automáticos não gastam outra unidade do aluno, mas gastam outra chamada global.
- Mensagens e avaliações demo seguem quotas de operação para exercitar o fluxo, mas não contam como chamadas ao provedor.
- Sem disponibilidade no contador ou indisponibilidade do banco, não chamar IA nem aceitar operação sem reserva.
- Reservas de trabalhos cancelados antes do despacho são reconciliadas pelo worker. Expiração não libera trabalho RUNNING; primeiro verificar estado/lease e consumo.

### API e UX

`GET /api/usage` devolve uso, limite, restante e renovação do próprio usuário, mais indisponibilidade do orçamento compartilhado sem revelar uso individual de terceiros.

Quota esgotada: **429**, `Retry-After`, `{ error, code: "AI_QUOTA_EXCEEDED", scope, resetsAt }`. Duplicata idempotente devolve o resultado original sem nova cobrança. Limite de pendência: **409** com código específico. Falta operacional do serviço pode retornar 503 sem perder rascunho.

Exibir limite e renovação perto do chat e da conclusão. Nunca impedir salvar ou revisar registro por falta de quota. Instrutor acompanha uso agregado de suas turmas, sem poder elevar o teto global pela interface.

**Aceite:** requisições simultâneas na última unidade aceitam somente uma operação; duplicatas não debitam de novo; todos os caminhos de retry respeitam limites; reset UTC, cancelamento, falhas e reinício mantêm saldo consistente.

## 5. Sequência, testes e implantação

1. **Paginação e redução de payload:** escrever testes de escopo/cursor, mudar consultas e contratos, adaptar UI e testar fila/históricos. Manter funcionalidade atual de IA até o worker novo estar pronto.
2. **Migrations aditivas:** criar ChatTurn, campos de Job, buckets, reservas, invocações, slots e heartbeat. Jobs legados recebem kind EVALUATION e generation=1. Preservar snapshots. Preparar consultas e worker sem ativar novo produtor.
3. **Quotas e enqueue compartilhado:** implementar reserva transacional e idempotência; testar separadamente antes de conectar endpoints. Nenhum job novo pode entrar por caminho alternativo sem reserva.
4. **Worker e migração do chat:** testes com provedor falso, dois workers, crashes/timeouts, revogação de acesso e recuperação. Atualizar resposta 202, polling e feedback de quota.
5. **Corte coordenado:** interromper criação de novos trabalhos por uma janela breve, drenar os legados, migrar, subir worker e depois web sem execução de IA. Remover credenciais do ambiente web. Não operar produtor antigo junto do novo.
6. **Homologação:** rodar testes unitários, integração PostgreSQL, E2E e build. Exercitar 10.000 atendimentos e 20 clientes concorrentes em ambiente de teste. Registrar tamanho de payload, duração p50/p95, consultas executadas, idade do job mais antigo, retries, quotas recusadas e chamadas efetivas.

Critérios finais: listagens retornam no máximo o limite solicitado; nenhum endpoint GET tem efeito de escrita/IA; ausência do worker não consome provedor; quotas permanecem corretas sob concorrência; perda de conexão e falta de orçamento preservam rascunho e snapshot.

Rollback: pausar entrada de novos trabalhos e manter jobs/dados; voltar para release compatível com a fila e as tabelas aditivas. Não voltar automaticamente ao processamento dentro da web ou executar jobs sem reserva. Não apagar tabelas de consumo no rollback.

### Arquivos e interfaces a alterar

- Dividir o dispatcher atual em módulos de leitura paginada, enqueue e gestão; manter o catch-all apenas como roteador com número de segmentos exato.
- Adicionar paginação, quotas e repositório de jobs em `src/lib/server`; separar adaptador de IA para importação exclusiva do worker.
- Atualizar contratos compartilhados, esquema/migrations Prisma, worker, fila, chat, feedback e painel do instrutor.
- Documentar comandos de web/worker, variáveis de quota, limites de payload, política de falhas e procedimento de corte/rollback.

### Fora desta implementação

Cobrança financeira, compra de créditos, Redis, filas gerenciadas externas, publicação em Vercel, integração com PEC e mudança de protocolos clínicos. Não são necessários para corrigir os três problemas identificados.
