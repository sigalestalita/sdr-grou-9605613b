/*
 * Mapa da apresentação comercial da Grou (143 slides, versão de 26/11/2026):
 * a seção (serviço/produto) e o título de cada slide, na ordem. Serve para a
 * importação do PDF da apresentação já sair com cada página na seção certa.
 * Gerado a partir da apresentação publicada; se a apresentação mudar de
 * tamanho, a importação avisa e a gestão ajusta as seções na tela.
 */
export type SecaoDaApresentacao = { programa: string; secao: string };

export const SECOES_DA_APRESENTACAO: SecaoDaApresentacao[] = [
  { programa: "grou", secao: "A Grou" },
  { programa: "pda", secao: "PDA Assessment" },
  { programa: "grou-academy", secao: "Grou Academy" },
  { programa: "qr", secao: "Questionário de Resiliência" },
  { programa: "dg", secao: "Dilemas de Gestão" },
  { programa: "clima", secao: "Pesquisa de Clima Organizacional" },
  { programa: "atlas-360", secao: "Atlas 360" },
  { programa: "consulting", secao: "Consulting" },
  { programa: "master-lider", secao: "Master Líder" },
  { programa: "lider-360", secao: "Líder 360°" },
  { programa: "nr1-liderancas", secao: "NR-1 aplicada às Lideranças" },
  { programa: "capacitacao-pda", secao: "Capacitação Analista Comportamental PDA" },
  { programa: "pda-para-lideres", secao: "PDA para Líderes" },
  { programa: "sensibilizacao-pda", secao: "Sensibilização de Lideranças com Foco no PDA" },
  { programa: "team-building", secao: "Team Building com o PDA" },
  { programa: "entrevista-competencias", secao: "Entrevista por Competências com o PDA" },
  { programa: "vendas-comportamental", secao: "Inteligência Comportamental para Vendas" },
  { programa: "pdi-com-pda", secao: "Workshop PDI com o PDA" },
  { programa: "devolutiva-pda", secao: "Devolutiva em Grupo com o PDA" },
  { programa: "comunicacao-comportamento", secao: "Comunicação e Comportamento" },
  { programa: "assessment-40", secao: "Assessment 5.0" },
  { programa: "mentoria-comportamental", secao: "Mentoria Comportamental" },
  { programa: "devolutiva-individual", secao: "Devolutiva Individual" },
  { programa: "pdi-individual", secao: "PDI para Desenvolvimento Individual" },
  { programa: "self-guru", secao: "Self Guru" },
  { programa: "groutalent", secao: "GrouTalent" },
];

/** [programa, título] de cada slide, na ordem da apresentação. */
export const MAPA_DA_APRESENTACAO: Array<[string, string]> = [
  [
    "grou",
    "Um ecossistema de soluções para gestão de pessoas.Tecnologias de assessment, Consulting, coaching e recrutamen",
  ],
  [
    "grou",
    "Qual decisão precisa avançar?Cada decisão sobre pessoas tem um ponto de partida no ecossistema Grou. Escolha p",
  ],
  [
    "grou",
    "Tecnologia com gente por trás.Conhecer, desenvolver e acompanhar: as frentes do ecossistema trabalham juntas.",
  ],
  [
    "grou",
    "Desde 2003, gestão comportamental.23 anos, mais de 2.000 empresas atendidas e mais de 5.000 alunos formados.",
  ],
  [
    "grou",
    "Empresas que confiam na Grou.Mais de 2.000 empresas, de diferentes portes e setores, em todo o Brasil.",
  ],
  [
    "pda",
    "PDA AssessmentInteligência comportamental para contratar, desenvolver e gerir pessoas com mais contexto.",
  ],
  [
    "pda",
    "Somos o ecossistema especialista em Gestão Comportamental.Fornecemos as tecnologias mais completas para",
  ],
  ["pda", "Somos a PDA no Brasil"],
  ["pda", "PDA Assessment."],
  ["pda", "Uma plataforma de gestão comportamental completa."],
  [
    "pda",
    "Mais de 2.000 empresas já confiam na Grou.Para impulsionar a gestão comportamental, em diferentes portes e set",
  ],
  ["pda", "Problemas de gestão de talentos que o PDA resolve."],
  [
    "pda",
    "× DISC. A mesma raiz, mais profundidade.A metodologia original de William Marston, com um eixo e quatro indica",
  ],
  ["pda", "Análises individuais"],
  ["pda", "Perfil Comportamental PDA"],
  ["pda", "Perfil × Cargos"],
  ["pda", "Perfil × Competências"],
  ["pda", "Análises de grupo"],
  ["pda", "Ranking Candidatos"],
  ["pda", "Líder × Liderado"],
  ["pda", "Competências × Perfis"],
  ["pda", "Tendências de grupo"],
  ["pda", "1 crédito por pessoa"],
  ["pda", "Serviços Grou/PDA"],
  ["pda", "Certificação PDA Assessment."],
  [
    "pda",
    "Grou Academy, incluso com o PDA.Faz parte da Plataforma de Sucesso do Cliente que vem junto com o PDA.",
  ],
  ["pda", "Nossos serviços."],
  ["pda", "Investimento Licença PDA"],
  [
    "pda",
    "Investimento · Licença PDA.Cada licença é uma avaliação, com acesso ilimitado a todos os relatórios. Quanto ma",
  ],
  ["grou-academy", "Grou Academy"],
  [
    "grou-academy",
    "Vem junto com o PDA, dentro do Customer Success.Quem contrata o PDA tem acesso à Grou Academy pela plataforma ",
  ],
  [
    "grou-academy",
    "O que tem dentro.Cursos de aplicação do PDA, liderança e RH. Mais de 5.000 alunos já formados.",
  ],
  [
    "grou-academy",
    "Conhecimento para aplicar no dia a dia.Grou Academy · Masterclass Gestão Comportamental",
  ],
  [
    "grou-academy",
    "Certificação PDA, também gravada.Para quem prefere fazer no próprio ritmo. Compra opcional, dentro da Grou Aca",
  ],
  [
    "qr",
    "Questionário de ResiliênciaResiliência, a soft skill mais exigida pelo mercado, medida em oito componentes par",
  ],
  [
    "qr",
    "Resiliência como foco de desenvolvimento.Uma ferramenta para RH e consultores em seleção, desenvolvimento e ge",
  ],
  [
    "qr",
    "O que o Questionário de Resiliência avalia.Os oito componentes que orientam a interpretação dos resultados.",
  ],
  [
    "qr",
    "Da leitura técnica à conversa de desenvolvimento.Relatórios com funções complementares para apoiar a interpret",
  ],
  [
    "qr",
    "Autonomia para utilizar o Questionário.Formação Questionário de Resiliência · para RH e consultores.",
  ],
  [
    "qr",
    "Uma leitura que se conecta ao desenvolvimento.Como o Questionário de Resiliência aparece nas soluções da Grou.",
  ],
  [
    "dg",
    "Dilemas de GestãoAvalie o julgamento gerencial diante de situações de gestão de pessoas e identifique competên",
  ],
  [
    "dg",
    "Como o líder julga situações de gestão?Dilemas de Gestão utiliza a metodologia de Teste de Julgamento Situacio",
  ],
  ["dg", "Quatro competências. Oito elementos.O mapa de competências do Dilemas de Gestão."],
  [
    "dg",
    "Uma leitura para desenvolver a liderança.Aplicações da ferramenta em mapeamento, desenvolvimento e sucessão.",
  ],
  [
    "dg",
    "Prepare-se para interpretar e devolver resultados.Formação Dilemas de Gestão · RH e consultores que atuam com ",
  ],
  [
    "dg",
    "Da avaliação à prática da gestão.Diferentes aplicações do Dilemas de Gestão no portfólio Grou.",
  ],
  [
    "clima",
    "Pesquisa de Clima OrganizacionalSeu time tem muito a dizer. Perguntas certas, respostas anônimas e todos os re",
  ],
  [
    "clima",
    "Ouvir o time, com método.Escuta estruturada e confidencial sobre clima, liderança, comunicação e cultura, tran",
  ],
  [
    "clima",
    "O que a pesquisa resolve.Quando a gestão de pessoas precisa sair da percepção e ir para os dados.",
  ],
  [
    "clima",
    "Do briefing à ação.O projeto base tem briefing, aplicação e relatório online. As outras etapas são opcionais.",
  ],
  [
    "clima",
    "Veja na prática antes de contratar.A experiência do colaborador e o relatório online, com dados demonstrativos",
  ],
  [
    "clima",
    "Relatório de resultados.Incluído na aplicação, pronto em 10 dias após o encerramento da pesquisa.",
  ],
  [
    "clima",
    "Cada pergunta, em detalhe.Ranking das médias, distribuição das respostas, recortes por categoria e comentários",
  ],
  [
    "clima",
    "Relatório de RH com plano de ação.Leitura executiva dos resultados feita pelas especialistas da Grou, com suge",
  ],
  [
    "clima",
    "Monte o seu projeto.O projeto base inclui briefing, aplicação e relatório online. As outras etapas se combinam",
  ],
  [
    "atlas-360",
    "Atlas 360Autoavaliação e avaliação dos pares na plataforma Atlas, a mesma da Pesquisa de Clima.",
  ],
  [
    "atlas-360",
    "Feedback que vira caminho.A mesma pessoa vista por ela mesma e pelos pares. A distância entre os dois olhares ",
  ],
  [
    "atlas-360",
    "Quem avalia quem.Uma matriz define os avaliadores de cada pessoa, e todo mundo responde pelo celular.",
  ],
  [
    "atlas-360",
    "Como se vê × como é vista.Para cada pessoa, a média dos pares, a autoavaliação e a diferença entre as duas.",
  ],
  [
    "atlas-360",
    "Se vê acima, abaixo ou alinhada.O Atlas 360 usa a mesma régua para ler a diferença entre a autoavaliação e a m",
  ],
  [
    "atlas-360",
    "O que os pares dizem, sem assinatura.A pessoa avaliada lê como se vê ao lado do que os pares escreveram, pergu",
  ],
  ["consulting", "ConsultingEscolha a solução conforme o público e o objetivo da conversa."],
  [
    "master-lider",
    "Master LíderUma jornada de desenvolvimento para liderar a si, as relações e o trabalho.",
  ],
  [
    "master-lider",
    "Cinco pilares para sustentar a liderança.Uma base comum para liderar a si, as relações e o trabalho.",
  ],
  [
    "master-lider",
    "O desenvolvimento continua entre os encontros.Encontros quinzenais de 3 horas Formato híbrido 8 meses",
  ],
  ["master-lider", "Quatro fases, dezesseis módulos.16 módulos 3 horas por módulo 8 meses"],
  [
    "master-lider",
    "Autoconhecimento, conexão e comunicação.Fases 1 e 2 · Módulos 01–06 · 3 horas por módulo",
  ],
  ["master-lider", "Resiliência e bem-estar.Fase 3 · Módulos 07–10 · 3 horas por módulo"],
  ["master-lider", "Performance e futuro.Fase 4 · Módulos 11–13 · 3 horas por módulo"],
  ["master-lider", "Do repertório ao plano de ação.Fase 4 · Módulos 14–16 · 3 horas por módulo"],
  [
    "master-lider",
    "O que as lideranças desenvolvem ao longo da jornada.Autoconhecimento, relações e gestão conectados na prática.",
  ],
  ["master-lider", "Uma turma. Oito meses de desenvolvimento.Investimento e escopo"],
  [
    "lider-360",
    "Líder 360°Desenvolver líderes autogerenciáveis em 8 semanas, integrando ciência comportamental, PDA e PDI pers",
  ],
  [
    "lider-360",
    "Antes de liderar pessoas, liderar a si mesmo.A autogestão é a competência central do Líder 360°.",
  ],
  ["lider-360", "Do autoconhecimento à multiplicação com o time."],
  ["lider-360", "Líder 360°Investimento e escopo"],
  [
    "nr1-liderancas",
    "NR-1 aplicada às LiderançasPrepare líderes para atuar com responsabilidade, cuidado emocional e segurança psic",
  ],
  [
    "nr1-liderancas",
    "Saúde psicológica também passa pela liderança.Reconhecer fatores de risco, fortalecer relações e agir no cotid",
  ],
  ["nr1-liderancas", "O conteúdo que prepara a liderança."],
  ["nr1-liderancas", "NR-1 aplicada às LiderançasInvestimento e escopo"],
  [
    "capacitacao-pda",
    "Capacitação Analista Comportamental PDAAprenda a analisar perfis, conduzir devolutivas e utilizar o PDA em sel",
  ],
  [
    "capacitacao-pda",
    "Transformar dados comportamentais em orientação técnica.Da metodologia DISC à leitura de gráficos e indicadore",
  ],
  ["capacitacao-pda", "Capacitação Analista Comportamental PDAInvestimento e escopo"],
  [
    "pda-para-lideres",
    "PDA para LíderesCapacite lideranças para utilizar o PDA na gestão de pessoas, na tomada de decisão e no desenv",
  ],
  [
    "pda-para-lideres",
    "Da leitura do perfil à gestão de cada pessoa.Formação de 8h, do perfil à gestão de cada pessoa.",
  ],
  ["pda-para-lideres", "PDA para LíderesInvestimento e escopo"],
  [
    "sensibilizacao-pda",
    "Sensibilização de Lideranças com Foco no PDAApresente o PDA às lideranças e conecte o autoconhecimento à gestã",
  ],
  ["sensibilizacao-pda", "O que será trabalhado"],
  ["sensibilizacao-pda", "Como aconteceDuração, público e modalidade do encontro."],
  [
    "team-building",
    "Team Building com o PDAFortaleça a coesão e a performance do time com autoconhecimento, complementaridade de p",
  ],
  [
    "team-building",
    "Transformar diferenças em complementaridade.O workshop conecta a leitura comportamental às relações reais do t",
  ],
  ["team-building", "Team Building com o PDAInvestimento e escopo"],
  [
    "entrevista-competencias",
    "Entrevista por Competências com o PDACapacite RH e lideranças a usar o PDA para formular perguntas, validar co",
  ],
  [
    "entrevista-competencias",
    "O perfil orienta perguntas. A entrevista busca evidências.Uma aplicação prática do PDA no processo seletivo.",
  ],
  ["entrevista-competencias", "Entrevista por Competências com o PDAInvestimento e escopo"],
  [
    "vendas-comportamental",
    "Inteligência Comportamental para VendasTransforme dados comportamentais em estratégia comercial: compreenda co",
  ],
  [
    "vendas-comportamental",
    "Uma gestão comercial que conhece cada vendedor.A leitura comportamental ajuda o gestor a ajustar sua abordagem",
  ],
  [
    "vendas-comportamental",
    "Performance e perfil respondem a perguntas diferentes.Uma matriz para apoiar a conversa do gestor, sem substit",
  ],
  ["vendas-comportamental", "Inteligência Comportamental para VendasInvestimento e escopo"],
  [
    "pdi-com-pda",
    "Workshop PDI com o PDAAprenda a construir PDIs personalizados com a metodologia Grou, transformando o diagnóst",
  ],
  [
    "pdi-com-pda",
    "Um PDI precisa refletir a pessoa e seus desafios.O workshop capacita líderes e RH para conduzir o método da Gr",
  ],
  ["pdi-com-pda", "Workshop PDI com o PDAInvestimento e escopo"],
  [
    "devolutiva-pda",
    "Devolutiva em Grupo com o PDAUma leitura técnica e prática, conduzida por especialistas, para cada participant",
  ],
  ["devolutiva-pda", "Devolutiva em Grupo com o PDAInvestimento e escopo"],
  [
    "comunicacao-comportamento",
    "Comunicação e ComportamentoDesenvolva uma comunicação mais consciente e assertiva, adaptando linguagem, escuta",
  ],
  [
    "comunicacao-comportamento",
    "Comunicar bem é saber como falar com cada pessoa.Comportamento e prática relacional conectados pelo PDA.",
  ],
  ["comunicacao-comportamento", "Comunicação e ComportamentoInvestimento e escopo"],
  [
    "assessment-40",
    "Assessment 5.0Tecnologia, ciência e análise humana para compreender comportamento, potencial de liderança e re",
  ],
  [
    "assessment-40",
    "Uma avaliação para decisões estratégicas sobre pessoas.Desenvolvimento, sucessão, promoção e identificação de ",
  ],
  [
    "assessment-40",
    "Três leituras. Uma visão integrada.Mais do que um relatório: uma leitura integrada de comportamento, potencial",
  ],
  ["assessment-40", "Cinco etapas para uma avaliação integrada."],
  ["assessment-40", "Assessment 5.0Investimento e escopo"],
  [
    "assessment-40",
    "Assessment Report por participante. Dashboard de People Analytics, opcional.Os relatórios abaixo, do acervo Gr",
  ],
  [
    "mentoria-comportamental",
    "Mentoria ComportamentalApoie o líder a conhecer seu perfil e o de cada liderado, adaptando a gestão com orient",
  ],
  [
    "mentoria-comportamental",
    "Uma liderança que conhece pessoas gera times mais fortes.Acompanhamento individual do gestor, com especialista",
  ],
  ["mentoria-comportamental", "Conhecer as pessoas para orientar a gestão."],
  [
    "devolutiva-individual",
    "Devolutiva IndividualUma conversa com especialista para interpretar os indicadores do PDA, compreender o compo",
  ],
  ["devolutiva-individual", "Uma leitura conectada ao objetivo de quem recebe."],
  [
    "pdi-individual",
    "PDI para Desenvolvimento IndividualConstrua e acompanhe seu PDI comportamental com o modelo Grou, a partir da ",
  ],
  ["pdi-individual", "Um plano individual, construído e acompanhado."],
  ["pdi-individual", "Quatro sessões para orientar o desenvolvimento."],
  ["self-guru", "Self GuruDesenvolvimento comportamental que vira performance."],
  [
    "self-guru",
    "Autonomia para a pessoa. Visibilidade para o RH.Uma plataforma para organizar a jornada de desenvolvimento.",
  ],
  [
    "self-guru",
    "Do diagnóstico ao desenvolvimento acompanhado.Objetivos, encontros e acompanhamento de evolução.",
  ],
  [
    "self-guru",
    "Desenvolvimento conectado à pessoa e ao negócio.Benefícios esperados dos programas Self Guru.",
  ],
  ["self-guru", "Qual momento pede acompanhamento?Escolha conforme o público e o desafio."],
  [
    "self-guru",
    "CoachingPrograma que desenvolve líderes de modo personalizado e ágil, utilizando tecnologias para o autoconhec",
  ],
  ["self-guru", "Do diagnóstico ao plano de ação."],
  [
    "self-guru",
    "Mentoria On-DemandOrientação estratégica, sob medida e no momento certo, para decisões e desafios reais de ges",
  ],
  ["self-guru", "Um desafio. Uma conversa com especialista."],
  [
    "self-guru",
    "TransitionDesligamento responsável, com propósito e acolhimento, para apoiar o reposicionamento e o protagonis",
  ],
  ["self-guru", "Acolhimento e direção para o próximo passo."],
  [
    "self-guru",
    "Planejamento de CarreiraA mudança de trabalho, empresa ou até mesmo de profissão, muitas vezes faz parte da su",
  ],
  ["self-guru", "Clareza para decidir os próximos passos."],
  [
    "self-guru",
    "Uma contratação alinhada ao momento.Programa, público e quantidade de participantes.",
  ],
  [
    "groutalent",
    "GrouTalentRecrutamento, Seleção e Hunting de alta performance com inteligência comportamental.",
  ],
  [
    "groutalent",
    "Duas especialidades a serviço da contratação.A GrouTalent une tecnologia, metodologia e experiência prática em",
  ],
  [
    "groutalent",
    "Cada operação tem um desafio de contratação.Experiências em logística, serviços especializados e comércio exte",
  ],
  [
    "groutalent",
    "Um processo com critérios em cada etapa.O onboarding alinha expectativas, responsabilidades e a comunicação co",
  ],
  ["groutalent", "Tecnologia e desenvolvimento apoiam a contratação."],
  [
    "groutalent",
    "O custo não termina na contratação.Uma contratação errada não custa só clima: custa caixa. Dimensionamos o imp",
  ],
  ["groutalent", "Prazos e garantias acompanham o perfil da vaga."],
  ["groutalent", "Uma proposta para a vaga que você precisa preencher."],
];
