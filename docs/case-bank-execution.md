# Banco de casos e limpeza dos dados automatizados

Pedido: preparar cenários realistas e variados para validação pelo responsável e remover os dados criados apenas para testes.

## Limpeza concluída

- 19 turmas automatizadas, 30 casos de fixtures, 33 contas automatizadas e 11 simulações de testes removidos.
- Cópia SQLite consistente anterior à remoção e manifesto em `.backups/test-cleanup-2026-10-20T23-37-33-043Z/`.
- Os três casos originais, suas versões e a turma demonstração foram preservados. Atendimentos das contas originais foram mantidos.
- Identificação exige combinação de nome e padrão gerado de e-mail; classes exigem formato exato e ausência de vínculos não identificados como testes. Não se usa busca genérica por “teste”.
- Contadores vinculados às reservas dos testes são ajustados transacionalmente. Consumo do provedor não é reembolsado. A cópia do banco conserva o histórico anterior.
- Os quatro fluxos de navegador passaram com limpeza automática de suas fixtures ao término. Conferência posterior: somente duas contas originais, uma turma e três casos originais; nenhuma turma de fixture remanescente.

## Ferramentas

`npm run db:clean-tests` mostra uma prévia; `npm run db:clean-tests -- --apply` cria backup e remove apenas os dados identificados. Ferramenta restrita ao SQLite local.

`npm run db:cases` importa o conjunto para o instrutor original. `--owner email` permite escolher outro instrutor ativo. Casos existentes com o mesmo identificador são preservados para não sobrescrever edições do responsável.

## Conteúdo para validação

Importados 40 casos em oito módulos, com ficha fictícia, entrevista, competências, alertas, registro de referência proposto, erros a discutir e perguntas ao validador. Todos estão pendentes de revisão, sem aprovação clínica, publicação ou atribuição aos alunos. O painel do instrutor contém 43 casos, incluindo os três originais preservados.

A segunda execução do importador criou zero casos e preservou os 40 existentes. Conferência em navegador confirmou a listagem paginada, a abertura do formulário, a fundamentação preenchida e a fonte ainda não aprovada. A conta de aluno recebeu 404 ao consultar um caso pendente. Verificações finais: 141 testes unitários, quatro fluxos E2E, checagem de tipos e compilação de produção concluídos com sucesso. O caderno completo está em [casos-para-validacao.md](casos-para-validacao.md).

Catálogo educativo ampliado a partir da [CIAP-2 publicada no REDS GO](https://fhir.saude.go.gov.br/r4/reds-go/CodeSystem-BRCIAP2.html). Glicemia capilar e curativo grau I conferidos respectivamente nos [atos MS de 2019](https://bvsms.saude.gov.br/bvs/saudelegis/sas/2019/pr2045_07_02_2019.html) e [2020](https://bvsms.saude.gov.br/bvs/saudelegis/saes/2020/prt0526_02_07_2020.html). O subconjunto continua sem representar a competência SIGTAP completa/vigente.

As fontes do avaliador permanecem não conferidas e a aplicabilidade dos critérios, pendente. O instrutor deve selecionar trechos, conferir versões e ajustar o fluxo local antes da publicação. Nenhuma citação ou página de protocolo é inventada.
