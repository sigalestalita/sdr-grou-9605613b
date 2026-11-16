# AGENTS.md

- Proposal slide images live in the private `propostas-slides` bucket (workspace blocks public buckets); `conteudo.apresentacao.slides` stores public-format URLs and the public page swaps them for signed URLs server-side, always looked up by token.
- Proposal visits (`proposta_visitas`) are written only by server functions in `propostas-publico.functions.ts` with the service role; one row per browser session, and preview (`?previa=1`, `?imprimir=1` or a signed-in Compass user) records nothing.
- Proposal alert e-mails (`src/lib/propostas/avisos-email*.ts`) go through the same Resend connector as the other Compass e-mails, to `propostas.avisos_emails` (empty → the sender's profile e-mail); they never throw, every attempt is logged in `integration_logs` (action `proposta_aviso_email`), `PROPOSTA_AVISOS_EMAIL_SIMULAR=1` skips the real send, and a signed-in Compass caller (preview) gets no e-mail.
