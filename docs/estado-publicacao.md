# Estado do código enviado ao GitHub

- Banco de 40 casos fictícios para revisão, editor guiado do instrutor, avaliação V2, paginação, fila e quotas incluídos.
- Verificação em 23/10/2026: 146 testes automatizados passando, checagem de tipos e compilação verificadas antes do envio.
- Pendência conhecida: o teste de navegador `instructor-simple.spec.ts` falhou ao retornar do editor à lista pelo histórico do navegador. Não considerar o fluxo completo de navegação homologado.
- A última execução completa de navegador também encontrou inconsistência em contador reservado ao limpar dados automatizados. O diagnóstico está em `scripts/audit-test-reservations.ts`; não foi aplicada correção automática nos contadores.
- Casos e protocolos continuam sujeitos à revisão clínica. Nenhum caso foi aprovado como parte do envio de código.
- Arquivos de ambiente, bancos SQLite, backups e resultados de testes permanecem fora do repositório. A implantação exige configuração própria das variáveis e banco.
