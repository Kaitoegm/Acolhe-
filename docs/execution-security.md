# Execução — paginação, worker e quotas

Plano: docs/superpowers/plans/2026-10-20-escalabilidade-seguranca-ia.md

- [x] Consultas paginadas e autorização.
- [x] Fila persistente e quotas atômicas.
- [x] API sem execução de IA.
- [x] Interface adaptada, status e consumo.
- [x] Migrations/backfill e revisão independente; dois achados corrigidos e cobertos por regressões.
- [ ] Homologação PostgreSQL e integração com provedor real no ambiente de implantação.

Decisões: manter o diretório fornecido (sem Git). Nenhuma publicação. Preservar SQLite local e migrations PostgreSQL. ClinicalCase.currentStatus é projeção da última versão para filtrar antes de paginar. Simulation.patientName/Search e riskRank são projeções para índices/busca, reconstruídas no backfill. Detalhes permanecem em versões/snapshots imutáveis.

Verificação local: 56 testes automatizados, incluindo 250 registros empatados em três ordenações, busca com acentos, revogação de matrícula, última unidade concorrente, idempotência e falhas/retries. E2E com web e worker em processos separados. Teste HTTP com 10.000 registros e 20 clientes: 200 requisições, 10.000 IDs únicos percorridos, p50 213 ms, p95 404 ms e payload máximo 46.578 bytes. Resultados observados em SQLite local, não extrapolados para PostgreSQL/produção. Fixtures de carga removidas pelo script.

Revisão: revogar matrícula agora bloqueia também consultas/edição; orçamento de avaliações não bloqueia chat e vice-versa. Quotas compartilhadas usam incremento condicional atômico sobre a soma corrente para evitar falsos 429 entre alunos concorrentes.
