import { RETOMADA_TEMPLATES, type RetomadaTemplate } from "./retomada-templates";

/*
 * Templates que o sistema mantém versionados em código.
 *
 * Ficam aqui, e não só na migration, porque a aba Templates cria todos com um
 * clique — sem depender de alguém aplicar SQL. Repetir a ação não duplica:
 * o seed pula os que já existem pelo nome do HSM.
 */

export type TemplateDoSistema = RetomadaTemplate;

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

/** Tudo que o botão da aba Templates sabe criar. */
export const TEMPLATES_DO_SISTEMA: TemplateDoSistema[] = [
  ...PRIMEIRO_CONTATO_TEMPLATES,
  ...RETOMADA_TEMPLATES,
];
