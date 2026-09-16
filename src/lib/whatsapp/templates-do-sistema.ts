import { RETOMADA_TEMPLATES, type RetomadaTemplate } from "./retomada-templates";

/*
 * Templates que o sistema mantém versionados em código.
 *
 * Ficam aqui, e não só na migration, porque a aba Templates cria todos com um
 * clique — sem depender de alguém aplicar SQL. Repetir a ação não duplica:
 * o seed pula os que já existem pelo nome do HSM.
 */

export type TemplateDoSistema = RetomadaTemplate & {
  /**
   * Último dia de disparo, para template de campanha.
   *
   * O corpo aprovado na Meta é fixo: um template que diz "até 30 de setembro"
   * continuaria sendo enviado em outubro, prometendo condição encerrada. Com
   * data, o disparo inicial ignora o vencido e cai no neutro.
   */
  validoAte?: string | null;
};

/**
 * A primeira mensagem, no nome do SDR responsável.
 *
 * A versão antiga dizia "em breve um especialista da nossa equipe vai falar
 * com você", e isso não descreve o que acontece: quando o lead responde, quem
 * atende é esse mesmo SDR, por esse mesmo número. Prometer um segundo contato
 * que nunca vem faz a pessoa esperar em vez de conversar.
 *
 * {{sdr}} é resolvido no envio, a partir do responsável pelo lead; sem
 * responsável, cai na assinatura padrão configurada na IA.
 *
 * Sem botão de resposta rápida de propósito: aqui a pergunta é aberta, e um
 * botão empurraria a pessoa para uma resposta de uma palavra.
 */
export const PRIMEIRO_CONTATO_TEMPLATES: TemplateDoSistema[] = [
  {
    name: "Primeiro contato do SDR (empresa)",
    provider_template_name: "primeiro_contato_sdr",
    category: "utility",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊\n\n" +
      "Vi que você buscou nossas soluções de gestão de pessoas e queria entender melhor o seu contexto.\n\n" +
      "Qual é hoje o principal desafio de gestão de pessoas na sua empresa?",
    variables: ["primeiro_nome", "sdr"],
    footer_text: null,
    buttons: [],
    quando: "Primeira mensagem, logo depois da conversão do lead empresa",
  },
  {
    name: "Primeiro contato do SDR (consultoria)",
    provider_template_name: "primeiro_contato_sdr_consultoria",
    category: "utility",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊\n\n" +
      "Vi que você buscou a Grou e queria entender melhor como você trabalha hoje.\n\n" +
      "Você atende clientes como consultor ou está buscando para a sua própria empresa?",
    variables: ["primeiro_nome", "sdr"],
    footer_text: null,
    buttons: [],
    quando: "Primeira mensagem, logo depois da conversão do lead consultoria",
  },
];

/**
 * Primeiro contato com a antecipação da Black September.
 *
 * Pergunta primeiro, oferta depois, em uma linha só.
 *
 * Primeira mensagem de WhatsApp que chega em bloco, com lista de tópicos e
 * parágrafo de contexto, é lida como disparo e arquivada. A pergunta é o que
 * pede resposta; a condição vai no fim, como quem comenta, porque ela serve
 * para acelerar a resposta e não para ser o assunto. As condições de cada
 * público estão em Inbox → IA, e é de lá que a IA fala de valor; aqui o
 * template só avisa que existe prazo.
 *
 * O texto diz "na abertura de licença" de propósito. A campanha tem condições
 * diferentes para cliente e não cliente, e a IA só conhece as de quem ainda não
 * é — abertura é o que separa os dois casos. Prometer "condições especiais" sem
 * escopo faria um cliente atual responder esperando algo que a IA não pode dar,
 * e depois de aprovado na Meta o texto não muda mais.
 */
export const CAMPANHA_TEMPLATES: TemplateDoSistema[] = [
  {
    name: "OFERTA BLACK — primeiro contato (consultoria)",
    provider_template_name: "oferta_black_consultoria",
    // Marketing, e não utility: a Meta reclassifica template que cita promoção.
    category: "marketing",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊\n\n" +
      "Vi que você buscou a gente. Você atende clientes como consultor ou é pra sua própria empresa?\n\n" +
      "Ah, e até dia 30 a abertura de licença PDA está com 20% off acima de 250 créditos — " +
      "abaixo disso, a licença vem com uma capacitação Analista PDA ao vivo. Os treinamentos, com 30%.",
    variables: ["primeiro_nome", "sdr"],
    footer_text: null,
    buttons: [],
    quando: "Primeira mensagem de lead consultoria, enquanto a campanha de setembro vale",
    validoAte: "2026-09-30",
  },
  {
    name: "OFERTA BLACK — primeiro contato (empresa)",
    provider_template_name: "oferta_black_empresa",
    category: "marketing",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊\n\n" +
      "Vi que você buscou a gente pra gestão de pessoas. Qual é o maior desafio aí hoje?\n\n" +
      "Ah, e até dia 30 a abertura de licença PDA está com 20% off, e os treinamentos com 30%.",
    variables: ["primeiro_nome", "sdr"],
    footer_text: null,
    buttons: [],
    quando:
      "Primeira mensagem de lead empresa ou pessoa física, enquanto a campanha de setembro vale",
    validoAte: "2026-09-30",
  },
];

/** Tudo que o botão da aba Templates sabe criar. */
export const TEMPLATES_DO_SISTEMA: TemplateDoSistema[] = [
  ...CAMPANHA_TEMPLATES,
  ...PRIMEIRO_CONTATO_TEMPLATES,
  ...RETOMADA_TEMPLATES,
];
