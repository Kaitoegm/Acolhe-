# Acolhe+ — implementação do plano aprovado

Objetivo: simulador de escuta inicial semelhante ao PEC, com paciente por texto, ficha completa, aluno/instrutor e devolutiva formativa no registro. Não é prontuário real.

## Entregas
- [x] Interface: fila, formulário PEC, ficha/chat lateral, devolutiva acessível.
- [x] Persistência e acesso: Prisma, PostgreSQL de implantação, SQLite de desenvolvimento, sessões e autorização por turma.
- [x] Domínio: três casos demonstrativos versionados em revisão, catálogos identificados, paciente restrito aos fatos, avaliação estruturada.
- [x] Avaliações persistentes: snapshots, idempotência, tentativas, falhas recuperáveis e revisão do instrutor.
- [x] Gestão: turmas, alunos, casos, publicação/revisão, atribuição e acompanhamento.
- [x] Verificação local: domínio, autorização, TypeScript, build e fluxo de navegador.
- [ ] Homologação com PostgreSQL e provedor de IA da implantação.
- [ ] Aprovação clínica dos casos e piloto com turma real.

## Decisões de implementação
- Pasta fornecida vazia, sem Git; implementação direta nela, sem worktree ou publicação remota.
- Docker sem daemon ativo: SQLite local usa esquema derivado do PostgreSQL. Produção continua PostgreSQL.
- Modo IA demo é explícito; modo real exige credenciais. Não existe fallback silencioso que simule aprovação.
- Casos demo são utilizáveis em ambiente de desenvolvimento, mas a avaliação clínica fica pendente até revisão. Piloto com turma real requer revisão dos critérios.
- Interfaces compartilhadas em src/lib/contracts.ts. API usa JSON, erros {error: string}, autenticação server-side e verificação de origem em mutações.
- Nenhum gabarito é devolvido a alunos. Histórico de tentativas e versões de casos é imutável.

## Mapa de propriedade
- Agente domínio: src/lib/domain/** e tests/domain.test.ts.
- Agente servidor: prisma/**, src/lib/server/**, src/app/api/**, scripts/create-admin.ts e scripts/worker.ts, tests/server*.test.ts.
- Agente interface: src/app (exceto api), src/components/**, src/lib/client.ts.
- Coordenador: configurações, contratos, documentação, scripts/local-db.mjs, testes de integração/E2E e revisão.

## Retomada em 20/10/2026

- Corrigida separação entre validação de rascunho parcial e envio obrigatório; rich text e texto precisam coincidir já ao salvar.
- Publicação exige classificação, desfecho, CIAP, fontes e procedimentos consistentes com o caso. Isso valida estrutura, não substitui revisão clínica humana.
- Procedimentos iniciais automáticos somente em versão publicada/revisada, pela interseção das ações realizadas e esperadas.
- Teste E2E de nova conta utiliza senha própria válida, preservando a configuração local alterada pelo usuário.
- Paginação, execução exclusiva no worker e quotas continuam pendentes. Plano separado em `docs/superpowers/plans/2026-10-20-escalabilidade-seguranca-ia.md`, sem implementar essa expansão nesta retomada.
- Revisão independente final foi interrompida por indisponibilidade dos subagentes; não registrar como revisão concluída.
