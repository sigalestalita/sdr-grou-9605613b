/*
 * Resumo da conta por time (pedido da Fernanda na apresentação do CRM ao CS).
 *
 * Numa ficha de empresa, qualquer pessoa vê o que cada time fez com ela: SDR,
 * Comercial, CS, Administrativo e Trainers. Cada cartão responde às mesmas
 * perguntas: quem cuida, o que foi feito por último, dois ou três números e o
 * que pede atenção. Embaixo, uma linha do tempo única com filtro por time.
 *
 * Aqui ficam só as regras (sem banco), para serem as mesmas na ficha, no
 * resumo em texto e nos alertas do Início.
 */

export type Time = "sdr" | "comercial" | "cs" | "adm" | "trainers";

export const TIMES: Array<{ id: Time; nome: string }> = [
  { id: "sdr", nome: "SDR" },
  { id: "comercial", nome: "Comercial" },
  { id: "cs", nome: "CS" },
  { id: "adm", nome: "Administrativo" },
  { id: "trainers", nome: "Trainers" },
];

export type Evento = {
  time: Time;
  quando: string;
  titulo: string;
  detalhe: string | null;
  quem: string | null;
  link: string | null;
};

export type Numero = { rotulo: string; valor: string };

export type Cartao = {
  time: Time;
  nome: string;
  responsaveis: string[];
  ultima: Evento | null;
  numeros: Numero[];
  alertas: string[];
  vazio: boolean;
};

const DIA = 86400000;
export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dias = (iso: string, agora: number) => Math.floor((agora - Date.parse(iso)) / DIA);

/* ------------------------------------------------------------------ */
/* Entrada: o que o servidor lê do banco, já com nomes de pessoas.     */
/* ------------------------------------------------------------------ */

export type DadosDaConta = {
  agora: number;
  // SDR
  leads: Array<{
    id: string;
    nome: string | null;
    sdr: string | null;
    criadoEm: string;
    reuniaoEm: string | null;
    followUpEm: string | null;
    etapa: string | null;
  }>;
  toques: Array<{
    leadId: string;
    quando: string;
    canal: string | null;
    resultado: string | null;
    quem: string | null;
  }>;
  // Comercial
  negocios: Array<{
    id: string;
    nome: string | null;
    status: string;
    valor: number | null;
    responsavel: string | null;
    criadoEm: string;
    fechadoEm: string | null;
    etapa: string | null;
  }>;
  atividadesNegocio: Array<{
    dealId: string;
    quando: string;
    tipo: string | null;
    descricao: string | null;
    quem: string | null;
  }>;
  propostas: Array<{
    id: string;
    numero: string | number | null;
    status: string;
    valor: number | null;
    enviadaEm: string | null;
    aceitaEm: string | null;
    recusadaEm: string | null;
    criadoEm: string;
    quem: string | null;
  }>;
  reunioesAnalisadas: Array<{
    id: string;
    titulo: string | null;
    quando: string;
    quem: string | null;
    tipo: string | null;
    proximoPasso: string | null;
  }>;
  // CS
  fichas: Array<{
    clientUid: string;
    responsavel: string | null;
    sinal: string | null;
    saude: number | null;
    renovacao: string | null;
    ativo: boolean;
    ultimoContato: string | null;
  }>;
  reunioesCs: Array<{
    id: string;
    clientUid: string;
    titulo: string | null;
    quando: string;
    status: string | null;
    quem: string | null;
    proximoPasso: string | null;
  }>;
  tarefasCs: Array<{
    id: string;
    titulo: string | null;
    status: string;
    venceEm: string | null;
    feitaEm: string | null;
    quem: string | null;
  }>;
  tickets: Array<{
    id: string;
    numero: number | null;
    titulo: string | null;
    status: string;
    criadoEm: string;
    resolvidoEm: string | null;
    quem: string | null;
  }>;
  oportunidades: Array<{
    id: string;
    tipo: string | null;
    status: string | null;
    valor: number | null;
    criadoEm: string;
    quem: string | null;
  }>;
  /** Linha do tempo do CS (notas, e-mails, WhatsApp já agrupado por dia no servidor). */
  registrosCs: Array<{
    quando: string;
    titulo: string;
    detalhe: string | null;
    quem: string | null;
  }>;
  // Administrativo
  fichasCadastrais: Array<{
    id: string;
    origem: string | null;
    enviadaEm: string | null;
    confirmadaEm: string | null;
    quem: string | null;
  }>;
  faturas: Array<{
    id: string;
    numeroNf: string | null;
    emitidaEm: string | null;
    valorLiquido: number | null;
    status: string;
    quem: string | null;
  }>;
  parcelas: Array<{
    faturaId: string;
    vencimento: string;
    valor: number | null;
    pagoEm: string | null;
  }>;
  // Trainers
  requerimentos: Array<{
    id: string;
    numero: string | number | null;
    servico: string | null;
    status: string;
    criadoEm: string;
    quem: string | null;
  }>;
  sessoes: Array<{
    id: string;
    requerimentoId: string;
    titulo: string | null;
    data: string | null;
    status: string;
    trainer: string | null;
  }>;
  inscricoes: Array<{
    id: string;
    turma: string | null;
    participante: string | null;
    status: string | null;
    checkinEm: string | null;
    criadoEm: string;
    trainer: string | null;
  }>;
};

/* ------------------------------------------------------------------ */
/* Alertas: o que pede atenção, por time. As mesmas regras valem no    */
/* SQL de alertas do Início (alertas_das_contas).                      */
/* ------------------------------------------------------------------ */

export function alertasPorTime(d: DadosDaConta): Record<Time, string[]> {
  const a: Record<Time, string[]> = { sdr: [], comercial: [], cs: [], adm: [], trainers: [] };
  const hoje = new Date(d.agora).toISOString().slice(0, 10);

  const fup = d.leads.filter((l) => l.followUpEm && d.agora - Date.parse(l.followUpEm) > 3 * DIA);
  if (fup.length)
    a.sdr.push(
      `${fup.length} follow-up${fup.length > 1 ? "s" : ""} vencido${fup.length > 1 ? "s" : ""} há mais de 3 dias`,
    );

  const paradas = d.propostas.filter(
    (p) =>
      ["enviada", "visualizada"].includes(p.status) &&
      p.enviadaEm &&
      d.agora - Date.parse(p.enviadaEm) > 7 * DIA,
  );
  if (paradas.length)
    a.comercial.push(
      `${paradas.length} proposta${paradas.length > 1 ? "s" : ""} sem resposta há mais de 7 dias`,
    );

  const ativa = d.fichas.find((f) => f.ativo) ?? null;
  if (ativa?.sinal === "vermelho" || ativa?.sinal === "preto")
    a.cs.push(`Sinaleira ${ativa.sinal}`);
  const ticketsAbertos = d.tickets.filter((t) => ["aberto", "em_andamento"].includes(t.status));
  if (ticketsAbertos.length)
    a.cs.push(
      `${ticketsAbertos.length} ticket${ticketsAbertos.length > 1 ? "s" : ""} aberto${ticketsAbertos.length > 1 ? "s" : ""}`,
    );
  const tarefasVencidas = d.tarefasCs.filter(
    (t) => t.status === "pendente" && t.venceEm && Date.parse(t.venceEm) < d.agora,
  );
  if (tarefasVencidas.length)
    a.cs.push(
      `${tarefasVencidas.length} tarefa${tarefasVencidas.length > 1 ? "s" : ""} atrasada${tarefasVencidas.length > 1 ? "s" : ""}`,
    );
  if (ativa?.renovacao) {
    const faltam = Math.ceil((Date.parse(`${ativa.renovacao}T12:00:00`) - d.agora) / DIA);
    if (faltam >= 0 && faltam <= 60)
      a.cs.push(`Renovação em ${faltam} dia${faltam === 1 ? "" : "s"}`);
  }

  const emitidas = new Set(d.faturas.filter((f) => f.status !== "cancelada").map((f) => f.id));
  const vencidas = d.parcelas.filter(
    (p) => emitidas.has(p.faturaId) && !p.pagoEm && p.vencimento < hoje,
  );
  if (vencidas.length) {
    const total = vencidas.reduce((t, p) => t + Number(p.valor ?? 0), 0);
    a.adm.push(
      `${vencidas.length} parcela${vencidas.length > 1 ? "s" : ""} vencida${vencidas.length > 1 ? "s" : ""} (${brl(total)})`,
    );
  }
  // As do CSV são o histórico importado: nunca passaram pela conferência do Compass.
  const fichaPendente = d.fichasCadastrais.filter(
    (f) => f.enviadaEm && !f.confirmadaEm && f.origem !== "csv",
  );
  if (fichaPendente.length) a.adm.push("Ficha cadastral esperando conferência");

  const semRegistro = d.sessoes.filter(
    (s) => s.data && s.data < hoje && ["a_confirmar", "confirmado"].includes(s.status),
  );
  if (semRegistro.length)
    a.trainers.push(
      `${semRegistro.length} sessão${semRegistro.length > 1 ? "ões" : ""} passada${semRegistro.length > 1 ? "s" : ""} sem registro`,
    );

  return a;
}

/* ------------------------------------------------------------------ */
/* Linha do tempo: tudo o que aconteceu, num formato só.               */
/* ------------------------------------------------------------------ */

export function linhaDoTempo(d: DadosDaConta): Evento[] {
  const ev: Evento[] = [];
  const nomeLead = new Map(d.leads.map((l) => [l.id, l.nome]));
  for (const l of d.leads)
    ev.push({
      time: "sdr",
      quando: l.criadoEm,
      titulo: "Lead entrou",
      detalhe: l.nome,
      quem: l.sdr,
      link: `/lead/${l.id}`,
    });
  for (const t of d.toques)
    ev.push({
      time: "sdr",
      quando: t.quando,
      titulo: `Toque${t.canal ? ` por ${t.canal}` : ""}`,
      detalhe: [nomeLead.get(t.leadId), t.resultado].filter(Boolean).join(" · ") || null,
      quem: t.quem,
      link: `/lead/${t.leadId}`,
    });
  for (const l of d.leads)
    if (l.reuniaoEm)
      ev.push({
        time: "sdr",
        quando: l.reuniaoEm,
        titulo: "Reunião agendada pelo SDR",
        detalhe: l.nome,
        quem: l.sdr,
        link: `/lead/${l.id}`,
      });

  const nomeNegocio = new Map(d.negocios.map((n) => [n.id, n.nome]));
  for (const n of d.negocios) {
    ev.push({
      time: "comercial",
      quando: n.criadoEm,
      titulo: "Negócio aberto",
      detalhe: [n.nome, n.valor ? brl(n.valor) : null].filter(Boolean).join(" · ") || null,
      quem: n.responsavel,
      link: `/negocio/${n.id}`,
    });
    if (n.fechadoEm && (n.status === "won" || n.status === "lost"))
      ev.push({
        time: "comercial",
        quando: n.fechadoEm,
        titulo: n.status === "won" ? "Negócio ganho" : "Negócio perdido",
        detalhe: [n.nome, n.valor ? brl(n.valor) : null].filter(Boolean).join(" · ") || null,
        quem: n.responsavel,
        link: `/negocio/${n.id}`,
      });
  }
  for (const a of d.atividadesNegocio)
    ev.push({
      time: "comercial",
      quando: a.quando,
      titulo: a.tipo ? `Atividade: ${a.tipo}` : "Atividade no negócio",
      detalhe:
        [nomeNegocio.get(a.dealId), a.descricao?.slice(0, 140)].filter(Boolean).join(" · ") || null,
      quem: a.quem,
      link: `/negocio/${a.dealId}`,
    });
  for (const p of d.propostas) {
    if (p.enviadaEm)
      ev.push({
        time: "comercial",
        quando: p.enviadaEm,
        titulo: `Proposta ${p.numero ?? ""} enviada`.replace("  ", " "),
        detalhe: p.valor ? brl(p.valor) : null,
        quem: p.quem,
        link: null,
      });
    if (p.aceitaEm)
      ev.push({
        time: "comercial",
        quando: p.aceitaEm,
        titulo: `Proposta ${p.numero ?? ""} aceita`.replace("  ", " "),
        detalhe: p.valor ? brl(p.valor) : null,
        quem: p.quem,
        link: null,
      });
    if (p.recusadaEm)
      ev.push({
        time: "comercial",
        quando: p.recusadaEm,
        titulo: `Proposta ${p.numero ?? ""} recusada`.replace("  ", " "),
        detalhe: null,
        quem: p.quem,
        link: null,
      });
  }
  // Reunião analisada é do time de quem conduziu; sem saber, fica no comercial (venda) ou CS (atendimento).
  for (const r of d.reunioesAnalisadas)
    ev.push({
      time: r.tipo === "atendimento" ? "cs" : "comercial",
      quando: r.quando,
      titulo: `Reunião analisada${r.titulo ? `: ${r.titulo}` : ""}`,
      detalhe: r.proximoPasso ? `Próximo passo: ${r.proximoPasso}` : null,
      quem: r.quem,
      link: null,
    });

  for (const r of d.reunioesCs)
    ev.push({
      time: "cs",
      quando: r.quando,
      titulo: `Reunião${r.titulo ? `: ${r.titulo}` : ""}`,
      detalhe:
        [
          r.status === "agendada" ? "agendada" : null,
          r.proximoPasso ? `Próximo passo: ${r.proximoPasso}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      quem: r.quem,
      link: `/empresas/${r.clientUid}`,
    });
  for (const t of d.tarefasCs)
    if (t.feitaEm)
      ev.push({
        time: "cs",
        quando: t.feitaEm,
        titulo: `Tarefa feita${t.titulo ? `: ${t.titulo}` : ""}`,
        detalhe: null,
        quem: t.quem,
        link: null,
      });
  for (const t of d.tickets) {
    ev.push({
      time: "cs",
      quando: t.criadoEm,
      titulo: `Ticket #${t.numero ?? ""} aberto`,
      detalhe: t.titulo,
      quem: t.quem,
      link: "/cs-tickets",
    });
    if (t.resolvidoEm)
      ev.push({
        time: "cs",
        quando: t.resolvidoEm,
        titulo: `Ticket #${t.numero ?? ""} resolvido`,
        detalhe: t.titulo,
        quem: t.quem,
        link: "/cs-tickets",
      });
  }
  for (const r of d.registrosCs)
    ev.push({
      time: "cs",
      quando: r.quando,
      titulo: r.titulo,
      detalhe: r.detalhe,
      quem: r.quem,
      link: null,
    });
  for (const o of d.oportunidades)
    ev.push({
      time: "cs",
      quando: o.criadoEm,
      titulo: "Oportunidade sinalizada",
      detalhe: [o.tipo, o.valor ? brl(o.valor) : null].filter(Boolean).join(" · ") || null,
      quem: o.quem,
      link: null,
    });

  for (const f of d.fichasCadastrais) {
    if (f.enviadaEm)
      ev.push({
        time: "adm",
        quando: f.enviadaEm,
        titulo: "Ficha cadastral recebida",
        detalhe: null,
        quem: null,
        link: null,
      });
    if (f.confirmadaEm)
      ev.push({
        time: "adm",
        quando: f.confirmadaEm,
        titulo: "Ficha cadastral conferida",
        detalhe: null,
        quem: f.quem,
        link: null,
      });
  }
  for (const f of d.faturas)
    if (f.emitidaEm)
      ev.push({
        time: "adm",
        quando: f.emitidaEm,
        titulo:
          f.status === "cancelada"
            ? `NF ${f.numeroNf ?? ""} cancelada`
            : `NF ${f.numeroNf ?? ""} emitida`,
        detalhe: f.valorLiquido ? brl(f.valorLiquido) : null,
        quem: f.quem,
        link: null,
      });
  const nf = new Map(d.faturas.map((f) => [f.id, f.numeroNf]));
  for (const p of d.parcelas)
    if (p.pagoEm)
      ev.push({
        time: "adm",
        quando: p.pagoEm,
        titulo: `Pagamento recebido${nf.get(p.faturaId) ? ` (NF ${nf.get(p.faturaId)})` : ""}`,
        detalhe: p.valor ? brl(Number(p.valor)) : null,
        quem: null,
        link: null,
      });

  const servico = new Map(d.requerimentos.map((r) => [r.id, r.servico]));
  for (const r of d.requerimentos)
    ev.push({
      time: "trainers",
      quando: r.criadoEm,
      titulo: `Requerimento ${r.numero ?? ""} aberto`,
      detalhe: r.servico,
      quem: r.quem,
      link: null,
    });
  for (const s of d.sessoes)
    if (s.data)
      ev.push({
        time: "trainers",
        quando: `${s.data}T12:00:00-03:00`,
        titulo: `Sessão ${s.status === "realizado" ? "realizada" : s.status === "cancelado" ? "cancelada" : "marcada"}${s.titulo ? `: ${s.titulo}` : ""}`,
        detalhe: servico.get(s.requerimentoId) ?? null,
        quem: s.trainer,
        link: null,
      });
  for (const i of d.inscricoes)
    ev.push({
      time: "trainers",
      quando: i.checkinEm ?? i.criadoEm,
      titulo: i.checkinEm ? "Check-in na turma" : "Inscrição em turma",
      detalhe: [i.participante, i.turma].filter(Boolean).join(" · ") || null,
      quem: i.trainer,
      link: null,
    });

  return ev
    .filter(
      (e) =>
        e.quando &&
        !Number.isNaN(Date.parse(e.quando)) &&
        Date.parse(e.quando) <= d.agora + 120 * DIA,
    )
    .sort((x, y) => Date.parse(y.quando) - Date.parse(x.quando));
}

/* ------------------------------------------------------------------ */
/* Cartões                                                             */
/* ------------------------------------------------------------------ */

const unicos = (xs: Array<string | null | undefined>) => [
  ...new Set(xs.filter((x): x is string => !!x)),
];

export function montarCartoes(d: DadosDaConta, eventos = linhaDoTempo(d)): Cartao[] {
  const alertas = alertasPorTime(d);
  const ultimaDe = (t: Time) =>
    eventos.find((e) => e.time === t && Date.parse(e.quando) <= d.agora) ?? null;
  const ativa = d.fichas.find((f) => f.ativo) ?? d.fichas[0] ?? null;

  const ganhos = d.negocios.filter((n) => n.status === "won");
  const abertos = d.negocios.filter((n) => n.status === "open");
  const soma = (xs: Array<{ valor: number | null }>) =>
    xs.reduce((t, x) => t + Number(x.valor ?? 0), 0);
  const emitidas = d.faturas.filter((f) => f.status !== "cancelada");
  const pago = d.parcelas.filter((p) => p.pagoEm).reduce((t, p) => t + Number(p.valor ?? 0), 0);
  const emAberto = d.parcelas
    .filter((p) => !p.pagoEm && emitidas.some((f) => f.id === p.faturaId))
    .reduce((t, p) => t + Number(p.valor ?? 0), 0);

  const cartoes: Record<Time, Omit<Cartao, "time" | "nome" | "ultima" | "alertas">> = {
    sdr: {
      responsaveis: unicos(d.leads.map((l) => l.sdr)),
      numeros: [
        { rotulo: "Leads", valor: String(d.leads.length) },
        { rotulo: "Toques", valor: String(d.toques.length) },
        { rotulo: "Reuniões marcadas", valor: String(d.leads.filter((l) => l.reuniaoEm).length) },
      ],
      vazio: d.leads.length === 0,
    },
    comercial: {
      responsaveis: unicos([
        ...d.negocios.map((n) => n.responsavel),
        ...d.reunioesAnalisadas.filter((r) => r.tipo !== "atendimento").map((r) => r.quem),
      ]),
      numeros: [
        {
          rotulo: "Abertos",
          valor: `${abertos.length}${abertos.length ? ` · ${brl(soma(abertos))}` : ""}`,
        },
        {
          rotulo: "Ganhos",
          valor: `${ganhos.length}${ganhos.length ? ` · ${brl(soma(ganhos))}` : ""}`,
        },
        {
          rotulo: "Propostas",
          valor: String(d.propostas.filter((p) => p.status !== "rascunho").length),
        },
      ],
      vazio:
        d.negocios.length === 0 && d.propostas.length === 0 && d.reunioesAnalisadas.length === 0,
    },
    cs: {
      responsaveis: unicos([ativa?.responsavel, ...d.reunioesCs.map((r) => r.quem)]),
      numeros: [
        {
          rotulo: "Sinaleira",
          valor: ativa?.sinal && ativa.sinal !== "sem_dado" ? ativa.sinal : "sem dado",
        },
        { rotulo: "Reuniões", valor: String(d.reunioesCs.length) },
        {
          rotulo: "Tickets abertos",
          valor: String(
            d.tickets.filter((t) =>
              ["aberto", "em_andamento", "aguardando_cliente"].includes(t.status),
            ).length,
          ),
        },
      ],
      vazio: d.fichas.length === 0,
    },
    adm: {
      responsaveis: unicos([
        ...d.faturas.map((f) => f.quem),
        ...d.fichasCadastrais.map((f) => f.quem),
      ]),
      numeros: [
        {
          rotulo: "Notas emitidas",
          valor: `${emitidas.length}${emitidas.length ? ` · ${brl(soma(emitidas.map((f) => ({ valor: f.valorLiquido }))))}` : ""}`,
        },
        { rotulo: "Recebido", valor: brl(pago) },
        { rotulo: "Em aberto", valor: brl(emAberto) },
      ],
      vazio: d.faturas.length === 0 && d.fichasCadastrais.length === 0,
    },
    trainers: {
      responsaveis: unicos([
        ...d.sessoes.map((s) => s.trainer),
        ...d.inscricoes.map((i) => i.trainer),
      ]),
      numeros: [
        { rotulo: "Requerimentos", valor: String(d.requerimentos.length) },
        {
          rotulo: "Sessões realizadas",
          valor: `${d.sessoes.filter((s) => s.status === "realizado").length} de ${d.sessoes.filter((s) => s.status !== "cancelado").length}`,
        },
        { rotulo: "Inscritos em turmas", valor: String(d.inscricoes.length) },
      ],
      vazio: d.requerimentos.length === 0 && d.inscricoes.length === 0,
    },
  };

  return TIMES.map(({ id, nome }) => ({
    time: id,
    nome,
    ...cartoes[id],
    ultima: ultimaDe(id),
    alertas: alertas[id],
  }));
}

/** Texto curto de cada cartão, para o resumo da IA partir só de fatos. */
export function fatosParaIa(empresa: string, cartoes: Cartao[], eventos: Evento[], agora: number) {
  const linhas = [`Empresa: ${empresa}`];
  for (const c of cartoes) {
    if (c.vazio && !c.ultima) {
      linhas.push(`${c.nome}: nada registrado.`);
      continue;
    }
    linhas.push(
      [
        `${c.nome}:`,
        c.responsaveis.length ? `responsáveis ${c.responsaveis.join(", ")};` : "",
        c.numeros.map((n) => `${n.rotulo} ${n.valor}`).join("; ") + ";",
        c.ultima
          ? `última ação há ${dias(c.ultima.quando, agora)} dias: ${c.ultima.titulo}${c.ultima.detalhe ? ` (${c.ultima.detalhe})` : ""};`
          : "",
        c.alertas.length ? `atenção: ${c.alertas.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  linhas.push("Últimos acontecimentos:");
  for (const e of eventos.filter((e) => Date.parse(e.quando) <= agora).slice(0, 15))
    linhas.push(
      `- ${e.quando.slice(0, 10)} [${e.time}] ${e.titulo}${e.detalhe ? ` — ${e.detalhe}` : ""}${e.quem ? ` (${e.quem})` : ""}`,
    );
  return linhas.join("\n");
}
