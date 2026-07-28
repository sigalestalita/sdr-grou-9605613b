## Objetivo

1. Marcar o número **5551926345331** como conta exclusiva de **consultoria**.
2. Somente **Mariana Borges** enxerga o inbox desse número. Ela também continua vendo qualquer conversa em que seja `assigned_to`.
3. Disparos proativos, FUPs, automações, campanhas e IA reativa nesse número: só para leads de consultoria.
4. Adicionar seletor de "Conta WhatsApp" em Campanhas, Automações, FUPs e IA.

---

## 1. Migration (schema + RLS)

- `whatsapp_accounts.metadata`: adicionar flag `lead_type_scope` (`"consultoria"` | `"non_consultoria"` | `null`) e `visible_to_user_ids uuid[]`.
- Setar `lead_type_scope = 'consultoria'` e `visible_to_user_ids = [Mariana]` no registro do 5551926345331.
- `whatsapp_automation_rules`: coluna `account_id uuid references whatsapp_accounts(id)`.
- `whatsapp_fup_sequences`: coluna `account_id uuid references whatsapp_accounts(id)`.
- (campanhas já tem `account_id`.)
- Setting `app_settings.whatsapp_ai_reactive`: `{ default_account_id, consultoria_account_id }`.

RLS — atualizar policies:
- `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_contacts`:
  - Mariana (`user_id = MARIANA`): vê linhas cuja `account_id` = conta consultoria **OU** `assigned_user_id = Mariana` **OU** lead `assigned_to = Mariana`.
  - Outros SDRs/gestão: veem tudo **exceto** `account_id` = conta consultoria.
  - Super_admin: vê tudo.

## 2. Backend (respeitar escopo de conta)

Em `automations-engine.server.ts`, `fups-engine.server.ts`, `whatsapp-campaigns.functions.ts`, `whatsapp-ai.functions.ts`, `lead-hot-alert.server.ts`, `template-send.server.ts`:

- Resolver conta: rule/sequence/campaign.`account_id` > default.
- Antes de enviar/enrolar: se a conta é `lead_type_scope='consultoria'` e o lead **não** é consultoria → pular com log. Se conta é `non_consultoria` e lead **é** consultoria → pular com log.
- Disparo proativo para novo lead consultoria: forçar conta consultoria (via `whatsapp_ai_reactive.consultoria_account_id`).
- IA reativa (quando o lead escreve): usar a mesma conta pela qual a conversa chegou (`conversation.account_id`), mantendo a restrição de tipo.

## 3. UI — seletor de conta

Adicionar `<Select>` "Conta WhatsApp" (label + phone) em:
- Form de **Campanha** (já tem campo, garantir que aparece).
- Form de **Regra de Automação** (`_app.whatsapp.automacoes.tsx`).
- Form de **Sequência FUP** (`_app.whatsapp.fups.tsx`).
- Config da **IA** (`_app.whatsapp.ia.tsx`): dois campos — conta default e conta consultoria.

Cada select mostra badge do escopo da conta (ex: "Consultoria only").

## 4. Inbox

Nada de código extra além da RLS: `_app.whatsapp.index.tsx` já lista via query que passa por RLS, então Mariana só vê consultoria + leads dela, e demais SDRs deixam de ver o número consultoria.

Adicionar filtro "Conta" no topo do inbox (opcional, ajuda leitura).

## 5. Validação

- Login como Mariana → inbox só mostra consultoria + leads atribuídos.
- Login como Camila → inbox não mostra nenhuma conversa do 5551926345331.
- Criar automação com conta consultoria + audiência empresa → nenhum lead enrola (log `skipped_account_scope`).
- Novo lead consultoria com routing → HSM proativo sai pela conta consultoria.

---

## Notas técnicas

- `MARIANA_USER_ID` já constante em `lead-hot-alert.server.ts`; extrair para `src/lib/consultoria.ts` e reusar.
- Escopo por conta é checado em ambos os motores (automations/FUPs) para não depender só de filtro de audiência.
- RLS via helper SQL `public.wa_can_see_account(_account_id uuid)` (SECURITY DEFINER) para reuso.

Impacta ~10 arquivos. Zero mudança visual para desktop; adiciona apenas campos de seleção nas 4 abas.