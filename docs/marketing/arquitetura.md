# Módulo de Marketing do Compass: arquitetura

Status: proposta, 02/11/2026.

O marketing gera de 90% a 95% das pessoas que chegam ao time de SDR, que marca a
reunião para os executivos. O módulo é o começo do funil do Compass. Ele capta a
pessoa, registra de onde ela veio, nutre e segmenta, e entrega ao SDR quem está
pronto. Depois disso, mede o que virou reunião e venda.

Hoje esse começo está espalhado entre o RD Station Marketing, o Make e uma
planilha do Google. As falhas de outubro nasceram dessas emendas:

- **Formulário da Black fora do fluxo do RD:** 97 leads ficaram 15 dias sem SDR.
- **Conexão do Facebook no Make caiu:** os leads pararam de chegar.
- **Lista de evento virou lead de SDR:** 142 pessoas receberam a abertura da IA.

A arquitetura abaixo junta tudo num caminho só, dentro do Compass.

---

## 1. Princípios

1. **A pessoa é o centro.** Toda captação grava um **contato** (`contacts`)
   ligado à **empresa** (`companies`), que é a mesma espinha que o comercial e o
   CS já usam. O card de SDR (`leads`) não é o cadastro da pessoa. É a **tarefa
   do SDR**, que nasce quando o marketing entrega o contato.
2. **Contato e lead são etapas da mesma pessoa.**
   - **Contato** é quem baixou material, se inscreveu em webinar ou veio de rede
     social, conteúdos de topo e meio de funil.
   - **Lead** é quem pediu conversa: demo, orçamento, formulário de fundo de
     funil, ou quem atingiu a pontuação.
   - A passagem de um para o outro é uma **regra explícita**, nunca um efeito
     colateral de outro processo.
3. **Toda entrada passa pelo mesmo cano.** Site, landing page, blog, Meta Lead
   Ads, Google Ads, WhatsApp, importação e API seguem as mesmas etapas:
   normalizar, identificar a pessoa, gravar a conversão e avaliar as regras.
   Não há caminho paralelo que possa ficar de fora.
4. **Conversão é evento, não campo.** Cada envio de formulário é um registro
   próprio, com origem, UTM e IDs de clique. Nada sobrescreve a primeira origem.
5. **Nenhuma mensagem sai sem propósito e consentimento.**
   - Quem não pediu contato não recebe a abertura de primeiro contato.
   - Quem descadastrou não recebe e-mail de marketing.
   - Toda campanha diz o que acontece com quem responde.
6. **Envio em massa é fila com lote, idempotente.**
   - Cada rodada manda um lote e marca antes de enviar, para não sair em dobro.
   - A próxima rodada continua de onde parou.
   - É o mesmo padrão que já corrigiu as campanhas de WhatsApp.
7. **Toda peça tem alarme de silêncio.** Formulário ativo sem conversão há X
   horas, integração sem evento, fluxo parado: o Compass avisa antes de alguém
   perceber pela falta de leads.

---

## 2. Visão geral

```
 ORIGENS                     CAPTAÇÃO                 BASE (espinha)            SAÍDAS
 ───────                     ────────                 ──────────────            ──────
 Site / LP / blog ──┐
   (grou.js + forms)│
 Meta Lead Ads ─────┤     ┌──────────────────┐     contacts ◄─► companies
 Google Ads forms ──┼───► │  Cano de entrada │ ──► mkt_conversoes  (eventos)  ──► Segmentos
 WhatsApp inbound ──┤     │  normaliza       │     mkt_eventos     (web/email)    │
 Importação / API ──┤     │  identifica      │     mkt_tags · campos custom       ▼
 RD (transição) ────┘     │  grava conversão │     lifecycle · pontuação     Fluxos de automação
                          │  avalia regras   │                                │   ├─ e-mail (massa/nominal)
                          └──────────────────┘                                │   ├─ WhatsApp (templates)
                                   │                                          │   ├─ tags, campos, tarefas
                                   ▼                                          │   └─ entrega ao SDR
                          Regra de passagem ───────────────────────────────►  leads (kanban SDR)
                          (fundo de funil, pontuação)                          │ roleta / dona
                                                                               ▼
                                                                    deals (reunião → venda)
                                                                               │
                         Atribuição e relatórios ◄─────────────────────────────┘
                         (origem → contato → lead → reunião → venda; CAC por canal)
                         Conversões offline → Meta CAPI / Google Ads
```

---

## 3. O que já existe e como entra no módulo

| Hoje | Onde | No módulo |
|---|---|---|
| Espinha `companies` / `contacts` / `company_contacts` / `deals` | banco | Base do marketing. Ganha lifecycle de contato, campos custom, tags e origem. |
| `leads` (kanban SDR), roteamento (`lead-routing.server.ts`), ICP (`icp-score`, `icp_config`) | SDR | Destino da passagem. A roleta e a dona por tipo continuam como estão. |
| Webhook Meta Lead Ads (`/api/public/meta/leads`) | `meta-leads.server.ts` | Vira uma das origens do cano de entrada. |
| Make → planilha → `sync-planilha` | `sheets-sync.server.ts` | Transição. Sai quando o webhook do Meta e os formulários próprios cobrirem tudo. |
| RD Station Marketing (conversões, fluxo "SDR 3", segmentações, e-mail) e espelho `rd_*` | `rd/*`, `sync-rd` | É o que o módulo substitui. Roda em paralelo na migração (seção 12). |
| Campanhas e automações de WhatsApp, FUPs | `whatsapp-campaigns`, `automations-engine`, `fups-engine` | Viram ações dos fluxos. Campanha passa a usar segmento. |
| Envio de e-mail pela Resend (jornada CS, alertas, digest) | `cs/journey.server.ts` | Mesmo provedor para o e-mail de massa, em subdomínio próprio. |
| `meta_ads_campanhas` / `meta_ads_diario` | `meta-ads.server.ts` | Custo por canal na atribuição. Ganha o par do Google Ads. |
| `lead_interactions`, `lead_touches` | SDR | Continuam como histórico do SDR. O histórico de marketing fica em `mkt_conversoes` e `mkt_eventos`, e a linha do tempo junta os dois. |

---

## 4. Modelo de dados

O prefixo `mkt_` marca o que é do módulo. Toda tabela tem `created_at` e
`updated_at`.

### 4.1 Contato e empresa (colunas novas)

`contacts`:
- `lifecycle`: `assinante` → `contato` → `lead` (MQL) → `sql` (aceito pelo SDR)
  → `oportunidade` → `cliente`; e `descartado`. Hoje está nulo em todos.
- `primeira_origem`, `ultima_origem`: jsonb com `fonte`, `meio`, `campanha`,
  `conteudo`, `termo`, `ativo_id`, `em`. Primeira e última conversão, para
  atribuição.
- `pontuacao_perfil`, `pontuacao_engajamento`, `pontuacao_em`.
- `campos`: jsonb com os campos custom (4.4), com índice GIN.
- `email_status`: `ok` | `bounce` | `spam` | `descadastrado`. `phone_key` para
  achar a pessoa pelo telefone (já existe em `leads`).

`companies`:
- `campos` (jsonb, custom), `pontuacao_perfil` e `primeira_origem`.
- O `lifecycle` já existe e já é calculado. Passa a considerar o lifecycle dos
  contatos.

### 4.2 Ativos e conversões

```
mkt_ativos            o que capta: formulário, landing page, material rico, webinar/evento,
                      formulário de anúncio (Meta/Google), número de WhatsApp, importação
  id, nome, tipo, etapa_funil (topo|meio|fundo), slug, url,
  meta_form_id, google_form_id, campos_mapeados jsonb,
  regra_passagem (nunca|sempre|por_pontuacao), dona_padrao,
  silencio_horas (alarme), ativo

mkt_conversoes        um registro por envio, nunca sobrescrito
  id, contact_id, company_id, ativo_id, ocorreu_em,
  fonte, meio, campanha, conteudo, termo,          -- UTMs
  gclid, fbclid, fbc, fbp, meta_lead_id, google_lead_id,
  campanha_id_ads, adset_id, ad_id, form_id,
  pagina_url, referrer, visitante_id,
  respostas jsonb (cru), origem_tecnica (site|meta|google|whatsapp|import|api|rd),
  idempotencia (único: ex. meta_lead_id ou hash do envio)
```

**O formulário da Black não volta a ficar de fora.** Formulário do Meta que
chega sem `mkt_ativos` cadastrado entra com `regra_passagem = sempre`, por
segurança, e gera um alerta. O padrão seguro é entregar ao SDR, não esquecer.

### 4.3 Eventos de comportamento

```
mkt_visitantes        visitante anônimo do site (cookie grou_vid), ligado ao contato quando converte
  id, contact_id, primeiro_em, ultima_visita_em, primeira_origem jsonb

mkt_eventos           particionada por mês
  id, contact_id, visitante_id, tipo (pagina|email_entregue|email_aberto|email_clique|
  email_bounce|email_spam|descadastro|wa_entregue|wa_lido|wa_respondeu|...),
  ocorreu_em, referencia_tipo, referencia_id (envio, fluxo, campanha), dados jsonb
```

### 4.4 Campos custom e tags

```
mkt_campos            definição: entidade (contato|empresa|negocio), chave, rótulo,
                      tipo (texto|numero|data|lista|multilista|booleano), opcoes jsonb
                      → valores em contacts.campos / companies.campos / deals.campos

mkt_tags              id, nome, cor, grupo
mkt_tag_vinculos      tag_id, entidade (contato|empresa|lead|negocio), entidade_id,
                      origem (manual|fluxo|importacao|regra), origem_id, criado_por
```

### 4.5 Segmentos

```
mkt_segmentos         id, nome, entidade (contato|empresa), tipo (dinamico|estatico),
                      regra jsonb, contagem_cache, contagem_em
mkt_segmento_membros  segmento_id, entidade_id, entrou_em   -- estático, ou foto do dinâmico
```

A regra é uma árvore de grupos E/OU, com condições sobre:
- campos padrão e custom do contato, da empresa e do negócio;
- tags;
- lifecycle e pontuação;
- conversões: "converteu no ativo X", "em ativo de fundo de funil", "nos
  últimos N dias";
- engajamento: abriu, clicou, respondeu no WhatsApp;
- negócios: etapa, status, motivo de perda;
- pertencer ou não a outro segmento.

Um compilador no servidor transforma a regra em SQL parametrizado, só sobre
campos de uma lista permitida. O mesmo segmento serve para e-mail, WhatsApp,
entrada de fluxo e relatório. A campanha de WhatsApp troca os filtros próprios
pelo segmento.

### 4.6 E-mail

```
mkt_email_modelos     id, nome, tipo (massa|nominal), assunto, preheader, html, texto,
                      remetente (marketing|dona_do_contato|usuario), topico_id
mkt_email_envios      id, modelo_id, segmento_id, status (rascunho|agendado|enviando|concluido|pausado),
                      agendado_em, lote_por_rodada, teste_ab jsonb
mkt_email_destinos    envio_id, contact_id, email, status (fila|enviado|entregue|aberto|clicou|
                      bounce|spam|suprimido|falhou), provider_id, enviado_em, erro
                      -- único (envio_id, contact_id): ninguém recebe duas vezes
mkt_topicos           tópicos de assinatura (novidades, eventos, conteúdo)
mkt_consentimentos    contact_id, topico_id, status (optin|optout), base_legal, origem, em, ip
mkt_supressoes        email, motivo (bounce|spam|descadastro|manual), em
```

### 4.7 Fluxos de automação

```
mkt_fluxos            id, nome, status (rascunho|ativo|pausado), gatilho jsonb, grafo jsonb,
                      reentrada (nunca|apos_n_dias|sempre), objetivo jsonb (sai ao atingir),
                      janela_envio (dias/horas úteis)
mkt_fluxo_inscricoes  id, fluxo_id, entidade, entidade_id, no_atual, status
                      (ativo|esperando|concluido|saiu|erro), proximo_em, entrou_em, contexto jsonb
mkt_fluxo_passos      inscricao_id, no, executado_em, resultado, erro   -- log auditável
```

---

## 5. Captação: o cano de entrada

Uma função, `registrarConversao(entrada)`, chamada por todas as origens:

1. **Normaliza.** E-mail em minúsculas, telefone em E.164 com `phone_key`, nome,
   empresa e domínio do e-mail corporativo. Também mapeia as respostas do
   formulário para os campos, pelo `campos_mapeados` do ativo.
2. **Identifica.** Procura o contato por e-mail, depois por `phone_key`, depois
   pelo visitante do site. Procura a empresa por domínio corporativo, depois
   CNPJ, depois nome normalizado. Caso duvidoso vai para `dedupe_candidates`,
   que já existe.
3. **Grava.**
   - Faz upsert do contato e da empresa, sem apagar o que já existe; a
     informação nova só preenche o que está vazio.
   - Insere em `mkt_conversoes` com chave de idempotência.
   - Na primeira conversão, preenche `primeira_origem`. Em toda conversão,
     atualiza `ultima_origem`.
4. **Avalia, nesta ordem:**
   1. tags automáticas do ativo;
   2. lifecycle, que sobe para `contato` ou `lead`;
   3. pontuação;
   4. **regra de passagem ao SDR** (seção 8);
   5. gatilhos de fluxo.

**Origens:**

| Origem | Como entra |
|---|---|
| Site, LP e blog | Script `grou.js` e formulários (seção 6), via `POST /api/public/mkt/conversao` com chave pública do ativo, proteção anti-bot (honeypot e Turnstile) e limite por IP. |
| Meta Lead Ads | O webhook atual passa a chamar `registrarConversao`. O Make e a planilha saem depois de 2 semanas em paralelo sem divergência. |
| Google Ads | Webhook de formulário de lead do Google Ads (`/api/public/google/leads`, com chave). O GCLID dos formulários do site vai para a conversão. |
| WhatsApp inbound | O webhook atual registra conversão no ativo "WhatsApp – número X" quando o contato é novo. Clique em anúncio para WhatsApp leva os dados do anúncio (referral). |
| Redes sociais e eventos | Importação CSV com ativo escolhido (etapa de funil, tags, consentimento). A planilha da Sales Sprint seria uma importação. |
| API e integrações | A mesma rota, com chave por integração (Calendly, plataforma de webinar, Sympla etc.). |
| RD (transição) | Webhook de conversão do RD para `registrarConversao`, até o desligamento. |

---

## 6. Site, landing pages e blog

Proposta: o Compass **não vira um construtor de sites**. Site, LPs e blog
continuam onde a equipe já edita: o site atual, ou um construtor de LP como
Webflow ou Framer. O Compass oferece três peças que funcionam em qualquer
página:

1. **`grou.js`**, uma linha no `<head>`. Ele:
   - cria o visitante (cookie de primeira parte, 13 meses);
   - guarda UTMs, `gclid`, `fbclid`, `_fbc` e `_fbp` da primeira e da última
     visita;
   - registra visita de página;
   - preenche os campos ocultos dos formulários.

   Respeita o banner de cookies, porque rastreamento só começa com aceite (LGPD).
2. **Formulário embutível** do Compass, montado na tela do ativo: escolhe os
   campos, a etapa de funil, a mensagem de sucesso ou o redirecionamento e o
   consentimento. Também é possível manter o formulário próprio da página e
   apontar o envio para a API.
3. **Página de preferências e descadastro** hospedada pelo Compass
   (`/p/preferencias?t=…`).

Um construtor simples de LP dentro do Compass, com blocos, fica para uma fase
posterior, se fizer falta.

---

## 7. Segmentação e tags

- **Tela de segmentos:** construtor visual de regras (E/OU), com contagem ao
  vivo e amostra de 20 registros. Exporta CSV.
- **Dinâmico ou estático:**
  - o dinâmico é recalculado na hora de usar;
  - o estático congela a lista, para um evento ou uma importação.
- **Tags:** em massa, a partir de um segmento ou de uma seleção. Também pelos
  fluxos e pela importação.
- **Campos custom:** criados pela tela. Aparecem no cadastro do contato e da
  empresa, nos segmentos e nas variáveis de e-mail.

---

## 8. Passagem ao SDR (contato → lead → card)

É o ponto que mais importa para o comercial. Hoje é o fluxo "SDR 3" do RD.

**Quando o contato vira lead (MQL),** em qualquer um destes casos:
1. converteu em ativo com `regra_passagem = sempre`, que é o fundo de funil:
   pedido de demo, orçamento, "falar com especialista";
2. a pontuação passou do limite (perfil e engajamento), em ativo com
   `regra_passagem = por_pontuacao`;
3. um fluxo executou a ação "entregar ao SDR";
4. o marketing marcou manualmente.

**O que acontece:**
- Cria ou reativa o card em `leads`, com `contact_id`, `company_id`, ativo,
  conversão e origem. Não existe card de SDR sem contato.
- A roleta e a dona por tipo seguem como hoje: Camila/Lisiane, e Mariana para
  consultoria.
- A abertura de primeiro contato da IA no WhatsApp só sai neste caso, porque a
  pessoa pediu conversa.
- Começa o SLA do SDR, com os alertas que já existem.
- O lifecycle do contato passa a `lead`. Quando o SDR aceita, passa a `sql`. Na
  reunião, nasce o negócio e o lifecycle passa a `oportunidade`.

**Quando não vira lead:** conversão de topo e meio (material, webinar, rede
social, lista de evento) fica como **contato**. Entra em nutrição e não aparece
no kanban.

**Devolução do SDR ao marketing:** lead descartado com motivo "sem timing" ou
"sem perfil agora" volta para nutrição. O lifecycle passa a `contato`, ganha
tag e entra num fluxo.

---

## 9. E-mail

**Infraestrutura:**
- **Provedor:** Resend, que já é usado, em subdomínio só para marketing, como
  `mail.grougp.com.br`, com SPF, DKIM e DMARC. Se o marketing tiver problema de
  reputação, os e-mails transacionais e os do CS continuam chegando.
- **Aquecimento:** começa com lotes pequenos e engajados.
- **Eventos:** o webhook da Resend grava em `mkt_eventos` e atualiza
  `mkt_email_destinos`. Bounce e spam vão para `mkt_supressoes` na hora.
- **Descadastro:** link em todo e-mail de massa e cabeçalho `List-Unsubscribe`
  de um clique.

**E-mail em massa:**
- Editor de blocos com variáveis do contato, da empresa e da dona, e prévia e
  teste para si.
- Teste A/B de assunto, com vencedor automático por abertura ou clique.
- Agendamento.
- **Envio em lotes por minuto,** com o mesmo padrão das campanhas de WhatsApp.

**E-mail nominal em massa:** sai da caixa da pessoa, como o SDR ou o executivo,
em texto simples e personalizado, e parece escrito à mão.
- **Envio:** pela conta Google da pessoa (OAuth do Gmail). As integrações por
  usuário do CS (`cs_user_integrations`) já seguem esse caminho.
- **Ritmo:** limite diário por caixa e intervalo aleatório entre envios.
- **Respostas:** a resposta cai na caixa da pessoa e é espelhada como evento
  "respondeu".

**Regras que o envio sempre aplica:** a lista de supressão, os opt-outs do
tópico, o limite de frequência ("no máximo N e-mails de marketing por contato
por semana") e a remoção de duplicados.

---

## 10. Fluxos de automação

**Gatilhos:**
- converteu em ativo;
- entrou ou saiu de segmento;
- ganhou ou perdeu tag;
- campo mudou;
- lifecycle mudou;
- negócio mudou de etapa, foi ganho ou foi perdido;
- data relativa, como aniversário de cliente ou X dias antes do vencimento;
- respondeu no WhatsApp; abriu ou clicou e-mail;
- manual: inscrever um segmento.

**Nós:**

| Tipo | Nós |
|---|---|
| Espera | X tempo; até dia ou hora útil; até evento, com prazo |
| Condição | divisão por regra de segmento, ou teste A/B |
| Ação: mensagem | enviar e-mail (massa ou nominal); enviar template de WhatsApp |
| Ação: dados | adicionar ou remover tag; mudar campo; mudar lifecycle; somar pontuação |
| Ação: pessoas | entregar ao SDR; criar tarefa; avisar usuário (notificação, WhatsApp interno) |
| Ação: negócio e integração | mover negócio; chamar webhook |
| Saída | objetivo atingido, por exemplo "virou lead" ou "agendou reunião" |

**Execução:**
- Um worker roda a cada minuto, pela agenda do banco, como as rotinas atuais.
- Ele pega as inscrições com `proximo_em <= agora`, em lotes, e marca o passo
  antes de executar a ação.
- Cada passo fica em `mkt_fluxo_passos`.
- Erro de envio não trava o fluxo: tenta de novo com espera crescente e depois
  vai para `erro`, com alerta.

**Proteções:**
- reentrada configurável;
- limite de frequência global;
- janela de envio;
- pausar o fluxo pausa os envios na hora;
- prévia de "quantos entrariam agora" antes de ativar.

As automações de WhatsApp e as FUPs atuais continuam funcionando. Elas migram
para fluxos aos poucos, sem pressa.

---

## 11. Pontuação, atribuição e relatórios

- **Pontuação de perfil:** o ICP que já existe (cargo, porte, segmento,
  e-mail corporativo).
- **Pontuação de engajamento:** pontos por evento (conversão de fundo de funil,
  clique, visita à página de preço) com decaimento semanal.
- **Atribuição:**
  - primeira e última origem em cada contato;
  - por conversão, o caminho completo;
  - modelo padrão: primeiro toque para geração de contato e último toque antes
    do lead para geração de lead.
- **Funil por canal, campanha e ativo:**
  `visitantes → contatos → leads → aceitos pelo SDR → reuniões → oportunidades → vendas`,
  com custo do Meta e do Google para CPL, custo por reunião e CAC.
- **Conversões offline:** o Compass devolve ao Meta (Conversions API) e ao
  Google Ads (conversões offline e conversões otimizadas) os eventos "lead
  qualificado", "reunião realizada" e "venda". Assim as campanhas otimizam para
  reunião, não para formulário preenchido.
- **Saúde:** painel com última conversão por ativo, alarme de silêncio, taxa de
  bounce e de spam, fila de envio e fluxos com erro.

---

## 12. Migração do RD Station Marketing

| Fase | O que acontece | Critério para seguir |
|---|---|---|
| A. Espelho | Importar do RD os contatos, o histórico de conversões, as tags e os opt-outs (`rd_contacts.raw` já guarda parte). Registrar os ativos com etapa de funil. | Contagens batem por mês. |
| B. Paralelo | O cano de entrada recebe Meta e site junto com o RD. Comparar diariamente quem virou lead nos dois. | 2 semanas sem divergência. |
| C. Passagem | A passagem ao SDR passa a ser do Compass. Desligar o fluxo "SDR 3" do RD e o Make/planilha. | SLA e volume de leads iguais ou melhores. |
| D. E-mail e fluxos | Recriar as nutrições e os envios. Aquecer o domínio. | Entregabilidade estável. |
| E. Desligar | Formulários do RD fora do ar. Exportação final. | — |

---

## 13. LGPD e segurança

- **Consentimento:** registrado por tópico, com base legal (consentimento ou
  legítimo interesse documentado), origem, data e IP.
- **Direitos do titular:** exportar e apagar o contato, com anonimização que
  mantém as contagens.
- **Rotas públicas:** chave por ativo ou integração, limite por IP, anti-bot e
  assinatura nos webhooks (Meta e Resend), como o webhook do Meta já faz.
- **Permissões:** papel `marketing` (cria ativos, segmentos, e-mails e fluxos).
  Disparo acima de N contatos pede aprovação de gestor.
- **Segredos:** chaves de Resend, Meta e Google ficam só nos segredos do
  servidor, nunca no navegador nem no chat.

---

## 14. Fases de construção

| Fase | Entrega | Depende de |
|---|---|---|
| **1. Base e captação** | Colunas novas em contato e empresa, `mkt_ativos`, `mkt_conversoes`, `registrarConversao`, webhook do Meta pelo cano, tela de ativos com alarme de silêncio, linha do tempo de conversões no contato. | — |
| **2. Passagem ao SDR** | Regra por ativo e por pontuação de perfil, devolução para nutrição, painel "contatos → leads" por dia. Paralelo com o RD. | 1 |
| **3. Tags, campos e segmentos** | `mkt_tags`, `mkt_campos`, construtor de segmentos, importação CSV com ativo, campanha de WhatsApp por segmento. | 1 |
| **4. Site** | `grou.js`, formulário embutível, visitantes e páginas, Google Ads leads, página de preferências. | 1 |
| **5. E-mail** | Domínio, modelos, envio em massa em lotes, eventos, supressão, consentimento. Depois, o nominal pelo Gmail. | 3 |
| **6. Fluxos** | Motor, editor visual e os gatilhos e ações acima. | 3, 5 |
| **7. Medição** | Pontuação de engajamento, atribuição, funil com custo, conversões offline para Meta e Google. | 2, 4 |
| **8. Desligar o RD** | Fases C a E da migração. | 2, 5, 6 |

As fases 1 e 2 sozinhas já tiram a dependência do fluxo do RD e do Make para os
leads chegarem ao SDR, que é onde as falhas de outubro aconteceram.

---

## 15. Decisões em aberto

1. **Onde ficam as LPs e o blog:** no site atual, em construtor externo
   (Webflow ou Framer) ou num construtor dentro do Compass?
2. **E-mail nominal:** vale começar só com o Gmail de SDRs e executivos?
   Exige OAuth de cada pessoa.
3. **Limite de pontuação para MQL:** começar só com "fundo de funil = lead" e
   ligar a pontuação depois de 1 mês de dados?
4. **Base legal do e-mail de marketing** para a base atual, que veio do RD:
   consentimento existente, ou legítimo interesse com opt-out?
5. **Quem aprova disparos grandes,** e a partir de quantos contatos.
