/*
 * Guia de uso do Grou Compass. Alimenta o prompt do assistente de IA flutuante:
 * uma entrada por tela (do menu e as principais fora dele), descrevendo o que
 * existe de fato no código, com os rótulos que aparecem na tela.
 */

export type TelaDoGuia = { rota: string; nome: string; area: string; texto: string };

export const TELAS: TelaDoGuia[] = [
  // ───────────── Geral ─────────────
  {
    rota: "/inicio",
    nome: "Início",
    area: "Geral",
    texto: `Página inicial de todos, montada conforme o time e o papel de quem entra. SDR vê "Minhas métricas" (leads novos, agendas marcadas, SLA 1º toque, enviados ao comercial, desqualificados, mensagens WhatsApp), "Próximas reuniões" e o "Ranking do mês". Executivo comercial vê "Agendas marcadas para mim", a carteira comercial e as tarefas pendentes. CS vê Tarefas (com botão "Concluir"), Contatos da cadência, Alertas da minha carteira e o Feed de atividades. A gestão vê os blocos de cada time (SDR, Comercial com meta do mês e top vendedor, Customer Success) e pode trocar o período analisado.`,
  },
  {
    rota: "Ctrl/⌘K",
    nome: "Encontrar ou perguntar (busca global)",
    area: "Geral",
    texto: `Barra no topo de todas as telas ("Encontrar ou perguntar", ou "Buscar" no celular); também abre com Ctrl+K (⌘K no Mac). Digite ao menos duas letras para buscar no banco: os resultados vêm agrupados em Empresas, Clientes do CS e Leads, e Enter abre o registro. A mesma caixa lista as páginas do menu que você pode acessar, para navegar sem usar a barra lateral.`,
  },

  // ───────────── Comercial / SDR ─────────────
  {
    rota: "/dashboard",
    nome: "Visão geral (SDR)",
    area: "Comercial",
    texto: `Painel do time de SDR. Mostra novos leads, em contato, aguardando retorno, agenda marcada, parados há mais de 3 dias, total, em qualificação, desqualificados, conversão lead → agenda e tempo médio da 1ª abordagem. Tem "Funil de evolução", distribuição "Por etapa" e "Por origem", "Gestão do atendimento" (leads tocados, cards abertos, mudanças de etapa e tempos lead → abertura → etapa) e distribuição por prioridade ICP. Use "Filtrar por SDR" para ver uma pessoa ou "Todos os SDRs". Usado pelo time comercial/SDR e pela gestão.`,
  },
  {
    rota: "/kanban",
    nome: "Pipeline (SDR)",
    area: "Comercial",
    texto: `Kanban de leads do SDR, com visões "Empresas & PF" e "Consultorias". Arraste o card entre etapas; ao mover para desqualificado, o sistema pede o "Motivo de desqualificação" (e pode bloquear descarte antes do mínimo de touches). Botões no topo: "Novo lead" (cadastro manual), "Sincronizar RD", "Exportar" (CSV da lista filtrada) e "Filtros", com busca por nome, email ou empresa e filtros de prioridade, porte, responsável, Demo Free, tipo de lead, interesse em Certificação, anúncio, origem, alertas de cadência e motivo de descarte ("Limpar filtros" zera tudo). No card há atalhos para ver/registrar touches, marcar follow-up como feito, abrir o chat no WhatsApp, alterar a data da reunião e escolher o executivo que fará a reunião (mostra se ele está livre no horário). O SLA de primeiro atendimento é de 15 minutos da conversão até o primeiro touch. Clique no card para abrir a página do lead.`,
  },
  {
    rota: "/lead/$id",
    nome: "Página do lead",
    area: "Comercial",
    texto: `Ficha completa de um lead, aberta pelo Pipeline, pela busca ou pelo WhatsApp. No topo: "Voltar para o pipeline", "Mover para etapa", "Avançar", "Recalcular score" e "WhatsApp"; se o lead estiver fora do kanban aparece "Trazer para o kanban". A aba "Histórico" mostra dados de identificação, detalhes, empresa e atividades do lead (com "Abrir negócio" quando houver). A aba "Qualificação e atendimento" traz a passagem para o executivo ("Passar para o executivo", que cria o negócio e avisa o executivo), "Pesquisa rápida para abordagem" com "Enriquecer com IA" e links de LinkedIn/site, "Dados do lead" editáveis (responsável, tipo, Demo Free, motivo de descarte), contexto de conversão (origem, campanha, anúncio, formulário), jornada de cadência (Pausar, Retomar, Reiniciar), "Qualificação BANT" (obrigatória antes da passagem de bastão), "Sequência de Touches" ("Adicionar Touch", "Agendar follow-up"), sugestão de abordagem por IA ("Copiar", "Enviar no WhatsApp"), conversa de WhatsApp e "Observações internas".`,
  },
  {
    rota: "/whatsapp",
    nome: "WhatsApp — Inbox (Caixa de entrada)",
    area: "Comercial",
    texto: `Caixa de entrada das conversas de WhatsApp; aparece como "WhatsApp" no menu do SDR e "Caixa de entrada" no do CS. As abas no topo levam a Métricas, Templates, Campanhas, Custos, IA, Ensaio da IA, Automações, FUPs, Alertas e Contas. Filtre por status (Abertas, Pendentes, Fechadas), Minhas, Sem atribuição, Fila geral, número e "Somente não lidas", ou busque lead, empresa ou mensagem. Conversas transferidas pela IA para você aparecem como pendentes; é possível assumir a conversa. Na conversa: "Enviar template" (único jeito de escrever com a janela de 24h fechada), anexar arquivo, "Sugerir resposta com IA", "Resumo da conversa", temperatura do lead e "Plano" de próximos passos. O painel lateral mostra e edita os dados do lead e tem "Abrir lead".`,
  },
  {
    rota: "/whatsapp/metricas",
    nome: "WhatsApp — Métricas",
    area: "Comercial",
    texto: `Números do WhatsApp nos últimos 7, 30 ou 90 dias: conversas ativas e novas, mensagens enviadas e recebidas, taxas de entrega e leitura e resposta média por responsável. Mostra o volume diário (enviadas vs recebidas), a temperatura dos leads (quente, morno, frio), as automações no período (execuções e puladas), o desempenho por responsável e as campanhas do período com entregues, lidas e falhas.`,
  },
  {
    rota: "/whatsapp/templates",
    nome: "WhatsApp — Templates",
    area: "Comercial",
    texto: `Cadastro dos templates de mensagem (HSM) aprovados pela Meta, os únicos que podem abrir conversa fora da janela de 24h. "Novo template" define nome interno, categoria (Utility, Marketing, Autenticação), idioma, corpo com variáveis como {{primeiro_nome}} e {{empresa}}, imagem no topo e botões (resposta rápida, abrir URL, ligar); depois use "Enviar p/ Meta" para aprovação. "Sincronizar Meta" atualiza o status dos templates. Há busca por nome, HSM ou trecho da mensagem.`,
  },
  {
    rota: "/whatsapp/campanhas",
    nome: "WhatsApp — Campanhas em massa",
    area: "Comercial",
    texto: `Dispara um template para audiências segmentadas de leads. Em "Nova campanha" escolha nome, template e a audiência: período de entrada no Kanban, estágios, prioridade, Demo Free, tipo de lead e motivo de desqualificação (bom para reengajar descartados). Também dá para subir um CSV ("Upload CSV") ou colar números, excluir domínios ou contatos do disparo e decidir se cria lead no Compass ("Não criar", "Criar no disparo", "Só quando responder"). Abrindo uma campanha você vê o andamento dos envios.`,
  },
  {
    rota: "/whatsapp/custos",
    nome: "WhatsApp — Custos",
    area: "Comercial",
    texto: `Custos da mensageria da Meta. Mostra volume e custo por mês, mensagens grátis dentro da janela de 24h e quem mais dispara (por template e categoria). A "Tabela de preços" guarda o valor unitário em dólar por categoria e a cotação US$ → R$; o valor em real é estimativa, não fatura.`,
  },
  {
    rota: "/whatsapp/ia",
    nome: "WhatsApp — IA de atendimento",
    area: "Comercial",
    texto: `Configura a IA que atende leads no WhatsApp. Em "Ativação": "IA habilitada", "Responder automaticamente", "Disparo inicial proativo" com o "Template HSM inicial", "Parar após resposta do lead" e o máximo de respostas automáticas por conversa. Também define as "Ofertas que a IA pode citar" (com validade), o nome com que a IA assina, o corte de porte (acima dele vai direto ao responsável), o atendimento de consultorias e para quem vai o bastão, roteamento por conta de WhatsApp, o prompt operacional (objetivo, tom, regras, handoff, base de conhecimento) e as etapas de handoff. "Teste manual" dispara o template inicial para um número; salve antes de testar.`,
  },
  {
    rota: "/whatsapp/playground",
    nome: "WhatsApp — Ensaio da IA",
    area: "Comercial",
    texto: `Simulador para conversar com a IA como se fosse um lead, sem enviar nada de verdade. Escolha tipo de lead, porte, se já é cliente Grou e o SDR responsável; o painel "O que vale para este perfil" mostra se a IA atende ou passa para humano desde o início, como assina e quais ofertas cita. Escreva como o lead e veja as respostas e quando ela "passou o bastão"; "Recomeçar" zera a conversa.`,
  },
  {
    rota: "/whatsapp/automacoes",
    nome: "WhatsApp — Automações",
    area: "Comercial",
    texto: `Duas partes. "Distribuição de atendimento": atribuição fixa do lead na entrada por tipo (Empresa, Consultoria, Pessoa física), com "Ativar roteamento" e fallback para a fila geral. "Automações": regras que disparam templates automaticamente, rodando a cada minuto; "Nova regra" define gatilho (ex.: horas sem resposta, estágio, minutos antes da reunião), template, conta de WhatsApp e se está ativa. O "Histórico de execuções" mostra quando, regra, lead e status.`,
  },
  {
    rota: "/whatsapp/fups",
    nome: "WhatsApp — FUPs",
    area: "Comercial",
    texto: `Cadências automáticas de follow-up por WhatsApp. "Novo FUP" define nome, conta de WhatsApp, gatilho de entrada (etapa de entrada ou horas sem resposta), filtros de audiência (prioridade, tipo de lead, porte, Demo Free), critérios de parada (quando o lead responder ou entrar em certas etapas) e os passos da cadência, cada um com seu template. Marque "Cadência ativa" para ligar.`,
  },
  {
    rota: "/whatsapp/alertas",
    nome: "WhatsApp — Alertas de lead quente",
    area: "Comercial",
    texto: `Log dos alertas de lead quente enviados ao responsável por e-mail e WhatsApp. Filtre por Todos, Enviados, Com erro ou Pulados e use "Atualizar"; cada linha mostra status, message ID e o payload completo.`,
  },
  {
    rota: "/whatsapp/contas",
    nome: "WhatsApp — Contas",
    area: "Comercial",
    texto: `Configuração dos números conectados à Meta WhatsApp Cloud API. "Nova conta" pede rótulo, WABA ID, token e de quem é o número (o inbox dessa pessoa já abre nele), além de marcar a conta padrão para envios. Cada conta mostra o Callback URL do webhook e tem ações como "Enviar teste", "Diagnosticar: por que não está recebendo?", assinar o app no WABA, importar agenda e histórico do celular, copiar os templates e "Registrar número na Cloud API" (com PIN de 6 dígitos; não usar em número de coexistência). Uso técnico/gestão.`,
  },
  {
    rota: "/agenda",
    nome: "Agenda de FUPs",
    area: "Comercial",
    texto: `Agenda de toques do SDR: os toques de hoje em ordem de urgência, a semana em uma linha por lead e o que ficou para trás. Os cartões no topo alternam entre Hoje, Semana (com "Semana anterior" e "Próxima semana") e Atrasados. Escolha "Minha agenda" ou "Todos os SDRs". Em cada toque: "Atender" (abre o lead) e "Copiar roteiro"; nos atrasados, "Retomar hoje" ou encerrar a cadência. Mostra o SLA de 15 minutos para leads novos.`,
  },
  {
    rota: "/cadencia",
    nome: "Cadência e Touches",
    area: "Comercial",
    texto: `Gestão operacional do processo do SDR: esforço, canais e follow-ups nos últimos 7, 15, 30 ou 90 dias. Mostra leads no período, touches registrados, touches até reunião e até descarte, follow-ups vencidos e agendados, leads sem touch, esquecidos e parados. Tem taxa de resposta por canal e por número do touch, desempenho por SDR e conversão por quantidade de touches. Em "Regras de cadência" ficam o mínimo de touches antes de descartar e os dias para considerar esquecido ou parado; só a gestão salva.`,
  },
  {
    rota: "/comercial",
    nome: "Visão geral (Comercial)",
    area: "Comercial",
    texto: `Painel do time de executivos. Filtre por executivo e por funil. Mostra em aberto, vendas ganhas, ticket médio e agendas; "Funil por etapa", "Esteira entre áreas" (depois da ordem de compra o cliente passa pelo ADM e então chega ao CS), "Metas e ritmo do time" ("Definir agora" se não houver meta), "Meus próximos passos" e "Sinalizações do CS" (oportunidades que o CS abriu, com "Abrir card" e "Assumir"). Usado por executivos e gestão.`,
  },
  {
    rota: "/comercial-pipeline",
    nome: "Pipeline de negócios",
    area: "Comercial",
    texto: `Kanban dos negócios do comercial, por funil e etapa. Escolha o funil e o executivo ("Todos os executivos"), use "Mostrar fechados"/"Ocultar fechados" e escolha quais etapas ficam visíveis. Clique no card para abrir a página do negócio, onde se muda a etapa e se registra venda ou perda. "Ver funil e metas" leva à visão geral do comercial. Usado por executivos e gestão.`,
  },
  {
    rota: "/negocio/$id",
    nome: "Página do negócio",
    area: "Comercial",
    texto: `Ficha de um negócio do comercial. No topo: "Voltar para o pipeline", "Registrar venda" e "Marcar perda" (pede motivo), e a etapa do funil. Registre contatos em "Registrar o que foi feito" com próximo passo e data; o "Histórico" guarda tudo. Em "Dados do negócio" ficam valor, temperatura, produtos e origem. "Itens da proposta" puxa itens do catálogo, descontos e impostos; em "Propostas" use "Gerar proposta", copie o link ou "Enviar por e-mail". Na venda informe ordem de compra, CNPJ, parcelas, forma e prazo de pagamento e quem recebe a nota. Também aparecem a política de faturamento do cliente, a ficha cadastral, o card "Faturamento" (pendências do ADM, "Pedir liberação das licenças PDA do negócio"), "Abrir requerimento de serviço", "Contrato" ("Pedir minuta / aditivo") e "Inscrever em turma".`,
  },
  {
    rota: "/carteira-comercial",
    nome: "Carteira comercial",
    area: "Comercial",
    texto: `Quadro das empresas clientes do comercial: a conta entra na primeira venda ganha, sem dono, e a gestão distribui. Filtre por dono ("Todos os donos", "Sem dono"), defina o dono de cada card e mova o card entre etapas ("Mover para…"). Venda nova para a conta nasce como negócio no funil de recompra/cross sell. Usado por executivos e gestão.`,
  },
  {
    rota: "/comercial-agenda",
    nome: "Agenda comercial",
    area: "Comercial",
    texto: `Reuniões dos executivos vindas da Google Agenda. Vincule sua agenda colando o endereço iCal (a gestão pode vincular por outras pessoas) e use "Sincronizar". Filtre por executivo, navegue entre dias com "Voltar para hoje" e, em cada reunião, use "Entrar", "Ver lead" ou "Ver negócio".`,
  },
  {
    rota: "/propostas",
    nome: "Propostas",
    area: "Comercial",
    texto: `Acompanhamento das propostas comerciais e cadastro dos modelos. A lista mostra empresa e negócio, modelo, valor e status; filtre por "Esperando o cliente" e "Aceitas". A proposta em si é gerada dentro do negócio, na seção "Propostas". Na parte de modelos: "Novo do zero", "Importar de print, arquivo ou texto", "Duplicar" e editar seções, itens do catálogo, prévia e versões anteriores; um modelo pode ser PADRÃO ou INATIVO.`,
  },
  {
    rota: "/proposta/$token",
    nome: "Página pública da proposta",
    area: "Comercial",
    texto: `Página que o cliente recebe por link, sem login. Mostra a proposta comercial da Grou com "Baixar PDF" e o "Aceite da proposta" (nome completo, cargo, e-mail e CPF opcional) ou "Não vou seguir" com "Confirmar recusa". Avisa quando a versão foi substituída ou a validade terminou. Quando quem enviou abre o link, aparece "Prévia de quem envia" e a visita não conta como abertura do cliente.`,
  },
  {
    rota: "/comercial-metas",
    nome: "Metas comerciais",
    area: "Comercial",
    texto: `Metas do mês. Define a "Meta mensal da empresa" (por faturamento), a meta do time e o ticket médio de referência. "Definir meta de alguém" escolhe a pessoa, a meta de valor e de quantidade (produto e serviço) e as micrometas de atividade (agendas, propostas, contatos). Só a gestão edita; os demais veem em somente leitura.`,
  },
  {
    rota: "/comissao",
    nome: "Comissão",
    area: "Comercial",
    texto: `Fechamento mensal de comissão dos executivos. Mostra por mês a meta de produto e serviço, super meta, Self Guru, resultado e situação. O ADM usa "Atualizar com o CRM", ajusta linhas (tipo, valor considerado, "Linha manual"), clica em "Enviar para o executivo aprovar" e depois "Fechar o mês". O executivo responde com "Aprovo" ou "Contestar" (com motivo). A "Regra" define faixas de atingimento e a meta Self Guru; venda sem tipo não entra até ser classificada. Usado pelo administrativo e pelos executivos.`,
  },

  // ───────────── CS ─────────────
  {
    rota: "/cs",
    nome: "Empresas",
    area: "CS",
    texto: `Carteira de empresas do Customer Success, em "Lista" ou "Funil". Visões prontas: Minha carteira, Vermelhos 5+ semanas, Renovação ≤ 60 d e Todas as empresas, com contagem por cor da sinaleira. Filtre por responsável CS, executivo, alertas, tags, tipo, etapa, uso do PDA e status, ou pesquise. Botões: "Adicionar empresa" ("Nova empresa", com roteamento automático do responsável), "Gerar alertas", "Exportar" e "Limpar". Clique na empresa para abrir a ficha. Usado pelo CS e por executivos.`,
  },
  {
    rota: "/empresas/$uid",
    nome: "Ficha da empresa (CS)",
    area: "CS",
    texto: `Registro completo de um cliente. À esquerda, "Sobre esta empresa" com etapa, responsável CS, executivo, tipo, uso do PDA, CNPJ, contrato, aporte, renovação e último contato ("Editar"), mais contatos, tags, empresas atendidas e alertas. No topo, "Registrar contato" e a "Sinaleira PDA · 8 semanas". Abas: Atividades, Reuniões ("Nova reunião"), Vendas ("Nova venda") e Registros. Há também "Saúde do cliente", "Oportunidade comercial" ("Sinalizar oportunidade", que vira card no funil do executivo), Masterclasses ("Oferecer agora", "Registrar"), Jornadas Reais (e-mails por marco), Tarefas e a política de faturamento.`,
  },
  {
    rota: "/cs-follow-ups",
    nome: "Tarefas",
    area: "CS",
    texto: `Tarefas e follow-ups do CS. Alterne entre "Minha agenda" e "Todo o time"; os indicadores mostram atrasados, pendentes e concluídos na semana. "Nova tarefa" escolhe empresa, tipo, título, prazo e responsável; algumas se concluem sozinhas pela evidência do canal (e-mail, WhatsApp, reunião aceita). Em cada item: "Concluído" (registra resultado e próximo follow-up) ou "Reagendar"; a gestão pode concluir sem o registro do canal, com justificativa. Usado pelo CS e por executivos.`,
  },
  {
    rota: "/jornada",
    nome: "Jornada do cliente",
    area: "CS",
    texto: `Linha do tempo de uma empresa do fechamento até o CS. "Escolha a empresa" e veja o ciclo de venda, o tempo do ADM até o CS, o valor fechado, a situação no CS e o briefing que o comercial deixou para o CS. Usado pelo CS e por executivos.`,
  },
  {
    rota: "/cs-emails",
    nome: "E-mails",
    area: "CS",
    texto: `E-mails do atendimento recebidos pelas caixas do time de CS (redirecionadas ao Compass). Busque por assunto, remetente ou trecho e filtre por pessoa ou "Todo o time". Se estiver vazio, use "Configurar redirecionamento", que leva às Integrações CS.`,
  },
  {
    rota: "/cs-agenda",
    nome: "Agenda (CS)",
    area: "CS",
    texto: `Reuniões do time de CS vindas das agendas vinculadas. Filtre por pessoa ou "Todo o time", navegue entre dias ("Voltar para hoje") e use "Entrar" para abrir o link da reunião. "Sincronizar" atualiza os eventos e "Vincular agenda" leva às Integrações CS.`,
  },
  {
    rota: "/cs-kanban",
    nome: "Kanban semanal (CS)",
    area: "CS",
    texto: `Kanban da cadência do CS: o que fazer com cada cliente em cada dia da semana, segundo o Playbook, com check por ação. Filtre por "Minha carteira" ou "Todos os analistas", por funil e por Empresas ou Consultorias, navegue entre semanas e busque cliente. Marcar o check conclui a ação.`,
  },
  {
    rota: "/cs-cadencia",
    nome: "Cadência e sinaleira (CS)",
    area: "CS",
    texto: `Cadência do Playbook Sinaleira GROU v2: quem precisa de contato agora, por que e em qual dia útil. Mostra clientes na carteira, contatos devidos, em carência e escaladas, e a "Distribuição sugerida da semana". Filtre por CS, cor da sinaleira e urgência (ex.: Só observar, Envolver Executivo, Revisão com diretoria) ou busque cliente; a lista mostra os 200 mais urgentes.`,
  },
  {
    rota: "/cs-consultorias",
    nome: "Consultorias",
    area: "CS",
    texto: `Acompanhamento de renovação das consultorias, que não entram na carteira de atendimento nem na sinaleira. Escolha a janela (15, 30 ou 60 dias para cada lado da data de renovação) e veja quem está para renovar.`,
  },
  {
    rota: "/cs-whatsapp",
    nome: "WhatsApp CS",
    area: "CS",
    texto: `Atendimento do CS pelo WhatsApp. Escolha uma conversa à esquerda (busque por cliente ou mensagem) e responda no painel da conversa, com templates, anexos e sugestão de resposta por IA. Há atalho para os Tickets.`,
  },
  {
    rota: "/cs-tickets",
    nome: "Tickets",
    area: "CS",
    texto: `Tickets de atendimento do CS, inclusive os abertos pela IA. Filtre por "Em aberto" ou "Todos" e por "Só os meus", e defina o responsável de cada ticket.`,
  },
  {
    rota: "/requerimentos",
    nome: "Requerimentos",
    area: "CS",
    texto: `Requerimentos de serviço (treinamentos, consultorias) abertos pelo comercial com "Abrir requerimento de serviço" no negócio ganho. Filtre por andamento ou "Só onde estou escalada". No requerimento: informações e contexto do cliente, serviço, formato (Online, Presencial), logística, "Trainers e cronograma" ("Escalar trainer", sessões com data e local), briefing de execução e "Conclusão da entrega", que a trainer escalada registra. Depois que o ADM pega o requerimento, só ele edita. Usado por CS, administrativo, trainers e executivos.`,
  },
  {
    rota: "/cs-integracoes",
    nome: "Integrações CS",
    area: "CS",
    texto: `Conexões de cada pessoa do CS: "Minha Google Agenda" (endereço iCal), Calendly, "Minha caixa de e-mail" (endereço de redirecionamento, com "Gerar novo"), "Meu link de reunião" e "Sincronizar todas as agendas". A gestão pode "Vincular em nome de" outra pessoa. Também importa os clientes do RD CRM ("Prévia") e mostra o "Status do time".`,
  },
  {
    rota: "/cs-configuracoes",
    nome: "Configurações CS",
    area: "CS",
    texto: `Parâmetros do playbook de CS, editáveis sem deploy; só a gestão salva. Inclui pesos e pontos por cor da sinaleira, exigência de evidência do canal para concluir tarefas (antecedência, retroativo, justificativa da gestão), regras de escalação ao gestor, quem assume cada cliente novo (roteamento por porte, consultoria, renovação), delegações de carteira (férias, afastamento) com "Delegar", jornadas e masterclasses.`,
  },

  // ───────────── Administrativo ─────────────
  {
    rota: "/faturamento",
    nome: "Faturamento",
    area: "Administrativo",
    texto: `Fila do ADM do ganho à nota e ao recebimento. Em cada negócio ganho, veja o que o comercial entregou e use "Conferido — liberar para faturar", "Devolver ao comercial" (com a pendência) ou "Registrar nota" (número, emissão, CNPJ, valor bruto, retenções, parcelas); depois "marcar recebida hoje", "Desfazer recebimento" ou "Cancelar nota". Também há as licenças PDA pedidas pelo comercial ("Solicitei à PDA", liberada), os pedidos de contrato e o relatório do mês por executivo com "Exportar CSV".`,
  },
  {
    rota: "/turmas",
    nome: "Turmas",
    area: "Administrativo",
    texto: `Turmas de treinamento: inscrição pelo negócio, aprovação do ADM dentro das vagas e check-in da trainer. "Nova turma" define nome, serviço do catálogo, trainer, datas, vagas, formato, horário, local e situação. Na turma, a lista de inscritos permite aprovar, recusar, cancelar e fazer check-in; o comercial inscreve pelo negócio ("Inscrever em turma"). Usado pelo administrativo, trainers e executivos.`,
  },
  {
    rota: "/catalogo",
    nome: "Catálogo",
    area: "Administrativo",
    texto: `Tabela de preços por marca e tipo. O tipo (Produto ou Serviço) decide em qual meta o item conta. Filtre por marca e tipo ou busque; "Novo item" e "Editar" definem nome, marca, tipo, subcategoria, preço de tabela, parcelamento e descrição. Os itens alimentam os itens e propostas dos negócios.`,
  },

  // ───────────── BI ─────────────
  {
    rota: "/email-marketing",
    nome: "E-mail marketing",
    area: "Marketing",
    texto: `Campanhas de e-mail para a base (leads do kanban e a base de marketing vinda do RD). Aba "Segmentações": monte quem recebe com regras (base, origem, tipo de lead, etapa, prioridade, responsável, cliente ou não, sinaleira, evento de conversão, datas, domínio do e-mail); a contagem e uma amostra aparecem na hora; "Salvar". Aba "Campanhas": "Nova campanha", escolha a segmentação, o remetente (@grougp.com.br), escreva assunto e corpo (texto simples: # título, - lista, **negrito**, [texto](link), [[Texto do botão|link]], {{primeiro_nome|tudo bem}}, {{empresa}}) ou peça "Escrever com IA"; a prévia mostra o e-mail. "Enviar teste" manda para você; "Enviar agora" ou "Agendar" disparam. O envio sai em lotes e respeita o limite diário (no plano gratuito do Resend, 100 por dia; o resto segue nos dias seguintes); "Pausar"/"Retomar"/"Cancelar". Depois do envio, a campanha mostra enviados, aberturas, cliques e descadastros, e o histórico de cada lead registra "Recebeu/Abriu/Clicou no e-mail". Todo e-mail tem link de descadastro; quem sai fica na aba "Descadastros" (dá para incluir e-mails à mão) e não recebe mais nenhuma campanha.`,
  },
  {
    rota: "/relatorios",
    nome: "Relatórios",
    area: "BI",
    texto: `Construtor de relatórios personalizados, para todos os times. Escreva o que quer no campo de texto (ex.: "vendas ganhas por executivo por mês em 2026") e clique em "Montar": a IA escolhe a base (Negócios, Leads, Carteira do CS ou Propostas), os agrupamentos, as métricas, o período e o gráfico. Depois dá para pedir ajustes no mesmo campo ("Ajustar") ou mudar à mão: "Base", "Agrupar por", "E depois por", "Métricas (até 3)", "Período por" com "De"/"Até", "Gráfico" e "+ Adicionar filtro"; clique em "Atualizar" para recalcular. "Salvar relatório" guarda a definição com um nome; marque "Compartilhar com todos" para os outros verem (os números sempre respeitam o acesso de quem abre). "Exportar CSV" baixa a tabela. Os salvos ficam na coluna da esquerda; "Novo relatório" começa do zero.`,
  },
  {
    rota: "/leads-analytics",
    nome: "Performance SDR",
    area: "BI",
    texto: `Analytics de leads: perfil de quem entra, campanhas e anúncios com mais volume e conversão no funil por origem. Escolha o período (7 a 180 dias) e a dimensão (tipo de lead, prioridade, segmento, porte, localização, fonte, campanha, anúncio). Mostra leads, contatados, reuniões, quentes, ganhos, perdidos, win % e score médio, volume diário, funil atual, razões de perda e a tabela de performance por dimensão.`,
  },
  {
    rota: "/funil-sdr",
    nome: "Funil SDR (RD)",
    area: "BI",
    texto: `Números do RD Station do dia corrente (o relatório do RD só atualiza de madrugada). Mostra as negociações criadas no período por responsável no RD: criadas, em andamento, vendidas e perdidas, e onde estão hoje por etapa. Destaca negociações no nome de quem está fora do rodízio, que somem do relatório da SDR.`,
  },
  {
    rota: "/comercial-analise",
    nome: "Análise comercial",
    area: "BI",
    texto: `Como as vendas evoluem, onde o funil trava, de onde vem o que fecha e por que se perde. Filtre por pessoa ("Todo o time"), funil e período (6, 12 ou 24 meses). Mostra valor ganho, ticket médio, taxa de vitória, ciclo de venda, em aberto e perdas.`,
  },
  {
    rota: "/cs-dashboard",
    nome: "Dashboard CS",
    area: "BI",
    texto: `Visão da gestão sobre a carteira de CS (exclusivo da gestão). Período de 7, 30 ou 90 dias e "Atualizar". Mostra clientes ativos, health médio, alertas abertos, aporte, reuniões, interações, follow-ups pendentes, renovações em 60 dias, escalações, tarefas e cadência cumprida. Tem atividade do time por dia, "Desempenho por liderado de CS" (ordenável) e o painel de escalações ("Reatribuir", "Reabrir", "Ciência", "Enviar e-mail agora").`,
  },
  {
    rota: "/campanhas",
    nome: "Campanhas Meta",
    area: "BI",
    texto: `Desempenho das campanhas de Meta Ads (só gestão). Mostra investimento e leads por dia e, por campanha e anúncio: orçamento, investimento, CTR, leads na Meta, custo por lead, leads no Compass, reuniões, descartados e custo por reunião. Dá para ver só as ativas ou com investimento no período.`,
  },
  {
    rota: "/analytics-chat",
    nome: "Chat Analytics",
    area: "BI",
    texto: `Chat com IA para perguntar sobre os dados de leads, campanhas, conversão e perfil. Clique em "Nova conversa", escreva a pergunta (Enter envia, Shift+Enter quebra linha) ou use uma das sugestões. As conversas ficam salvas na lista e podem ser apagadas.`,
  },

  // ───────────── Administração ─────────────
  {
    rota: "/usuarios",
    nome: "Usuários",
    area: "Administração",
    texto: `Usuários e times (só gestão; só super admin edita). "Novo usuário" cria a conta já confirmada; sem senha, a pessoa recebe e-mail para definir a dela. Para cada pessoa, marque os times e tipos de acesso, "Caixa privada" (conversas atribuídas a ela não aparecem para os outros), "Senha" e "Remover". "Novo time" define nome, descrição, módulo do sistema, cor e se está ativo.`,
  },
  {
    rota: "/configuracoes",
    nome: "Configurações",
    area: "Administração",
    texto: `Configurações do sistema (só gestão). Inclui atalho para "Gerenciar usuários", conexão com o RD Station CRM ("Conectar ao RD Station", "Testar conexão", janelas de sync, importar atividades e notas), webhook de leads do Meta Ads direto no kanban, planilha de entrada, logs de sincronização, template de mensagem WhatsApp, SLA (minutos para primeira abordagem e dias para considerar parado), pesos e faixas do ICP ("Salvar ICP") e etapas do Kanban.`,
  },
  {
    rota: "/migracao-rd",
    nome: "Migração do RD",
    area: "Administração",
    texto: `Ferramenta da gestão para trazer o RD Station para o Compass. Mostra funil a funil o que vira negócio (abertos, ganhos, perdidos, esperados, no CRM), vendas ganhas por ano e os donos no RD (com regras de dono). Tem o espelho e transformação de empresas, contatos e negócios, o histórico dos negócios, a importação da base de marketing do RD por CSV (fica fora do kanban de SDR) e a conexão com a API do RD Marketing. Processos longos têm "Parar" e podem ser retomados.`,
  },
  {
    rota: "/playbook",
    nome: "Playbook SDR",
    area: "Administração",
    texto: `Referência do processo de pré-vendas inbound: jornada do lead por etapa (objetivo e gatilho para avançar), cadências multicanais por porte, filtro BANT, contorno de objeções, formatos de abordagem, motivos de descarte padronizados, materiais de apoio e metas (reuniões/mês, meta por SDR, SLA do 1º atendimento). Leitura para o time comercial/SDR.`,
  },
  {
    rota: "/cs-playbook",
    nome: "Playbook CS",
    area: "Administração",
    texto: `Playbook da Sinaleira GROU v2: lógica de cadência, condução por cor, ofertas e modelos de contato, organizados em blocos (Gatilhos e cadência, Playbooks de condução, Ofertas e conteúdos, Modelos de contato). Busque, filtre por tipo e cor e, se tiver permissão, crie ("Novo bloco"), edite ou apague blocos em markdown.`,
  },
  {
    rota: "/novidades",
    nome: "Novidades",
    area: "Administração",
    texto: `Newsletter interna de novidades do sistema. Toda quinta às 9h uma prévia é gerada automaticamente; você revisa e aprova antes do envio para time@grougp.com.br. Botões: "Gerar prévia padrão", "Gerar edição de novidades da Lidi", "Editar prévia" e "Enviar sem editar". Cada edição aparece como Rascunho, Enviado ou Falhou. Aberto a todos.`,
  },
];

export function guiaComoTexto(): string {
  return TELAS.map((t) => `## ${t.nome} (${t.rota}) — ${t.area}\n${t.texto}`).join("\n\n");
}
