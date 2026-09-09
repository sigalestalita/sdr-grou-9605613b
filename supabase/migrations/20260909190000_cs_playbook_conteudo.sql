-- Conteúdo do Playbook CS — Sinaleira GROU v2 (15 blocos do documento da Marcela).
-- Insere só o que ainda não existe (por título); blocos editados no app não são tocados.

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'gatilho_descricao', $t$Lógica de cadência anual — como o sistema decide quando agir$t$, $c$A cadência do CS não é fixa. Ela varia de acordo com três fatores combinados:

1. A cor atual da sinaleira — vermelho exige ação mais rápida que amarelo, que exige mais que verde
2. Quantas semanas o cliente está naquela cor — quanto mais tempo, maior a urgência (no vermelho) ou maior a oportunidade (no verde)
3. A direção da oscilação — um cliente que veio do verde e foi para o amarelo é diferente de um que está estável no amarelo há 3 meses

O sistema observa essas três dimensões e decide o intervalo entre contatos. O CS não precisa calcular manualmente — o dashboard mostra quem precisa de contato nessa semana e por quê.
### A carência de 60 dias
Nenhum gatilho é gerado nos primeiros 60 dias (8 semanas) de licença — nova ou renovada. O cliente precisa de tempo para se apropriar da plataforma e entrar no ritmo de uso.

A partir da 9ª semana, o motor de cadência começa a observar a sinaleira.
### A regra dos 4 contatos por ano
Todo cliente deve ter no mínimo 4 contatos com resposta registrada por ano, dentro de uma janela de 8 meses.

"Contato com resposta" = o cliente respondeu, participou ou agendou algo. Envio sem retorno não conta.

O sistema alerta quando um cliente está em risco de não atingir essa meta dentro da janela.
### Como a oscilação é calculada
O sistema olha as últimas 4 semanas do histórico de sinaleira e classifica a tendência:

* Subindo: vermelho → amarelo, ou amarelo → verde nos últimos 30 dias
* Descendo: verde → amarelo, ou amarelo → vermelho nos últimos 30 dias
* Estável: mesma cor por 3+ semanas consecutivas
* Oscilando: alternando entre duas cores sem tendência clara

A combinação de cor + semanas + tendência define o intervalo e o tipo de contato sugerido.$c$, 'geral', 10, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Lógica de cadência anual — como o sistema decide quando agir$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'gatilho_descricao', $t$Cadência VERMELHO — intervalos, tendências e o que fazer em cada momento$t$, $c$O vermelho é a cor de maior urgência. O intervalo entre contatos é o menor de todos — mas não significa contato toda semana para todos. O que varia é a frequência conforme o tempo e a direção.
Intervalo base no vermelho

| Situação | Intervalo entre contatos | Urgência |
| --- | --- | --- |
| 1ª semana vermelha (a partir da 9ª de licença) | Imediato — contato em até 5 dias úteis | Urgente |
| 2ª semana vermelha consecutiva | 7 dias após o primeiro contato | Urgente |
| 3ª e 4ª semana vermelha | A cada 14 dias | Urgente |
| 5ª a 8ª semana vermelha (2 meses) | A cada 21 dias | Urgente |
| Após 8 semanas vermelhas (2 meses+) | A cada 30 dias + escalada para Executivo | Crise |
| Após 24 semanas vermelhas (6 meses) | Alerta para diretoria + admin — lista consolidada | Estratégico |

### Tendência de subida (vermelho → amarelo nos últimos 30 dias)
Reduzir a intensidade. O cliente está se recuperando — pressionar demais pode parecer desconfiança.

* Intervalo: 21 dias após o último contato
* Tipo de contato sugerido: acompanhamento positivo — reforçar o que está funcionando
* Tom: "notei que o uso está subindo — o que mudou?"
### Tendência de descida (amarelo → vermelho recente)
Aumentar a intensidade. A queda foi rápida e pode indicar problema pontual ou perda de analista.

* Primeiro contato: 3 dias úteis (mais rápido que o padrão)
* Tom: investigativo — "o que aconteceu no período?"
### Oscilação (alternando vermelho e amarelo)
Cliente instável. Não é crise mas não está resolvido.

* Intervalo: 14 dias
* Objetivo: entender o padrão — tem projeto sazonal? O uso depende de um processo específico?
* Tom: curiosidade genuína, não pressão
### Distribuição nos dias úteis
Os contatos vermelhos têm prioridade segunda e terça. Se o gatilho disparar na segunda após a atualização da sinaleira, o contato deve acontecer até quinta no máximo.$c$, 'vermelho', 20, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Cadência VERMELHO — intervalos, tendências e o que fazer em cada momento$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'gatilho_descricao', $t$Cadência AMARELO — intervalos, tendências e o que fazer em cada momento$t$, $c$O amarelo é a cor de atenção. O risco não é imediato, mas o cliente pode estar em desaceleração silenciosa. O intervalo é maior que no vermelho, mas menor que no verde.
Intervalo base no amarelo

| Situação | Intervalo entre contatos | Urgência |
| --- | --- | --- |
| 1ª e 2ª semana amarelo | Sem contato ativo — apenas observar | — |
| 3ª semana amarelo consecutiva | Primeiro contato — 21 dias após início do amarelo | Normal |
| 4ª a 8ª semana amarelo | A cada 30 dias | Normal |
| Após 8 semanas amarelo (2 meses+) | A cada 30 dias + revisão de uso mais profunda | Normal |
| Amarelo com renovação ≤ 60 dias | Contato imediato independente do histórico | Urgente |

### Tendência de subida (vermelho → amarelo recente)
Cliente em recuperação. Reforçar o que está funcionando, não cobrar mais.

* Intervalo: 30 dias
* Tom: "notei que o uso voltou — o que aconteceu de diferente?"
* Objetivo: entender e documentar o que reativou o uso para usar como referência
### Tendência de descida (verde → amarelo recente)
Sinal de desaceleração. Agir antes de completar 3 semanas.

* Primeiro contato: na 2ª semana já em amarelo (não esperar a 3ª)
* Tom: "vi que o ritmo mudou — tem algum projeto que parou?"
* Objetivo: identificar a causa antes que vire vermelho
### Oscilação (alternando amarelo e verde)
Cliente saudável com sazonalidade. Pode ser o padrão normal de uso.

* Intervalo: 45 dias
* Objetivo: confirmar que a oscilação é esperada e documentar o padrão sazonal
* Tom: parceiro que quer entender o ritmo da empresa
### Distribuição nos dias úteis
Os contatos amarelos ficam preferencialmente na quarta. Se tiver muitos amarelos na semana, distribuir entre quarta e quinta.$c$, 'amarelo', 30, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Cadência AMARELO — intervalos, tendências e o que fazer em cada momento$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'gatilho_descricao', $t$Cadência VERDE — intervalos, tendências e o que fazer em cada momento$t$, $c$O verde é a cor de oportunidade. O intervalo é o maior de todos — o cliente está bem e não precisa de atenção constante. O que o CS precisa fazer é não perder o timing de expansão.
Intervalo base no verde

| Situação | Intervalo entre contatos | Urgência |
| --- | --- | --- |
| 1ª e 2ª semana verde | Sem contato ativo — confirmar que não é pico pontual | — |
| 3ª semana verde consecutiva | Primeiro contato — check-in de sucesso | Normal |
| 4ª a 8ª semana verde | A cada 45 dias | Normal |
| Após 8 semanas verde (2 meses+) | A cada 60 dias — cliente consolidado | Baixa |
| Verde com consumo ≥ 40% acima da projeção | Contato imediato — acionar Executivo | Urgente |

### Tendência de subida (amarelo → verde recente)
Cliente em crescimento. Aproveitar o momento de boa percepção de valor.

* Primeiro contato: na 3ª semana verde
* Tom: "notei que o uso cresceu — o que está puxando isso?"
* Objetivo: entender o caso de uso e criar gancho para expansão
### Tendência consolidada (verde por 2+ meses)
Cliente saudável e estável. Não precisa de atenção frequente, mas não pode ser esquecido.

* Intervalo: 60 dias
* Tom: parceiro estratégico — conversa sobre o que o cliente quer construir no próximo ciclo
* Objetivo: manter a relação aquecida para a renovação
### Oscilação (alternando verde e amarelo sem cair em vermelho)
Cliente com padrão sazonal positivo. Saudável.

* Intervalo: 45 dias
* Objetivo: documentar o padrão e usar nas conversas de renovação como prova de valor
### Distribuição nos dias úteis
Os contatos verdes ficam na quinta e sexta. São os contatos de menor urgência e podem ser planejados com mais calma.$c$, 'verde', 40, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Cadência VERDE — intervalos, tendências e o que fazer em cada momento$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'gatilho_descricao', $t$Mapa anual de cadência — visão dos 12 meses por cenário de cliente$t$, $c$Este mapa mostra como a cadência se comporta ao longo de um ano inteiro para os cenários mais comuns. O sistema deve usar esses padrões para calcular o próximo contato sugerido para cada cliente.
### Cenário 1 — Cliente estável no verde o ano todo
Mês 1–2:   Carência (sem gatilho)
Mês 2:     Semana 9 → 1º contato (check-in de sucesso)
Mês 3–4:   2º contato (45 dias depois) — aprofundar caso de uso
Mês 5–6:   3º contato (45 dias depois) — oferta de expansão ou funcionalidade nova
Mês 8–9:   4º contato (60 dias depois) — conversa de renovação antecipada
Mês 10:    5º contato — abertura formal de renovação
Resultado: 5 contatos no ano, meta de 4 cumprida com folga
### Cenário 2 — Cliente oscilando entre verde e amarelo
Mês 1–2:   Carência
Mês 2:     Semana 9 → 1º contato (check-in — entender oscilação)
Mês 3:     2º contato (30 dias) — identificar padrão sazonal
Mês 5:     3º contato (45 dias) — reforçar uso no período de alta
Mês 7:     4º contato (45 dias) — preparar para renovação
Mês 10:    5º contato — conversa de renovação
Resultado: 5 contatos, padrão mapeado, renovação preparada
### Cenário 3 — Cliente entra em vermelho e se recupera
Mês 1–2:   Carência
Mês 2–3:   Vermelho → 1º contato urgente (D+5)
Mês 3:     2º contato (14 dias) — plano de recuperação
Mês 4:     3º contato (21 dias) — acompanhamento
Mês 4–5:   Cliente sobe para amarelo → 4º contato (30 dias, tom de reforço)
Mês 6–7:   Cliente estabiliza verde → 5º contato (45 dias, check-in de sucesso)
Mês 10:    6º contato — renovação
Resultado: 6 contatos, meta cumprida, churn evitado
### Cenário 4 — Cliente persistente no vermelho
Mês 1–2:   Carência
Mês 2:     Semana 9 → 1º contato urgente
Mês 3:     2º contato (14 dias) + Executivo envolvido
Mês 3–4:   3º contato (21 dias) — plano de recuperação conjunto
Mês 4–5:   4º contato (30 dias) — revisão de uso profunda
Mês 5–6:   5º contato (30 dias) — verificar percepção de valor
Mês 6:     8 semanas vermelhas → alerta estratégico para diretoria
Mês 7+:    Contatos mensais + acompanhamento de diretoria
Resultado: Meta cumprida, risco documentado, decisão estratégica acionada
### Cenário 5 — Cliente entra verde, desce para amarelo, depois vermelho
Mês 1–2:   Carência
Mês 2:     Verde → 1º contato (semana 9)
Mês 3:     Desce para amarelo → 2º contato antecipado (não espera 3 semanas)
Mês 4:     Desce para vermelho → 3º contato urgente (D+5)
Mês 4–5:   4º contato (14 dias) — plano de reativação + Executivo
Mês 6:     5º contato (21 dias) — acompanhamento
Mês 8–9:   Recuperação → 6º contato (reforço positivo)
Resultado: Queda detectada cedo, ação rápida, cliente mantido
$c$, 'geral', 50, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Mapa anual de cadência — visão dos 12 meses por cenário de cliente$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'playbook', $t$Missão e princípios do CS da GROU$t$, $c$O CS da GROU existe para conduzir o cliente ao resultado que ele comprou. Não é suporte técnico. Não é atendimento reativo. É um parceiro que entende o negócio do cliente e usa o PDA como instrumento de entrega de valor.

A diferença entre um CS bom e um CS excelente: Um CS bom resolve problemas quando aparecem. Um CS excelente percebe o problema antes do cliente e age antes que ele precise pedir.

A sinaleira é o instrumento que torna esse olhar antecipado possível. Ela traduz o comportamento do cliente em dados semanais — e o CS usa esses dados para decidir quando e como agir.

O que o CS faz na prática:

* Conduz o onboarding e o treinamento técnico das ferramentas
* Acompanha o uso e a evolução do cliente ao longo do contrato
* Oferece Masterclasses e aprofundamentos no momento certo
* Identifica oportunidades de expansão e passa para o Executivo com contexto
* Age de forma preventiva quando o uso cai — antes que vire crise
* Prepara o terreno para a renovação ao longo do ano, não só no último mês

O que o CS não faz:

* Não contata o cliente sem propósito claro
* Não envia e-mail genérico de "tudo bem?"
* Não fecha venda — esse papel é do Executivo
* Não age só quando o cliente reclama

Tom da comunicação: Próximo, direto e consultivo. A relação com o cliente deve parecer a de alguém que conhece o negócio dele e fala a linguagem de gestão de pessoas — não de alguém que está checando se o software está funcionando.$c$, 'geral', 60, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Missão e princípios do CS da GROU$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'playbook', $t$Como ler a oscilação do cliente — direção importa mais que a cor$t$, $c$A cor da sinaleira na semana atual é importante. Mas a direção da oscilação nas últimas 4 semanas é o que define o tom e a urgência do contato.
### As quatro situações que o CS precisa saber identificar
Cliente descendo Verde → amarelo → vermelho. Cada semana a cor piora. O que isso significa: perda de uso progressiva. Pode ser saída de analista, projeto pausado, insatisfação não verbalizada ou simplesmente falta de novidade. O que fazer: agir antes de completar a descida. Não esperar virar vermelho para entrar em contato.

Cliente subindo Vermelho → amarelo → verde. O uso está voltando. O que isso significa: algo mudou para melhor — novo projeto, novo analista, apoio do CS anterior que surtiu efeito. O que fazer: reforçar o que está funcionando. Não pressionar com oferta imediata — deixar o cliente consolidar antes.

Cliente estável Mesma cor por 3+ semanas consecutivas. O que isso significa: depende da cor. Verde estável é ótimo. Amarelo estável é atenção. Vermelho estável é crise em câmera lenta. O que fazer: seguir o intervalo base da cor + aprofundar a investigação se for amarelo ou vermelho.

Cliente oscilando Alternando entre duas cores sem tendência clara. O que isso significa: uso dependente de projeto ou ciclo sazonal. Não é necessariamente problema — pode ser o padrão normal da empresa. O que fazer: mapear o padrão antes de agir. Perguntar diretamente: "esse ritmo de uso é esperado pra vocês ou tem algum projeto parado?"
### Como registrar no sistema
Após cada contato, registrar nas observações:

* Qual era a cor e a tendência no momento do contato
* O que o cliente disse sobre o uso
* Qual foi o próximo passo combinado
* Se houve mudança de cor na semana seguinte

Esses registros formam o histórico que o CS usa nas conversas de renovação — e que a diretoria usa para entender o padrão de churn.$c$, 'geral', 70, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Como ler a oscilação do cliente — direção importa mais que a cor$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'playbook', $t$Como conduzir o contato com cliente VERDE$t$, $c$O cliente verde está usando mais do que a projeção prevê. O risco aqui não é churn — é perder o timing de expansão. A janela de oportunidade dura enquanto o cliente está no pico de uso e percepção de valor.

O erro mais comum no verde: entrar em contato cedo demais (antes de confirmar a tendência) ou tarde demais (quando o uso já voltou ao normal e a conversa de expansão perde o gancho).
### O que falar dependendo do tempo no verde
3ª semana verde — primeiro contato: Objetivo é entender o que está puxando o uso, não fazer oferta ainda.

"Vi que vocês têm usado bastante a plataforma nesse período. O que está acontecendo? Tem algum projeto específico rodando?"

Verde entre 4–8 semanas — segundo contato: Agora você já sabe o caso de uso. O objetivo é aprofundar e criar o gancho para o Executivo.

"Na nossa última conversa você falou sobre [projeto]. Como está evoluindo? Faz sentido a gente pensar em ampliar o uso?"

Verde por mais de 2 meses — cliente consolidado: Relação mais madura. Conversa mais estratégica.

"Vocês estão em um ótimo ritmo de uso. Queria entender o que planejam para o próximo semestre — tem algum projeto novo que o PDA poderia apoiar?"
### Quando acionar o Executivo
Acionar quando:

* O cliente confirmar uso crescente por 3+ semanas
* O cliente mencionar novo projeto que demandaria mais créditos ou licenças
* O consumo estiver 40%+ acima da projeção por pelo menos 1 semana

Ao acionar o Executivo, registrar nas observações: qual é o projeto, quem é o contato do cliente e o que foi dito na última conversa. O Executivo não entra às cegas.
### O que não fazer
Não enviar e-mail de "tudo bem?" quando o cliente está verde. Verde não precisa de check-in vago — precisa de conversa com propósito.$c$, 'verde', 80, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Como conduzir o contato com cliente VERDE$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'playbook', $t$Como conduzir o contato com cliente AMARELO$t$, $c$O cliente amarelo está usando exatamente o que a projeção prevê — nem mais, nem menos. Pode ser estabilidade saudável ou o começo de uma queda que ainda não apareceu nos dados.

O erro mais comum no amarelo: não fazer nada achando que está tudo bem. Três semanas estável no amarelo, na maioria dos casos, significa que o uso não está crescendo — e uso que não cresce tende a diminuir.
### O que falar dependendo do tempo no amarelo
2ª semana amarelo após período verde — agir antes da 3ª semana: A descida do verde para o amarelo é o sinal mais importante. Não esperar completar 3 semanas para entrar em contato.

"Percebi uma mudança no ritmo de uso de vocês nas últimas semanas. Tem algum projeto que pausou ou alguma coisa diferente acontecendo por lá?"

3ª semana amarelo consecutiva — primeiro contato padrão:

"Como está o uso do PDA por aí? Às vezes tem projeto parado, às vezes falta de tempo, às vezes dúvida técnica acumulada — queria entender o que está acontecendo para poder ajudar."

Amarelo entre 4–8 semanas — segundo contato: Já houve uma conversa. O objetivo agora é propor algo concreto.

"Da última vez que conversamos você falou sobre [causa identificada]. Como evoluiu? Faz sentido a gente marcar uma agenda para [solução sugerida]?"

Amarelo por mais de 2 meses: O padrão está consolidado. Investigar se é sazonal ou estrutural.

"Vocês já estão há alguns meses nesse ritmo de uso. Queria entender melhor como funciona o ciclo de projetos de vocês — esse é o padrão esperado ou tem alguma coisa travando?"
### Ofertas certas para o momento amarelo
Dependendo da causa identificada, propor:

* Masterclass alinhado ao tag_uso do cliente
* Agenda de apresentação de funcionalidade não explorada
* Treinamento técnico se houver dúvida acumulada
* Revisão de projetos em andamento

Não propor expansão ou upgrade enquanto o cliente está amarelo. Primeiro estabilizar, depois crescer.$c$, 'amarelo', 90, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Como conduzir o contato com cliente AMARELO$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'playbook', $t$Como conduzir o contato com cliente VERMELHO$t$, $c$O cliente vermelho está usando abaixo da projeção. É o sinal de maior risco. Cada semana sem contato aumenta a probabilidade de churn.

A regra do vermelho: o primeiro contato acontece em até 5 dias úteis da primeira semana vermelha. Ponto.

O erro mais comum no vermelho: fazer contato ansioso, que o cliente sente. O CS não está ligando porque está preocupado com o churn — está ligando porque percebeu algo e quer ajudar. A diferença de tom muda completamente a conversa.
### O que falar dependendo do tempo no vermelho
1ª semana vermelha — diagnóstico: Objetivo é entender a causa. Não tentar resolver ainda.

"Tava olhando os dados de uso aqui e queria bater um papo rápido. O que está acontecendo com o uso do PDA por aí ultimamente?"

Se o cliente perguntar "por que você está perguntando?":

"A gente acompanha o ritmo de uso dos clientes justamente para poder ajudar no momento certo. Vi que vocês estão usando menos do que costumavam — queria entender se tem algo que eu possa fazer."

2ª semana vermelha — plano de ação: Já houve diagnóstico. Agora o CS propõe algo concreto e envolve o Executivo.

"Da última vez você falou sobre [causa]. Pensei em [solução]. Faz sentido marcarmos uma agenda para isso?"

Vermelho entre 4–8 semanas — acompanhamento: O cliente sabe que está com uso baixo e o CS está acompanhando. O tom muda — mais estratégico, menos operacional.

"Já faz algumas semanas que estamos trabalhando para retomar o uso. O que você acha que ainda está travando? O que mudaria se [hipótese]?"

Vermelho com renovação ≤ 60 dias — modo crise: CS + Executivo juntos. A conversa de renovação não pode acontecer com o cliente em vermelho sem um plano claro.

"Quero marcar uma conversa com você e com [nome do Executivo] juntos. A gente quer entender o que aconteceu no ano e o que faz sentido pro próximo ciclo. Qual semana fica melhor?"
### As cinco perguntas do diagnóstico
Em todo primeiro contato de vermelho, buscar responder:

1. O cliente sabe que está usando pouco?
2. Há projeto parado? Por quê?
3. Houve mudança de equipe — saiu o analista PDA?
4. Há dúvida técnica não resolvida acumulada?
5. O cliente ainda acredita no valor da ferramenta?

As respostas definem o próximo passo. Registrar tudo nas observações.$c$, 'vermelho', 100, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Como conduzir o contato com cliente VERMELHO$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'oferta', $t$Masterclasses — quando oferecer por cor e momento$t$, $c$Os Masterclasses são a principal entrega de valor proativo do CS. São gratuitos, conduzidos pelas especialistas do time, com duração de 45 minutos. O timing certo de oferta depende da cor e do momento do cliente.
### Os 6 módulos disponíveis
Módulo 1 — Fundamentos do PDA e Autoconhecimento Para clientes novos, com analista recém-certificado ou que voltaram após período de baixo uso.

Módulo 2 — Seleção e Onboarding Inteligente Para clientes com tag_uso = recrutamento que ainda não exploram o PDA no processo seletivo de forma estruturada.

Módulo 3 — Desenvolvimento e Engajamento Para clientes com tag_uso = desenvolvimento que querem usar o PDA para PDI e planos de crescimento.

Módulo 4 — Demanda de Equipes e Cultura Organizacional Para clientes com equipes maiores ou projetos de cultura que já têm volume de dados na plataforma.

Módulo 5 — Liderança e Sucessão Para clientes com programas formais de liderança ou planejamento de sucessão.

Módulo 6 — RH como Consultor Interno Para clientes maduros — geralmente acima de 6 meses de uso — que querem usar o PDA como ferramenta estratégica, não só operacional.
### Quando oferecer cada módulo por cor e tempo

| Cor | Semanas na cor | Módulo sugerido | Motivo |
| --- | --- | --- | --- |
| Verde | 3–4 semanas | Módulo 4 ou 5 | Cliente em alta — conversa estratégica |
| Verde | 8+ semanas | Módulo 6 | Cliente consolidado — aprofundar uso |
| Amarelo | 3 semanas (primeira abordagem) | Módulo do tag_uso | Reativar uso com conteúdo relevante |
| Amarelo | 8+ semanas | Módulo 4 | Ampliar perspectiva do uso |
| Vermelho | Após diagnóstico, causa = analista novo | Módulo 1 | Capacitar o novo analista |
| Vermelho | Após diagnóstico, causa = falta de projeto | Módulo 2 ou 3 | Criar novo caso de uso concreto |
| Vermelho | Após diagnóstico, causa = não vê valor | Módulo 6 | Elevar a conversa para estratégia |
| Qualquer | Mês 3 do contrato | Módulo alinhado ao tag_uso | Marco da jornada |
| Qualquer | Mês 6 do contrato | Módulo 4 ou 5 | Marco de maturidade |

### Regra do primeiro sucesso
O cliente atinge o 1º Sucesso quando:

* Participa de pelo menos 2 dos Módulos 1, 2 ou 3
* Usa ao menos 1 desses módulos em projeto real

O 2º Sucesso é atingido quando:

* Participa do Módulo 5 (Liderança)
* Comprova o uso desse módulo

Registrar o marco de sucesso nas observações do cliente no sistema.$c$, 'geral', 110, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Masterclasses — quando oferecer por cor e momento$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'oferta', $t$Funcionalidades da plataforma — quando e para quem oferecer$t$, $c$Cada funcionalidade tem um momento certo de oferta. Oferecer antes da hora cria ruído. Oferecer no momento certo abre conversa.
### Compatibilidade de Cargos
Para quem: clientes com tag_uso = recrutamento ou recrutamento_e_desenvolvimento Melhor momento: a partir de 90 dias de uso, quando o cliente já tem analistas rodando perfis Sinaleira ideal para oferta: verde ou amarelo (não no primeiro contato de vermelho) O que resolve: torna o processo seletivo mais objetivo — o CS pode perguntar "vocês já têm o perfil de cargo construído para as vagas que mais abrem?"
### Compatibilidade de Competências
Para quem: clientes com tag_uso = desenvolvimento ou recrutamento_e_desenvolvimento Melhor momento: a partir de 90 dias, especialmente quando o cliente fala em PDI ou avaliação de desempenho Sinaleira ideal: verde ou amarelo estável O que resolve: conecta o desenvolvimento ao que a função realmente exige, não só ao perfil do profissional
### Tendências de Grupo
Para quem: clientes com 5+ pessoas já mapeadas na plataforma Melhor momento: a partir de 6 meses — quando há volume de dados para leitura coletiva Sinaleira ideal: verde consolidado O que resolve: mostra o comportamento do time como um todo — complementaridade, pontos de tensão, riscos de comunicação
### Líder × Liderado
Para quem: clientes com programas de liderança ou com novos gestores Melhor momento: junto com o Módulo 5, ou quando o cliente menciona que tem novo líder Sinaleira ideal: qualquer cor — essa oferta funciona bem até no vermelho se o cliente tem projeto de liderança O que resolve: embasa o onboarding comportamental de líderes com dados reais, não intuição
### Feedback 360
Para quem: clientes com cultura de feedback estruturado, geralmente acima de 6 meses de uso Melhor momento: quando o cliente já usa bem o perfil individual e está pronto para ir mais fundo Sinaleira ideal: verde ou amarelo estável — não oferecer durante crise de uso O que resolve: avaliação de múltiplas fontes com base comportamental, não só de desempenho subjetivo$c$, 'geral', 120, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Funcionalidades da plataforma — quando e para quem oferecer$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'conteudo_contato', $t$Modelos de mensagem por cor e momento — tom e estrutura$t$, $c$Esses modelos são referências de tom e estrutura — não textos para copiar sem ler. Cada mensagem precisa ter o nome do cliente, o contexto específico do que foi visto no sistema e o próximo passo concreto.

A regra é: se você não consegue preencher os colchetes com informação real, o contato ainda não está pronto para ser enviado.

---

### VERDE — 3ª semana consecutiva (primeiro contato)
Canal sugerido: WhatsApp ou e-mail curto Objetivo: entender o caso de uso, não fazer oferta

Oi [nome], tudo bem?

Tava acompanhando o uso de vocês aqui e notei um crescimento bacana nas últimas semanas. Fiquei curiosa — tem algum projeto específico rodando que está puxando isso?

[assinatura]

---

### VERDE — 2º contato (45 dias depois, cliente confirma crescimento)
Canal sugerido: Ligação ou reunião breve Objetivo: criar gancho para o Executivo

Oi [nome], tudo bem?

Da última vez que conversamos você falou sobre [projeto]. Queria saber como está evoluindo — e aproveitar para ver se faz sentido a gente pensar em ampliar o uso para atender essa demanda.

Posso te ligar essa semana para conversar sobre isso?

[assinatura]

---

### VERDE consolidado — cliente 2+ meses (contato de manutenção)
Canal sugerido: E-mail Objetivo: manter a relação aquecida para a renovação

Oi [nome],

Vocês estão em um ótimo ritmo de uso — fico feliz de acompanhar isso. Queria aproveitar para entender o que planejam para o próximo semestre. Tem algum projeto novo que o PDA poderia apoiar?

Me fala quando tiver um tempinho.

[assinatura]

---

### AMARELO — descendo do verde (antes da 3ª semana)
Canal sugerido: WhatsApp Objetivo: entender a mudança antes que vire vermelho

Oi [nome], tudo bem?

Percebi uma mudança no ritmo de uso de vocês nas últimas semanas. Tem algum projeto que pausou ou alguma coisa diferente acontecendo por lá?

[assinatura]

---

### AMARELO — 3ª semana consecutiva (primeiro contato padrão)
Canal sugerido: Ligação ou e-mail Objetivo: investigar causa e propor próximo passo

Oi [nome],

Como está o uso do PDA por aí? Às vezes tem projeto parado, às vezes falta de tempo, às vezes uma dúvida técnica que foi acumulando — queria entender o que está acontecendo para ver como posso ajudar.

Tem 10 minutos essa semana para a gente conversar?

[assinatura]

---

### AMARELO — 2º contato (30 dias depois)
Canal sugerido: E-mail ou ligação Objetivo: proposta concreta baseada no que foi descoberto antes

Oi [nome],

Da última vez que conversamos você falou sobre [causa identificada]. Pensei em [solução — Masterclass, funcionalidade, agenda técnica]. Faz sentido para vocês?

Se sim, posso já te mandar o convite.

[assinatura]

---

### VERMELHO — 1ª semana (diagnóstico urgente, até D+5)
Canal sugerido: Ligação (preferencial) ou WhatsApp Objetivo: entender a causa — não resolver ainda

Oi [nome], tudo bem?

Tava acompanhando os dados de uso aqui e queria bater um papo rápido. O que está acontecendo com o PDA por aí ultimamente?

[assinatura]

Se não atender na ligação — WhatsApp:

Oi [nome]! Tentei te ligar agora. Tava vendo o uso de vocês na plataforma e queria bater um papo rápido. Qual seria um bom horário para a gente conversar essa semana?

---

### VERMELHO — 2ª semana (plano de ação, Executivo envolvido)
Canal sugerido: Reunião ou ligação com CS + Executivo Objetivo: proposta concreta de recuperação

Oi [nome],

Da nossa última conversa ficou claro que [causa identificada]. Pensei em [solução] e já alinhei com [nome do Executivo] para a gente marcar uma conversa conjunta.

Qual semana fica melhor para você?

[assinatura]

---

### VERMELHO — renovação ≤ 60 dias (modo crise)
Canal sugerido: Ligação direta Objetivo: conversa honesta sobre uso + preparar renovação

Oi [nome],

Quero marcar uma conversa com você — junto com [nome do Executivo]. A gente quer entender como foi o uso ao longo do ano, o que funcionou e o que ficou na gaveta, e pensar juntos o que faz sentido para o próximo ciclo.

Não é uma conversa de pressão — é uma conversa de parceria. Qual semana fica melhor?

[assinatura]

---

### VERMELHO — 6 meses consecutivos (alerta estratégico — uso interno)
Este conteúdo é para o e-mail de alerta enviado para diretoria e admin — não para o cliente.

Assunto: Clientes em vermelho há 6+ meses — lista para revisão estratégica

Os seguintes clientes completaram 6 meses consecutivos em vermelho e precisam de avaliação estratégica:

[lista gerada automaticamente pelo sistema com: nome do cliente, CS responsável, Executivo responsável, data de renovação, último contato registrado]

Esses clientes estão além do que o CS pode resolver sozinho. A decisão sobre continuidade, ajuste de produto ou abordagem diferenciada precisa vir da liderança.$c$, 'geral', 130, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Modelos de mensagem por cor e momento — tom e estrutura$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'conteudo_contato', $t$E-mails das Jornadas Reais GROU — série de 4 (conteúdo fixo por marco da jornada)$t$, $c$Esses e-mails são disparados por marco temporal da licença — não pela sinaleira. Eles coexistem com a cadência de sinaleira: o cliente pode receber um e-mail de Jornada Reais na semana em que também tem um contato de sinaleira. São contatos com propósitos distintos.

Regra: não adaptar o texto. O tom e o conteúdo estão calibrados — qualquer alteração deve ser feita com cuidado para não perder a voz.

---

### E-mail 1 — 30 dias de licença
QUANDO: 30.º dia de uso PARA QUEM: clientes com tag_uso = recrutamento ou recrutamento_e_desenvolvimento OBJETIVO: mostrar o PDA como aliado no processo seletivo com base em dados

ASSUNTO: 1 mês de PDA — você já usou no processo seletivo?

---

Oi [nome],

Completamos um mês de parceria, e queria aproveitar esse marco pra compartilhar algo que pode fazer diferença nos seus próximos processos seletivos.

A GROU lançou um episódio do Jornadas Reais com um especialista em dados falando sobre como usar o PDA pra tornar o recrutamento mais objetivo. Não pra substituir o olhar humano — mas pra dar a ele uma base concreta.

A pergunta central do episódio é simples e poderosa: qual é o perfil comportamental que realmente performa nas vagas que você contrata?

Com o PDA, você consegue mapear isso. E quando você tem esse perfil como referência, cada novo processo começa com um critério claro — não com achismo.

Vale assistir: https://www.youtube.com/watch?v=W-af1lEE1ek

Qualquer dúvida sobre como usar o PDA no recrutamento aí com vocês, me chama.

Marcela

---

### E-mail 2 — 90 dias de contrato
QUANDO: 90.º dia de contrato PARA QUEM: todos os clientes — adaptar abertura se empresa for 100% desk (sem exposição física) OBJETIVO: revelar o eixo de Risco — dimensão que a maioria dos clientes ainda não explorou

ASSUNTO: 3 meses de PDA — você já analisou o eixo de Risco da sua equipe?

---

Oi [nome],

Com 3 meses de uso, você já tem um volume interessante de dados comportamentais. Queria te mostrar uma análise que muitos clientes ainda não exploram — e que pode ter impacto direto na operação de vocês.

No PDA, o eixo de Risco mede o quanto uma pessoa age com iniciativa, velocidade e tolerância a situações de incerteza. Em áreas como vendas e liderança, isso é uma vantagem. Mas em funções operacionais, de campo ou com exposição física, um perfil de risco elevado sem a gestão correta pode ser um sinal de atenção.

A GROU trouxe esse tema de forma muito prática num episódio do Jornadas Reais. É o tipo de conteúdo que faz a liderança olhar pro PDA de um jeito diferente.

Vale assistir: https://www.youtube.com/watch?v=GA5w8Mx5QEs

Se quiser, posso te ajudar a olhar pra isso nos perfis que vocês já têm na plataforma. Às vezes a resposta já está nos dados — a gente só precisa saber onde olhar.

Marcela

---

### E-mail 3 — 6 meses de utilização
QUANDO: 6.º mês de uso PARA QUEM: clientes com time comercial — adaptar para outras áreas se necessário OBJETIVO: elevar a conversa para estratégia — cruzar perfil com performance

ASSUNTO: 6 meses de PDA — o perfil do seu time comercial bate com quem realmente vende?

---

Oi [nome],

Seis meses é um bom momento pra fazer uma pergunta diferente: o que os dados de vocês estão dizendo?

Uma das análises mais poderosas que dá pra fazer com o PDA é cruzar perfil comportamental com performance — e ver se quem bate meta tem algo em comum. Essa resposta costuma surpreender.

No time comercial, por exemplo: existe uma diferença real entre o perfil de quem fecha bem e o de quem luta pra fechar? Se existe, você pode usar isso na contratação, no desenvolvimento e até na distribuição de carteiras.

A GROU abriu esse assunto num episódio do Jornadas Reais com cases reais de times de vendas. Vale os 40 minutos:

https://www.youtube.com/watch?v=aGjgqydFi48

Se quiser trazer esse olhar pra equipe de vocês, posso propor uma análise a partir dos perfis que já estão na plataforma. Seria uma boa conversa antes de qualquer movimentação no time.

Me fala o que acha.

Marcela

---

### E-mail 4 — 10 meses de utilização
QUANDO: 10.º mês de uso PARA QUEM: todos os clientes OBJETIVO: abertura da conversa de renovação com foco em valor construído

ASSUNTO: 10 meses de PDA — o que construímos juntos (e o que ainda dá pra ir mais fundo)

---

Oi [nome],

Estamos chegando nos 10 meses de parceria, e eu queria aproveitar esse momento pra fazer uma pausa e olhar pro que foi construído até aqui.

Vocês já têm um volume real de dados comportamentais na plataforma. Dependendo de como usaram ao longo do ano — em seleção, em desenvolvimento, na leitura de times — esse é um ativo que tende a ser cada vez mais valioso com o tempo. Perfil comportamental não envelhece: ele ajuda a entender padrões, comparar momentos, embasar decisões que antes eram só intuição.

Quero marcar uma conversa com vocês antes do fim do contrato — não pra falar de renovação agora, mas pra entender como foi o uso, o que funcionou, o que ficou na gaveta e o que faz sentido aprofundar no próximo ciclo. Às vezes uma hora de conversa muda o olhar sobre o que a ferramenta pode entregar.

Qual semana fica melhor pra você?

Marcela$c$, 'geral', 140, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$E-mails das Jornadas Reais GROU — série de 4 (conteúdo fixo por marco da jornada)$t$);

INSERT INTO public.cs_playbook_blocks (tipo, titulo, corpo, cor, ordem, ativo)
SELECT 'conteudo_contato', $t$Guia de tags — como classificar e usar no sistema$t$, $c$As tags são o principal filtro de personalização do CS. Sem elas, o sistema não consegue sugerir o conteúdo certo para o momento certo. Preencher é obrigação do CS responsável no momento do onboarding — e atualizar quando o uso do cliente mudar.
### tag_uso — o que o cliente usa o PDA para fazer

| Tag | Quando usar |
| --- | --- |
| recrutamento | PDA usado principalmente em processos seletivos, triagem e mapeamento de candidatos |
| desenvolvimento | PDA usado principalmente em PDI, feedback, liderança e engajamento |
| recrutamento_e_desenvolvimento | PDA usado nos dois contextos com frequência similar |

Quando houver dúvida, perguntar diretamente ao cliente: "em qual desses usos vocês investem mais tempo hoje?"
### tag_analista — o analista PDA certificado da empresa
Registrar o nome de quem opera a plataforma e tem certificação de Analista PDA. Esse dado é crítico porque:

* Quando o analista sai, o uso cai — e o CS precisa saber que isso aconteceu
* Ao detectar queda de uso (vermelho), a primeira hipótese a checar é: o analista mudou?
* A oferta de Módulo 1 (Fundamentos) é acionada automaticamente quando analista novo é registrado

Atualizar a tag imediatamente quando o analista mudar.
### Como as tags afetam o sistema
* Filtro no dashboard: o CS vê a carteira segmentada por tag_uso para priorizar contatos com conteúdo relevante
* Sugestão de Masterclass: o sistema usa o tag_uso para recomendar qual módulo oferecer em cada momento
* E-mails das Jornadas Reais: o e-mail de 30 dias é enviado automaticamente apenas para clientes com tag_uso = recrutamento ou recrutamento_e_desenvolvimento
* Alertas de analista: o sistema avisa quando tag_analista está vazio — clientes sem analista cadastrado são risco silencioso$c$, 'geral', 150, true
WHERE NOT EXISTS (SELECT 1 FROM public.cs_playbook_blocks WHERE titulo = $t$Guia de tags — como classificar e usar no sistema$t$);
