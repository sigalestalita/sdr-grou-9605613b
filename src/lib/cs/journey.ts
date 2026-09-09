/*
 * E-mails das Jornadas Reais GROU — Bloco 14 do playbook. Série de 4 por marco
 * temporal da licença (não pela sinaleira); texto fixo e calibrado — a
 * personalização é só [nome] e a assinatura. Configuração em
 * cs_settings.journey_emails; aqui os padrões e a lógica pura.
 */
export type JourneyEmail = {
  id: string;
  /** Dia da licença em que dispara (30, 90, 180, 300). */
  dia: number;
  titulo: string;
  assunto: string;
  /** tag_uso aceitas; vazio = todos. "ambos" sempre aceita quando a lista não está vazia. */
  tag_uso: string[];
  para_quem: string;
  /** Texto com [nome]; a assinatura é acrescentada no envio. */
  corpo: string;
  ativo: boolean;
};

export type JourneyConfig = {
  /** aprovacao: fica pendente até o analista clicar Enviar; automatico: envia no dia. */
  modo: "aprovacao" | "automatico";
  assinatura: string;
  /** Responder-para = caixa vinculada do CS responsável. */
  responder_para_responsavel: boolean;
  /** Dias após o marco em que ainda vale enviar; depois expira. */
  janela_dias: number;
  emails: JourneyEmail[];
};

export const DEFAULT_JOURNEY_CONFIG: JourneyConfig = {
  modo: "aprovacao",
  assinatura: "Marcela",
  responder_para_responsavel: true,
  janela_dias: 14,
  emails: [
  {
    "id": "jornada-1",
    "dia": 30,
    "titulo": "E-mail 1 — 30 dias de licença",
    "assunto": "1 mês de PDA — você já usou no processo seletivo?",
    "tag_uso": [
      "recrutamento"
    ],
    "para_quem": "clientes com tag_uso = recrutamento ou recrutamento_e_desenvolvimento",
    "corpo": "Oi [nome],\n\nCompletamos um mês de parceria, e queria aproveitar esse marco pra compartilhar algo que pode fazer diferença nos seus próximos processos seletivos.\n\nA GROU lançou um episódio do Jornadas Reais com um especialista em dados falando sobre como usar o PDA pra tornar o recrutamento mais objetivo. Não pra substituir o olhar humano — mas pra dar a ele uma base concreta.\n\nA pergunta central do episódio é simples e poderosa: qual é o perfil comportamental que realmente performa nas vagas que você contrata?\n\nCom o PDA, você consegue mapear isso. E quando você tem esse perfil como referência, cada novo processo começa com um critério claro — não com achismo.\n\nVale assistir: https://www.youtube.com/watch?v=W-af1lEE1ek\n\nQualquer dúvida sobre como usar o PDA no recrutamento aí com vocês, me chama.",
    "ativo": true
  },
  {
    "id": "jornada-2",
    "dia": 90,
    "titulo": "E-mail 2 — 90 dias de contrato",
    "assunto": "3 meses de PDA — você já analisou o eixo de Risco da sua equipe?",
    "tag_uso": [],
    "para_quem": "todos os clientes — adaptar abertura se empresa for 100% desk (sem exposição física)",
    "corpo": "Oi [nome],\n\nCom 3 meses de uso, você já tem um volume interessante de dados comportamentais. Queria te mostrar uma análise que muitos clientes ainda não exploram — e que pode ter impacto direto na operação de vocês.\n\nNo PDA, o eixo de Risco mede o quanto uma pessoa age com iniciativa, velocidade e tolerância a situações de incerteza. Em áreas como vendas e liderança, isso é uma vantagem. Mas em funções operacionais, de campo ou com exposição física, um perfil de risco elevado sem a gestão correta pode ser um sinal de atenção.\n\nA GROU trouxe esse tema de forma muito prática num episódio do Jornadas Reais. É o tipo de conteúdo que faz a liderança olhar pro PDA de um jeito diferente.\n\nVale assistir: https://www.youtube.com/watch?v=GA5w8Mx5QEs\n\nSe quiser, posso te ajudar a olhar pra isso nos perfis que vocês já têm na plataforma. Às vezes a resposta já está nos dados — a gente só precisa saber onde olhar.",
    "ativo": true
  },
  {
    "id": "jornada-3",
    "dia": 180,
    "titulo": "E-mail 3 — 6 meses de utilização",
    "assunto": "6 meses de PDA — o perfil do seu time comercial bate com quem realmente vende?",
    "tag_uso": [],
    "para_quem": "clientes com time comercial — adaptar para outras áreas se necessário",
    "corpo": "Oi [nome],\n\nSeis meses é um bom momento pra fazer uma pergunta diferente: o que os dados de vocês estão dizendo?\n\nUma das análises mais poderosas que dá pra fazer com o PDA é cruzar perfil comportamental com performance — e ver se quem bate meta tem algo em comum. Essa resposta costuma surpreender.\n\nNo time comercial, por exemplo: existe uma diferença real entre o perfil de quem fecha bem e o de quem luta pra fechar? Se existe, você pode usar isso na contratação, no desenvolvimento e até na distribuição de carteiras.\n\nA GROU abriu esse assunto num episódio do Jornadas Reais com cases reais de times de vendas. Vale os 40 minutos:\n\nhttps://www.youtube.com/watch?v=aGjgqydFi48\n\nSe quiser trazer esse olhar pra equipe de vocês, posso propor uma análise a partir dos perfis que já estão na plataforma. Seria uma boa conversa antes de qualquer movimentação no time.\n\nMe fala o que acha.",
    "ativo": true
  },
  {
    "id": "jornada-4",
    "dia": 300,
    "titulo": "E-mail 4 — 10 meses de utilização",
    "assunto": "10 meses de PDA — o que construímos juntos (e o que ainda dá pra ir mais fundo)",
    "tag_uso": [],
    "para_quem": "todos os clientes",
    "corpo": "Oi [nome],\n\nEstamos chegando nos 10 meses de parceria, e eu queria aproveitar esse momento pra fazer uma pausa e olhar pro que foi construído até aqui.\n\nVocês já têm um volume real de dados comportamentais na plataforma. Dependendo de como usaram ao longo do ano — em seleção, em desenvolvimento, na leitura de times — esse é um ativo que tende a ser cada vez mais valioso com o tempo. Perfil comportamental não envelhece: ele ajuda a entender padrões, comparar momentos, embasar decisões que antes eram só intuição.\n\nQuero marcar uma conversa com vocês antes do fim do contrato — não pra falar de renovação agora, mas pra entender como foi o uso, o que funcionou, o que ficou na gaveta e o que faz sentido aprofundar no próximo ciclo. Às vezes uma hora de conversa muda o olhar sobre o que a ferramenta pode entregar.\n\nQual semana fica melhor pra você?",
    "ativo": true
  }
],
};

export type JourneyRowLite = { email_id: string; status: string };

/** Marcos que devem existir para o cliente hoje: agendado (futuro) ou pendente/expirado (passado). */
export function planJourney(
  input: { licenseStart: string | null; tagUso: string | null | undefined; now?: Date },
  existing: JourneyRowLite[],
  cfg: JourneyConfig = DEFAULT_JOURNEY_CONFIG,
): Array<{ emailId: string; dueAt: string; status: "agendado" | "pendente" | "expirado" }> {
  if (!input.licenseStart) return [];
  const now = input.now ?? new Date();
  const start = new Date(input.licenseStart);
  if (Number.isNaN(start.getTime())) return [];
  const have = new Set(existing.map((r) => r.email_id));
  const out: Array<{ emailId: string; dueAt: string; status: "agendado" | "pendente" | "expirado" }> = [];
  for (const e of cfg.emails) {
    if (!e.ativo || have.has(e.id)) continue;
    if (e.tag_uso.length && input.tagUso !== "ambos" && !(input.tagUso && e.tag_uso.includes(input.tagUso))) continue;
    const due = new Date(start.getTime() + e.dia * 86400000);
    const diff = Math.floor((now.getTime() - due.getTime()) / 86400000);
    const status = diff < 0 ? "agendado" : diff <= cfg.janela_dias ? "pendente" : "expirado";
    out.push({ emailId: e.id, dueAt: due.toISOString().slice(0, 10), status });
  }
  return out;
}

/** Substitui [nome] e acrescenta a assinatura. */
export function renderJourneyBody(corpo: string, nome: string | null, assinatura: string): string {
  const first = (nome ?? "").trim().split(/\s+/)[0] || "";
  return corpo.replace(/\[nome\]/g, first || "tudo bem").replace(/Oi tudo bem,/, "Oi, tudo bem?") + "\n\n" + assinatura;
}

export function journeyBodyToHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return text
    .split(/\n{2,}/)
    .map((p) => "<p style=\"margin:0 0 14px;line-height:1.5\">" + esc(p).replace(/(https?:\/\/\S+)/g, "<a href=\"$1\">$1</a>").replace(/\n/g, "<br>") + "</p>")
    .join("");
}
