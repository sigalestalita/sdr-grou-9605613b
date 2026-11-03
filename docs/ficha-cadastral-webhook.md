# Ficha cadastral → Compass (webhook)

A ficha continua no app **cadastro-grou** (cadastro-grou.lovable.app). A cada
envio ele manda a ficha para o Compass, que liga à empresa pelo CNPJ (ou ao
contato pelo e-mail), completa os campos vazios da empresa e avisa o vendedor.

- Endpoint: `POST https://sdr-grou.lovable.app/api/public/fichas/webhook`
- Header: `x-compass-secret: <segredo>` — o segredo está em
  `app_settings.ficha_cadastral_webhook.secret` no banco do Compass.
- Corpo: a linha de `client_registrations` em JSON (todas as colunas, com `id`).
  Reenviar a mesma ficha (mesmo `id`) atualiza em vez de duplicar.
- Resposta: `{ ok: true, id, empresa, vendedor }` ou `{ ok: false, error }`.

## Prompt para colar no chat do projeto cadastro-grou (o original, que está no ar)

> Antes de colar, adicione o segredo `COMPASS_WEBHOOK_SECRET` nas Secrets do
> projeto (Cloud → Secrets) com o valor do segredo do Compass.

```
Quero que toda ficha enviada seja também enviada ao nosso CRM (Compass). Faça assim:

1. Na edge function send-registration-notification (que já roda a cada envio), depois de
   enviar o e-mail, busque a ficha completa em client_registrations pelo id recebido e
   faça um POST para https://sdr-grou.lovable.app/api/public/fichas/webhook com:
   - header "Content-Type: application/json"
   - header "x-compass-secret" com o valor do secret COMPASS_WEBHOOK_SECRET
   - corpo: a linha inteira de client_registrations em JSON (todas as colunas, incluindo id,
     client_type e created_at).
   Use o service role para ler a linha. Se o POST falhar, só registre o erro no log: não pode
   bloquear o envio da ficha nem o e-mail.
   Se a função hoje não recebe o id da ficha, passe o id no corpo da chamada que o formulário
   já faz (os dois formulários, PJ e PF).

2. Segurança: hoje a policy "Anyone can view registration by id" (SELECT USING true) deixa
   qualquer pessoa com a chave pública listar TODAS as fichas. Troque por uma função
   SECURITY DEFINER get_registration(_id uuid) que devolve só a ficha daquele id, use essa
   função na página /ficha/:id, e deixe o SELECT direto da tabela só para usuários logados.
   Também deixe o UPDATE só para usuários logados com papel admin.

3. Não mude nada no formulário, nos campos, no e-mail nem no visual.
```
