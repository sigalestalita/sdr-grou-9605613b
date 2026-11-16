# AGENTS.md

- Proposal slide images live in the private `propostas-slides` bucket (workspace blocks public buckets); `conteudo.apresentacao.slides` stores public-format URLs and the public page swaps them for signed URLs server-side, always looked up by token.
- Proposal visits (`proposta_visitas`) are written only by server functions in `propostas-publico.functions.ts` with the service role; one row per browser session, and preview (`?previa=1`, `?imprimir=1` or a signed-in Compass user) records nothing.
