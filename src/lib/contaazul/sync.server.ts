import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailsDosUsuarios, enviarEmailInterno, esc } from "@/lib/email-interno.server";
import { caGet, caTodasAsPaginas, tokenAtual } from "./api.server";
import {
  clienteDaApi,
  detalheClienteDaApi,
  horaSP,
  janelas,
  notaDaApi,
  receberDaApi,
  resumirNotas,
  vendaDaApi,
  vendaDoNegocio,
  agregarStatus,
  type NotaCA,
  type VendaCA,
} from "./mapear";

/*
 * Leitura periódica da Conta Azul (a cada 15 min, pelo agendamento no banco).
 *
 * 1. Vendas e contas a receber que mudaram desde a última leitura.
 * 2. Notas de serviço dos últimos 45 dias (a API não filtra notas por data de
 *    alteração, só por competência, em janelas de 15 dias).
 * 3. Cliente da Conta Azul → empresa do Compass pelo CNPJ (da nota e do
 *    cadastro), com observações gerais, contatos e e-mails de cobrança.
 * 4. Negócio ganho ↔ venda: pelo número informado no negócio ou, se houver
 *    uma só venda da mesma empresa com o mesmo valor, sozinho.
 * 5. No negócio: situação da venda, status das notas, vendido x faturado,
 *    data do faturamento — e aviso ao executivo e ao ADM quando a nota falha,
 *    é cancelada ou a venda é cancelada.
 *
 * O Compass NÃO emite nota nem escreve na Conta Azul: só lê.
 */
const db = () => supabaseAdmin as unknown as SupabaseClient;
const CHAVE = "contaazul_sync";

type Estado = {
  desde?: string;
  ultimo_em?: string;
  ultimo_erro?: string | null;
  ultimo_resultado?: Record<string, number>;
};

async function lerEstado(): Promise<Estado> {
  const { data } = await db().from("app_settings").select("value").eq("key", CHAVE).maybeSingle();
  return ((data as { value?: Estado } | null)?.value ?? {}) as Estado;
}
async function salvarEstado(e: Estado) {
  await db().from("app_settings").upsert({ key: CHAVE, value: e }, { onConflict: "key" });
}

async function emLotes<T>(linhas: T[], fn: (lote: T[]) => PromiseLike<{ error: unknown }>) {
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await fn(linhas.slice(i, i + 200));
    if (error) throw new Error((error as { message?: string }).message ?? String(error));
  }
}

export async function statusContaAzul() {
  const [{ data: tok }, estado] = await Promise.all([
    db().from("contaazul_tokens").select("connected_at, connected_by").eq("id", true).maybeSingle(),
    lerEstado(),
  ]);
  const t = tok as { connected_at: string; connected_by: string | null } | null;
  return {
    conectada: !!t,
    conectadaEm: t?.connected_at ?? null,
    credenciais: !!(process.env.CONTAAZUL_CLIENT_ID && process.env.CONTAAZUL_CLIENT_SECRET),
    ultimoEm: estado.ultimo_em ?? null,
    ultimoErro: estado.ultimo_erro ?? null,
    ultimoResultado: estado.ultimo_resultado ?? null,
  };
}

export async function sincronizarContaAzul(opts: { diasNotas?: number } = {}) {
  if (!(await tokenAtual())) return { ok: false, motivo: "nao_conectada" as const };
  const estado = await lerEstado();
  const agora = new Date();
  // Primeira leitura: tudo o que mudou no último ano (inclui a migração da WebMais).
  const desde = estado.desde
    ? new Date(new Date(estado.desde).getTime() - 10 * 60_000)
    : new Date(agora.getTime() - 365 * 864e5);
  const diasNotas = opts.diasNotas ?? (estado.desde ? 45 : 365);

  try {
    const periodo = { data_alteracao_de: horaSP(desde), data_alteracao_ate: horaSP(agora) };

    // 1) Vendas e contas a receber que mudaram.
    const vendas = (await caTodasAsPaginas("/v1/venda/busca", periodo))
      .map(vendaDaApi)
      .filter((v): v is VendaCA => !!v);
    const hoje = agora.toISOString().slice(0, 10);
    const daqui3anos = new Date(agora.getTime() + 3 * 365 * 864e5).toISOString().slice(0, 10);
    const receber = (
      await caTodasAsPaginas("/v1/financeiro/eventos-financeiros/contas-a-receber/buscar", {
        ...periodo,
        data_vencimento_de: "2020-01-01",
        data_vencimento_ate: daqui3anos,
      })
    )
      .map(receberDaApi)
      .filter((r): r is NonNullable<typeof r> => !!r);

    // 2) Notas de serviço por competência.
    const inicio = new Date(agora.getTime() - diasNotas * 864e5).toISOString().slice(0, 10);
    const notas: NotaCA[] = [];
    for (const [de, ate] of janelas(inicio, hoje, 15)) {
      const pag = await caTodasAsPaginas("/v1/notas-fiscais-servico", {
        data_competencia_de: de,
        data_competencia_ate: ate,
      });
      notas.push(...pag.map(notaDaApi).filter((n): n is NotaCA => !!n));
    }

    // 3) Cliente → empresa pelo CNPJ das notas.
    const docs = [
      ...new Set(notas.map((n) => n.documento_cliente).filter((d): d is string => !!d)),
    ];
    const empresaPorDoc = new Map<string, string>();
    for (let i = 0; i < docs.length; i += 200) {
      const { data } = await db()
        .from("companies")
        .select("id, cnpj")
        .in("cnpj", docs.slice(i, i + 200));
      for (const c of (data ?? []) as Array<{ id: string; cnpj: string }>)
        empresaPorDoc.set(c.cnpj, c.id);
    }
    const idsVendaDasNotas = [
      ...new Set(notas.map((n) => n.id_venda).filter((x): x is string => !!x)),
    ];
    const clienteDaVenda = new Map(vendas.map((v) => [v.id, v.cliente_id]));
    const faltam = idsVendaDasNotas.filter((id) => !clienteDaVenda.has(id));
    for (let i = 0; i < faltam.length; i += 200) {
      const { data } = await db()
        .from("ca_vendas")
        .select("id, cliente_id")
        .in("id", faltam.slice(i, i + 200));
      for (const v of (data ?? []) as Array<{ id: string; cliente_id: string | null }>)
        clienteDaVenda.set(v.id, v.cliente_id);
    }
    const novosClientes = new Map<
      string,
      { cliente_id: string; documento: string; nome: string | null; company_id: string | null }
    >();
    for (const n of notas) {
      const cli = n.id_venda ? clienteDaVenda.get(n.id_venda) : null;
      if (!cli || !n.documento_cliente) continue;
      novosClientes.set(cli, {
        cliente_id: cli,
        documento: n.documento_cliente,
        nome: n.nome_cliente,
        company_id: empresaPorDoc.get(n.documento_cliente) ?? null,
      });
    }
    await emLotes(
      [...novosClientes.values()].map((c) => ({ ...c, updated_at: agora.toISOString() })),
      (l) => db().from("ca_clientes").upsert(l, { onConflict: "cliente_id" }),
    );
    const clientes = [
      ...new Set(
        [...vendas.map((v) => v.cliente_id), ...receber.map((r) => r.cliente_id)].filter(
          (x): x is string => !!x,
        ),
      ),
    ];
    const empresaDoCliente = new Map<string, string | null>();
    for (let i = 0; i < clientes.length; i += 200) {
      const { data } = await db()
        .from("ca_clientes")
        .select("cliente_id, company_id")
        .in("cliente_id", clientes.slice(i, i + 200));
      for (const c of (data ?? []) as Array<{ cliente_id: string; company_id: string | null }>)
        empresaDoCliente.set(c.cliente_id, c.company_id);
    }
    const emp = (cli: string | null) => (cli ? (empresaDoCliente.get(cli) ?? null) : null);
    const ts = agora.toISOString();

    await emLotes(
      vendas.map((v) => ({ ...v, company_id: emp(v.cliente_id), synced_at: ts })),
      (l) => db().from("ca_vendas").upsert(l, { onConflict: "id" }),
    );
    await emLotes(
      receber.map((r) => ({ ...r, company_id: emp(r.cliente_id), synced_at: ts })),
      (l) => db().from("ca_receber").upsert(l, { onConflict: "id" }),
    );
    await emLotes(
      notas.map((n) => ({
        ...n,
        company_id: n.documento_cliente ? (empresaPorDoc.get(n.documento_cliente) ?? null) : null,
        synced_at: ts,
      })),
      (l) => db().from("ca_notas").upsert(l, { onConflict: "id" }),
    );
    // Cliente que ganhou empresa agora: acerta as cópias antigas dele.
    for (const c of novosClientes.values()) {
      if (!c.company_id) continue;
      await db()
        .from("ca_vendas")
        .update({ company_id: c.company_id })
        .eq("cliente_id", c.cliente_id)
        .is("company_id", null);
      await db()
        .from("ca_receber")
        .update({ company_id: c.company_id })
        .eq("cliente_id", c.cliente_id)
        .is("company_id", null);
    }

    // Cadastro dos clientes: observações, contatos, e-mails de cobrança.
    // Falha aqui não derruba o resto da leitura.
    let cadastros = { clientesLidos: 0, clientesDetalhados: 0 };
    try {
      cadastros = await sincronizarClientes(periodo, ts);
    } catch (e) {
      await db()
        .from("integration_logs")
        .insert({
          provider: "conta_azul",
          action: "sync_clientes",
          status: "error",
          detail: { erro: e instanceof Error ? e.message : String(e) },
        });
    }

    // 4 e 5) Negócios.
    const negocios = await atualizarNegocios();

    const resultado = {
      vendas: vendas.length,
      notas: notas.length,
      receber: receber.length,
      clientes: novosClientes.size,
      ...cadastros,
      ...negocios,
    };
    await salvarEstado({
      desde: agora.toISOString(),
      ultimo_em: ts,
      ultimo_erro: null,
      ultimo_resultado: resultado,
    });
    return { ok: true as const, ...resultado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await salvarEstado({
      ...estado,
      ultimo_em: agora.toISOString(),
      ultimo_erro: msg.slice(0, 500),
    });
    await db()
      .from("integration_logs")
      .insert({ provider: "conta_azul", action: "sync", status: "error", detail: { erro: msg } });
    throw e;
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Detalhes de cliente lidos por rodada (cada um é uma chamada à API). */
const DETALHES_POR_RODADA = 80;

/**
 * Clientes cujo cadastro mudou na Conta Azul: grava observações, e-mail,
 * telefone e endereço (a lista já traz) e liga à empresa pelo CNPJ. Para
 * os clientes que têm empresa no Compass, lê também o detalhe (outros
 * contatos, e-mails de cobrança, inscrições) — aos poucos, por rodada.
 */
async function sincronizarClientes(
  periodo: { data_alteracao_de: string; data_alteracao_ate: string },
  ts: string,
) {
  const lidos = (await caTodasAsPaginas("/v1/pessoas", periodo))
    .map(clienteDaApi)
    .filter((c): c is NonNullable<typeof c> => !!c);

  const docs = [...new Set(lidos.map((c) => c.documento).filter((d): d is string => !!d))];
  const empresaPorDoc = new Map<string, string>();
  for (let i = 0; i < docs.length; i += 200) {
    const { data } = await db()
      .from("companies")
      .select("id, cnpj")
      .in("cnpj", docs.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ id: string; cnpj: string }>)
      empresaPorDoc.set(c.cnpj, c.id);
  }
  const linhas = lidos.map((c) => ({
    ...c,
    company_id: c.documento ? (empresaPorDoc.get(c.documento) ?? null) : null,
    updated_at: ts,
  }));
  await emLotes(linhas, (l) => db().from("ca_clientes").upsert(l, { onConflict: "cliente_id" }));
  for (const c of linhas) {
    if (!c.company_id) continue;
    for (const tabela of ["ca_vendas", "ca_receber"])
      await db()
        .from(tabela)
        .update({ company_id: c.company_id })
        .eq("cliente_id", c.cliente_id)
        .is("company_id", null);
  }

  // Detalhe: quem mudou agora e tem empresa, e quem tem empresa e nunca foi lido.
  const mudaram = linhas.filter((c) => c.company_id).map((c) => c.cliente_id);
  const { data: nuncaLidos } = await db()
    .from("ca_clientes")
    .select("cliente_id")
    .not("company_id", "is", null)
    .is("detalhe_em", null)
    .limit(DETALHES_POR_RODADA);
  const fila = [
    ...new Set([
      ...mudaram,
      ...((nuncaLidos ?? []) as Array<{ cliente_id: string }>).map((c) => c.cliente_id),
    ]),
  ].slice(0, DETALHES_POR_RODADA);
  let detalhados = 0;
  for (const id of fila) {
    const r = await caGet(`/v1/pessoas/${encodeURIComponent(id)}`, {});
    await espera(120); // folga no limite de 10 por segundo
    const d = r ? detalheClienteDaApi(r as Record<string, unknown>) : null;
    const patch = d
      ? {
          nome: d.nome,
          observacoes: d.observacoes,
          email: d.email,
          telefone: d.telefone,
          endereco: d.endereco,
          ativo: d.ativo,
          outros_contatos: d.outros_contatos,
          emails_cobranca: d.emails_cobranca,
          inscricao_estadual: d.inscricao_estadual,
          inscricao_municipal: d.inscricao_municipal,
          detalhe_em: ts,
        }
      : { detalhe_em: ts };
    const { error } = await db().from("ca_clientes").update(patch).eq("cliente_id", id);
    if (!error && d) detalhados++;
  }
  return { clientesLidos: lidos.length, clientesDetalhados: detalhados };
}

type Alvo = {
  /** Onde gravar: o próprio negócio ou uma linha do rateio por CNPJ. */
  tabela: "deals" | "deal_faturamento_cnpjs";
  id: string;
  deal: { id: string; nome: string; executivo_user_id: string | null; faturado_em: string | null };
  rotulo: string;
  company_id: string | null;
  amount: number | null;
  ca_venda_id: string | null;
  ca_venda_numero: number | null;
  ca_situacao: string | null;
  ca_nf_status: string | null;
  ca_nf_numeros: string | null;
};

const DEAL_COLS =
  "id, nome, company_id, amount, executivo_user_id, faturado_em, ca_venda_id, ca_venda_numero, ca_situacao, ca_nf_status, ca_nf_numeros";
type DealRow = {
  id: string;
  nome: string;
  company_id: string | null;
  amount: number | null;
  executivo_user_id: string | null;
  faturado_em: string | null;
  ca_venda_id: string | null;
  ca_venda_numero: number | null;
  ca_situacao: string | null;
  ca_nf_status: string | null;
  ca_nf_numeros: string | null;
};
const alvoDoNegocio = (d: DealRow): Alvo => ({
  tabela: "deals",
  id: d.id,
  deal: d,
  rotulo: "",
  company_id: d.company_id,
  amount: d.amount,
  ca_venda_id: d.ca_venda_id,
  ca_venda_numero: d.ca_venda_numero,
  ca_situacao: d.ca_situacao,
  ca_nf_status: d.ca_nf_status,
  ca_nf_numeros: d.ca_nf_numeros,
});
const fmtCnpj = (c: string) =>
  c.length === 14
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : c;
const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

/**
 * Liga negócios (ou cada CNPJ do rateio do negócio) às vendas da Conta Azul
 * e copia o estado do faturamento. Negócio com rateio recebe a soma das
 * linhas: vendido é um valor só, faturado é o que as notas somam.
 */
export async function atualizarNegocios() {
  const corte = new Date(Date.now() - 365 * 864e5).toISOString();
  const [{ data: ligados }, { data: soltos }, { data: linhas }] = await Promise.all([
    db()
      .from("deals")
      .select(DEAL_COLS)
      .or("ca_venda_id.not.is.null,ca_venda_numero.not.is.null")
      .limit(3000),
    db()
      .from("deals")
      .select(DEAL_COLS)
      .eq("status", "won")
      .gte("closed_at", corte)
      .is("ca_venda_id", null)
      .is("ca_venda_numero", null)
      .not("company_id", "is", null)
      .limit(3000),
    db()
      .from("deal_faturamento_cnpjs")
      .select(
        "id, deal_id, company_id, cnpj, valor, ca_venda_id, ca_venda_numero, ca_situacao, ca_nf_status, ca_nf_numeros",
      )
      .limit(3000),
  ]);
  type Linha = {
    id: string;
    deal_id: string;
    company_id: string | null;
    cnpj: string;
    valor: number;
    ca_venda_id: string | null;
    ca_venda_numero: number | null;
    ca_situacao: string | null;
    ca_nf_status: string | null;
    ca_nf_numeros: string | null;
  };
  const rateio = (linhas ?? []) as Linha[];
  const comRateio = new Set(rateio.map((l) => l.deal_id));

  // Negócios dos rateios (para nome, executivo e o resumo agregado).
  const dealsDoRateio = new Map<string, DealRow>();
  const idsRateio = [...comRateio];
  for (let i = 0; i < idsRateio.length; i += 200) {
    const { data } = await db()
      .from("deals")
      .select(DEAL_COLS)
      .in("id", idsRateio.slice(i, i + 200));
    for (const d of (data ?? []) as DealRow[]) dealsDoRateio.set(d.id, d);
  }

  const todos: Alvo[] = [];
  const soltosAlvos: Alvo[] = [];
  for (const d of (ligados ?? []) as DealRow[])
    if (!comRateio.has(d.id)) todos.push(alvoDoNegocio(d));
  for (const d of (soltos ?? []) as DealRow[])
    if (!comRateio.has(d.id)) soltosAlvos.push(alvoDoNegocio(d));
  for (const l of rateio) {
    const d = dealsDoRateio.get(l.deal_id);
    if (!d) continue;
    const alvo: Alvo = {
      tabela: "deal_faturamento_cnpjs",
      id: l.id,
      deal: d,
      rotulo: ` · CNPJ ${fmtCnpj(l.cnpj)}`,
      company_id: l.company_id,
      amount: Number(l.valor),
      ca_venda_id: l.ca_venda_id,
      ca_venda_numero: l.ca_venda_numero,
      ca_situacao: l.ca_situacao,
      ca_nf_status: l.ca_nf_status,
      ca_nf_numeros: l.ca_nf_numeros,
    };
    if (l.ca_venda_id || l.ca_venda_numero) todos.push(alvo);
    else soltosAlvos.push(alvo);
  }

  // Vendas candidatas das empresas dos alvos ainda sem venda.
  const empresas = [
    ...new Set(soltosAlvos.map((a) => a.company_id).filter((x): x is string => !!x)),
  ];
  const vendasDasEmpresas: Array<VendaCA & { company_id: string | null }> = [];
  for (let i = 0; i < empresas.length; i += 200) {
    const { data } = await db()
      .from("ca_vendas")
      .select(
        "id, numero, situacao, cliente_id, cliente_nome, total, data, data_alteracao, company_id",
      )
      .in("company_id", empresas.slice(i, i + 200));
    vendasDasEmpresas.push(...((data ?? []) as Array<VendaCA & { company_id: string | null }>));
  }
  const jaLigadas = new Set(todos.map((a) => a.ca_venda_id).filter((x): x is string => !!x));
  let ligadosAgora = 0;
  for (const a of soltosAlvos) {
    const id = vendaDoNegocio(a, vendasDasEmpresas, jaLigadas);
    if (!id) continue;
    jaLigadas.add(id);
    a.ca_venda_id = id;
    todos.push(a);
    ligadosAgora++;
  }

  // Número informado à mão → id.
  const numeros = todos
    .filter((a) => !a.ca_venda_id && a.ca_venda_numero)
    .map((a) => a.ca_venda_numero!);
  if (numeros.length) {
    const { data } = await db().from("ca_vendas").select("id, numero").in("numero", numeros);
    const porNumero = new Map(
      ((data ?? []) as Array<{ id: string; numero: number }>).map((v) => [v.numero, v.id]),
    );
    for (const a of todos)
      if (!a.ca_venda_id && a.ca_venda_numero)
        a.ca_venda_id = porNumero.get(a.ca_venda_numero) ?? null;
  }

  const ids = [...new Set(todos.map((a) => a.ca_venda_id).filter((x): x is string => !!x))];
  const vendaPorId = new Map<string, VendaCA>();
  const notasPorVenda = new Map<string, NotaCA[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [{ data: vs }, { data: ns }] = await Promise.all([
      db()
        .from("ca_vendas")
        .select("id, numero, situacao, cliente_id, cliente_nome, total, data, data_alteracao")
        .in("id", lote),
      db()
        .from("ca_notas")
        .select(
          "id, id_venda, numero_venda, numero_nfse, status, documento_cliente, nome_cliente, valor, data_competencia, motivo_cancelamento",
        )
        .in("id_venda", lote),
    ]);
    for (const v of (vs ?? []) as VendaCA[]) vendaPorId.set(v.id, v);
    for (const n of (ns ?? []) as NotaCA[]) {
      const l = notasPorVenda.get(n.id_venda!) ?? [];
      l.push(n);
      notasPorVenda.set(n.id_venda!, l);
    }
  }

  let atualizados = 0;
  let avisos = 0;
  const agora = new Date().toISOString();
  const resumoDaLinha = new Map<
    string,
    { status: string; valor: number; numeros: string[]; emissao: string | null }
  >();
  for (const a of todos) {
    const v = a.ca_venda_id ? vendaPorId.get(a.ca_venda_id) : undefined;
    if (!v) continue;
    const r = resumirNotas(notasPorVenda.get(v.id) ?? [], v.total ?? a.amount);
    const patch: Record<string, unknown> = {
      ca_venda_id: v.id,
      ca_venda_numero: v.numero,
      ca_situacao: v.situacao,
      ca_nf_status: r.status,
      ca_nf_numeros: r.numeros.join(", ") || null,
      ca_valor_faturado: r.valorFaturado,
      ca_sincronizado_em: agora,
    };
    const faturou = r.status === "EMITIDA" || r.status === "PARCIAL";
    if (a.tabela === "deals" && !a.deal.faturado_em && r.primeiraEmissao && faturou)
      patch.faturado_em = new Date(`${r.primeiraEmissao}T12:00:00-03:00`).toISOString();
    const { error } = await db().from(a.tabela).update(patch).eq("id", a.id);
    if (error) continue;
    atualizados++;
    if (a.tabela === "deal_faturamento_cnpjs")
      resumoDaLinha.set(a.id, {
        status: r.status,
        valor: r.valorFaturado,
        numeros: r.numeros,
        emissao: r.primeiraEmissao,
      });

    // Avisos só na mudança (cada leitura não repete o aviso).
    const vendaCancelou = v.situacao === "CANCELADO" && a.ca_situacao !== "CANCELADO";
    const notaMudou = r.status !== a.ca_nf_status;
    const antigas = new Set(
      (a.ca_nf_numeros ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    );
    const novas = r.numeros.filter((n) => !antigas.has(n));
    if (vendaCancelou) {
      await avisar(
        a.deal,
        `Venda cancelada na Conta Azul: ${a.deal.nome}`,
        `A venda nº ${v.numero ?? "?"}${a.rotulo} foi cancelada pelo financeiro.`,
        "problema",
      );
      avisos++;
    } else if (notaMudou && (r.status === "FALHA" || r.status === "CANCELADA")) {
      await avisar(
        a.deal,
        r.status === "FALHA"
          ? `Nota com problema na Conta Azul: ${a.deal.nome}`
          : `Nota cancelada na Conta Azul: ${a.deal.nome}`,
        `${r.status === "FALHA" ? "A nota da venda" : "A nota da venda foi cancelada. Venda"} nº ${v.numero ?? "?"}${a.rotulo}${r.motivo ? ` — motivo: ${r.motivo}` : ""}. Confira os dados do faturamento no negócio.`,
        "problema",
      );
      avisos++;
    } else if (faturou && novas.length > 0) {
      const valorNovas = (notasPorVenda.get(v.id) ?? [])
        .filter((n) => n.numero_nfse && novas.includes(n.numero_nfse))
        .reduce((s, n) => s + (n.valor ?? 0), 0);
      await avisar(
        a.deal,
        `Faturado na Conta Azul: ${a.deal.nome}`,
        `NF ${novas.join(", ")}${a.rotulo} · ${reais(valorNovas)}. Faturado até agora: ${reais(r.valorFaturado)}${r.status === "PARCIAL" ? " (parte do valor vendido)" : ""}.`,
        "faturado",
      );
      avisos++;
    }
  }

  // Negócio com rateio: soma das linhas.
  const linhasPorDeal = new Map<string, Linha[]>();
  for (const l of rateio)
    linhasPorDeal.set(l.deal_id, [...(linhasPorDeal.get(l.deal_id) ?? []), l]);
  for (const [dealId, ls] of linhasPorDeal) {
    const d = dealsDoRateio.get(dealId);
    if (!d) continue;
    const resumos = ls.map(
      (l) =>
        resumoDaLinha.get(l.id) ?? {
          status: l.ca_nf_status ?? "SEM_NOTA",
          valor: 0,
          numeros: (l.ca_nf_numeros ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          emissao: null,
        },
    );
    const emissoes = resumos
      .map((r) => r.emissao)
      .filter((x): x is string => !!x)
      .sort();
    const status = agregarStatus(resumos.map((r) => r.status));
    const patch: Record<string, unknown> = {
      ca_nf_status: status,
      ca_nf_numeros: resumos.flatMap((r) => r.numeros).join(", ") || null,
      ca_valor_faturado: Math.round(resumos.reduce((s, r) => s + r.valor, 0) * 100) / 100,
      ca_sincronizado_em: agora,
    };
    if (!d.faturado_em && emissoes[0] && (status === "EMITIDA" || status === "PARCIAL"))
      patch.faturado_em = new Date(`${emissoes[0]}T12:00:00-03:00`).toISOString();
    await db().from("deals").update(patch).eq("id", dealId);
  }
  return { negociosLigados: ligadosAgora, negociosAtualizados: atualizados, avisos };
}

/**
 * Problema (nota com falha, cancelada, venda cancelada): sino para o
 * executivo e o ADM, e-mail para o executivo. Faturado: sino e e-mail para
 * o executivo (o ADM já vê o card mudar de coluna).
 */
async function avisar(
  d: { id: string; executivo_user_id: string | null },
  titulo: string,
  corpo: string,
  tipo: "problema" | "faturado",
) {
  const problema = tipo === "problema";
  let admIds: string[] = [];
  if (problema) {
    const { data: times } = await db()
      .from("teams")
      .select("slug")
      .eq("modulo", "administrativo")
      .eq("ativo", true);
    const slugs = ((times ?? []) as Array<{ slug: string }>).map((t) => t.slug);
    const { data: adm } = slugs.length
      ? await db().from("user_teams").select("user_id, access").in("team", slugs)
      : { data: [] };
    admIds = ((adm ?? []) as Array<{ user_id: string; access: string[] | null }>)
      .filter((u) => (u.access ?? []).some((a) => a === "faturamento" || a === "gestao"))
      .map((u) => u.user_id);
  }
  const para = [...new Set([d.executivo_user_id, ...admIds].filter((x): x is string => !!x))];
  if (para.length)
    await db()
      .from("notificacoes")
      .insert(
        para.map((u) => ({
          user_id: u,
          tipo: "conta_azul",
          titulo: titulo.slice(0, 200),
          corpo: corpo.slice(0, 2000),
          link: `/negocio/${d.id}`,
          deal_id: d.id,
        })),
      );
  if (d.executivo_user_id)
    await enviarEmailInterno({
      para: await emailsDosUsuarios([d.executivo_user_id]),
      assunto: titulo,
      titulo: problema ? titulo : "A venda foi faturada",
      corpoHtml: `<p style="margin:0;padding:10px 12px;border-radius:8px;background:${problema ? "#fffbeb" : "#ecfdf5"};">${esc(corpo)}</p>`,
      link: `/negocio/${d.id}`,
      botao: "Abrir o negócio",
    });
}
