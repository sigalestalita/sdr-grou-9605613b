# CRM GROU

Crie um sistema interno para acelerar a qualificação de leads inbound e organizar o trabalho de SDR em formato Kanban.

Contexto:

Hoje recebemos leads inbound vindos de formulários nativos do Meta Ads, site e outros canais. Esses leads entram no RD Station CRM no funil “Leads - Empresas”. Atualmente o SDR precisa pesquisar manualmente informações sobre a pessoa, empresa, LinkedIn, site, origem da conversão e contexto do anúncio/campanha antes de abordar o lead no WhatsApp. Perdemos 1 SDR e agora precisamos tornar esse processo mais rápido, visual e automatizado.

Objetivo do sistema:

Criar uma plataforma integrada ao RD Station CRM que funcione como uma central de qualificação de leads inbound, com visão Kanban e cards individuais enriquecidos automaticamente com dados do lead, empresa e contexto de conversão.

Funcionalidades principais:

1. Integração com RD Station CRM

- Buscar automaticamente todos os leads do funil “Leads - Empresas”.

- Sincronizar informações básicas do lead:

  - Nome

  - Email

  - Telefone/WhatsApp

  - Empresa

  - Cargo

  - Origem

  - Canal de conversão

  - Campanha

  - Anúncio

  - Formulário preenchido

  - Data e horário da conversão

  - Status atual no CRM

  - Responsável pelo lead

- Atualizar o status do lead no sistema e, quando possível, refletir essa atualização no RD CRM.

2. Visão Kanban

Criar um Kanban com etapas configuráveis, inicialmente:

- Novo lead

- Enriquecendo dados

- Pronto para abordagem

- Abordado

- Em qualificação

- Aguardando retorno

- Agendado

- Desqualificado

- Perdido

- Enviado para comercial

Cada card deve representar um lead individual.

3. Card completo do lead

Ao clicar em um lead, abrir uma página ou modal com:

- Dados pessoais do lead

- Dados da empresa

- Origem da conversão

- Campanha/anúncio/formulário de origem

- Histórico de interações

- Status no funil

- Próxima ação recomendada

- Botão para abrir conversa no WhatsApp

- Botão para abrir perfil do LinkedIn da pessoa

- Botão para abrir LinkedIn da empresa

- Botão para abrir site da empresa

- Campo de observações internas

- Campo para registrar resultado da abordagem

4. Enriquecimento automático de dados

Ao receber um novo lead, o sistema deve tentar buscar automaticamente:

- Site da empresa

- Descrição da empresa

- Segmento de atuação

- Tamanho estimado da empresa

- Localização

- LinkedIn da empresa

- LinkedIn da pessoa

- Cargo atual da pessoa

- Possíveis sinais de ICP

- Breve resumo da empresa

- Possíveis dores relacionadas ao nosso serviço

Importante:

Se não for possível buscar automaticamente algum dado, o sistema deve marcar como “não encontrado” e permitir edição manual.

5. ICP e priorização

Criar um score simples de prioridade do lead com base em critérios como:

- Empresa B2B

- Tamanho da empresa

- Segmento aderente

- Cargo do lead

- Origem/campanha de conversão

- Compatibilidade com nosso ICP

- Urgência ou intenção demonstrada no formulário

Classificar os leads como:

- Alta prioridade

- Média prioridade

- Baixa prioridade

- Fora de ICP

Exibir essa classificação visualmente no card e permitir filtro por prioridade.

6. Sugestão de abordagem

Com base nos dados enriquecidos, o sistema deve gerar uma sugestão de mensagem inicial para o SDR enviar no WhatsApp.

A mensagem deve considerar:

- Nome do lead

- Empresa

- Contexto da conversão

- Campanha/anúncio de origem

- Possível dor da empresa

- Tom consultivo, humano e direto

- Sem parecer mensagem genérica ou robótica

Exemplo de estrutura:

“Oi, [Nome], tudo bem? Vi que você demonstrou interesse em [tema da campanha/formulário]. Dei uma olhada rápida na [Empresa] e imaginei que talvez o desafio de vocês esteja relacionado a [dor provável]. Faz sentido conversarmos rapidamente para entender se conseguimos ajudar?”

7. Filtros e busca

Criar filtros por:

- Data de entrada

- Origem

- Campanha

- Anúncio

- Status

- Prioridade

- Responsável

- Segmento

- Tamanho da empresa

- Leads sem abordagem

- Leads aguardando retorno

- Leads de alta prioridade

Também criar busca por nome, empresa, email ou telefone.

8. Dashboard

Criar uma tela de indicadores com:

- Total de leads recebidos

- Leads novos

- Leads abordados

- Leads qualificados

- Leads agendados

- Leads desqualificados

- Tempo médio até primeira abordagem

- Taxa de conversão de lead para agenda

- Volume de leads por origem/campanha

- Performance por status do Kanban

- Leads parados há mais de X dias

9. Alertas e SLA

Criar alertas para:

- Lead novo ainda não abordado após X minutos/horas

- Lead de alta prioridade sem ação

- Lead aguardando retorno há muitos dias

- Lead parado em uma etapa do Kanban

10. Permissões

Criar perfis de usuário:

- Admin: vê tudo, configura integrações, etapas e critérios de ICP

- SDR: vê e movimenta leads, edita observações e registra interações

- Gestor: vê dashboard, produtividade e funil

11. Configurações

Permitir configurar:

- Etapas do Kanban

- Critérios de ICP

- Pesos do score

- Campos obrigatórios

- Modelos de mensagem

- SLA de atendimento

- Integração com RD Station CRM

- Campos personalizados do RD

12. Requisitos técnicos

- Interface limpa, rápida e responsiva.

- Usar Supabase como banco de dados.

- Criar estrutura segura com autenticação.

- Criar tabelas para leads, empresas, interações, usuários, status, configurações de ICP e logs de integração.

- Preparar arquitetura para integrações futuras com APIs externas de enriquecimento de dados.

- O sistema deve evitar duplicidade de leads.

- Registrar data de criação, atualização e última ação em cada lead.

13. Importante sobre enriquecimento

Caso não seja possível buscar dados reais da internet diretamente dentro do Lovable, estruturar o sistema para:

- Ter campos preparados para receber esses dados via API externa.

- Criar botão “enriquecer lead”.

- Criar status “dados pendentes”, “dados encontrados” e “dados não encontrados”.

- Permitir integração futura com ferramentas como SerpAPI, Google Custom Search, LinkedIn scraping/API autorizada, Clearbit, Apollo, Clay, PhantomBuster ou similares.

Resultado esperado:

Um sistema interno que reduza o tempo manual do SDR, centralize todos os leads inbound em uma visão Kanban, traga contexto de conversão e enriquecimento de dados, priorize leads por ICP e ajude o SDR a abordar cada lead com mais velocidade e personalização.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sdr-grou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/773e2ce3-3b97-4224-ac14-c22657fc102a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
