import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailsDosUsuarios, enviarEmailInterno, esc } from "@/lib/email-interno.server";
import { caTodasAsPaginas, tokenAtual } from "./api.server";
import {
  horaSP,
  janelas,
  notaDaApi,
  receberDaApi,
  resumirNotas,
  vendaDaApi,
  vendaDoNegocio,
  type NotaCA,
  type VendaCA,
} from "./mapear";

/*
 * Leitura periódica da Conta Azul (a cada 15 min, pelo agendamento no banco).
 *
 * 1. Vendas e contas a receber que mudaram desde a última leitura.
 * 2. Notas de serviço dos últimos 45 dias (a API não filtra notas por data de
 *    alteração, só por competência, em janelas de 15 dias).
 * 3. Cliente da Conta Azul → empresa do Compass pelo CNPJ da nota.
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

    // 4 e 5) Negócios.
    const negocios = await atualizarNegocios();

    const resultado = {
      vendas: vendas.length,
      notas: notas.length,
      receber: receber.length,
      clientes: novosClientes.size,
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

type Negocio = {
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
};

/** Liga negócios às vendas e copia o estado do faturamento para o negócio. */
export async function atualizarNegocios() {
  const cols =
    "id, nome, company_id, amount, executivo_user_id, faturado_em, ca_venda_id, ca_venda_numero, ca_situacao, ca_nf_status";
  const corte = new Date(Date.now() - 180 * 864e5).toISOString();
  const [{ data: ligados }, { data: soltos }] = await Promise.all([
    db()
      .from("deals")
      .select(cols)
      .or("ca_venda_id.not.is.null,ca_venda_numero.not.is.null")
      .limit(2000),
    db()
      .from("deals")
      .select(cols)
      .eq("status", "won")
      .gte("closed_at", corte)
      .is("ca_venda_id", null)
      .is("ca_venda_numero", null)
      .not("company_id", "is", null)
      .limit(2000),
  ]);
  const lista = (ligados ?? []) as Negocio[];
  const semVenda = (soltos ?? []) as Negocio[];

  // Vendas candidatas das empresas dos negócios soltos.
  const empresas = [...new Set(semVenda.map((d) => d.company_id!))];
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
  const jaLigadas = new Set(lista.map((d) => d.ca_venda_id).filter((x): x is string => !!x));
  let ligadosAgora = 0;
  for (const d of semVenda) {
    const id = vendaDoNegocio(d, vendasDasEmpresas, jaLigadas);
    if (!id) continue;
    jaLigadas.add(id);
    d.ca_venda_id = id;
    lista.push(d);
    ligadosAgora++;
  }

  // Número informado à mão → id.
  const numeros = lista
    .filter((d) => !d.ca_venda_id && d.ca_venda_numero)
    .map((d) => d.ca_venda_numero!);
  if (numeros.length) {
    const { data } = await db().from("ca_vendas").select("id, numero").in("numero", numeros);
    const porNumero = new Map(
      ((data ?? []) as Array<{ id: string; numero: number }>).map((v) => [v.numero, v.id]),
    );
    for (const d of lista)
      if (!d.ca_venda_id && d.ca_venda_numero)
        d.ca_venda_id = porNumero.get(d.ca_venda_numero) ?? null;
  }

  const ids = [...new Set(lista.map((d) => d.ca_venda_id).filter((x): x is string => !!x))];
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
  for (const d of lista) {
    const v = d.ca_venda_id ? vendaPorId.get(d.ca_venda_id) : undefined;
    if (!v) continue;
    const r = resumirNotas(notasPorVenda.get(v.id) ?? [], v.total ?? d.amount);
    const patch: Record<string, unknown> = {
      ca_venda_id: v.id,
      ca_venda_numero: v.numero,
      ca_situacao: v.situacao,
      ca_nf_status: r.status,
      ca_nf_numeros: r.numeros.join(", ") || null,
      ca_valor_faturado: r.valorFaturado,
      ca_sincronizado_em: new Date().toISOString(),
    };
    if (!d.faturado_em && r.primeiraEmissao && (r.status === "EMITIDA" || r.status === "PARCIAL"))
      patch.faturado_em = new Date(`${r.primeiraEmissao}T12:00:00-03:00`).toISOString();
    const { error } = await db().from("deals").update(patch).eq("id", d.id);
    if (error) continue;
    atualizados++;

    // Avisos só na mudança (cada leitura não repete o aviso).
    const vendaCancelou = v.situacao === "CANCELADO" && d.ca_situacao !== "CANCELADO";
    const notaMudou = r.status !== d.ca_nf_status;
    if (vendaCancelou) {
      await avisar(
        d,
        `Venda cancelada na Conta Azul: ${d.nome}`,
        `A venda nº ${v.numero ?? "?"} foi cancelada pelo financeiro.`,
      );
      avisos++;
    } else if (notaMudou && (r.status === "FALHA" || r.status === "CANCELADA")) {
      await avisar(
        d,
        r.status === "FALHA"
          ? `Nota com problema na Conta Azul: ${d.nome}`
          : `Nota cancelada na Conta Azul: ${d.nome}`,
        `${r.status === "FALHA" ? "A nota da venda" : "A nota da venda foi cancelada. Venda"} nº ${v.numero ?? "?"}${r.motivo ? ` — motivo: ${r.motivo}` : ""}. Confira os dados do faturamento no negócio.`,
      );
      avisos++;
    } else if (notaMudou && (r.status === "EMITIDA" || r.status === "PARCIAL") && d.ca_nf_status) {
      await avisar(
        d,
        `Faturado na Conta Azul: ${d.nome}`,
        `Nota${r.numeros.length > 1 ? "s" : ""} ${r.numeros.join(", ")} · R$ ${r.valorFaturado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${r.status === "PARCIAL" ? " (parte do valor vendido)" : ""}.`,
        false,
      );
    }
  }
  return { negociosLigados: ligadosAgora, negociosAtualizados: atualizados, avisos };
}

/** Sino para o executivo e o ADM; e-mail para o executivo quando é problema. */
async function avisar(d: Negocio, titulo: string, corpo: string, problema = true) {
  const { data: times } = await db()
    .from("teams")
    .select("slug")
    .eq("modulo", "administrativo")
    .eq("ativo", true);
  const slugs = ((times ?? []) as Array<{ slug: string }>).map((t) => t.slug);
  const { data: adm } = slugs.length
    ? await db().from("user_teams").select("user_id, access").in("team", slugs)
    : { data: [] };
  const admIds = ((adm ?? []) as Array<{ user_id: string; access: string[] | null }>)
    .filter((u) => (u.access ?? []).some((a) => a === "faturamento" || a === "gestao"))
    .map((u) => u.user_id);
  const para = [
    ...new Set([d.executivo_user_id, ...(problema ? admIds : [])].filter((x): x is string => !!x)),
  ];
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
  if (problema && d.executivo_user_id)
    await enviarEmailInterno({
      para: await emailsDosUsuarios([d.executivo_user_id]),
      assunto: titulo,
      titulo,
      corpoHtml: `<p style="margin:0;padding:10px 12px;border-radius:8px;background:#fffbeb;">${esc(corpo)}</p>`,
      link: `/negocio/${d.id}`,
      botao: "Abrir o negócio",
    });
}
