import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Building2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { tudoDaEmpresa } from "@/lib/empresa-unificada.functions";
import { FichaCadastralCard } from "@/components/fichas/ficha-cadastral";
import { PoliticaFaturamentoCard } from "@/components/faturamento/politica-card";
import { ResumoDaConta } from "@/components/empresa/resumo-da-conta";
import { ReunioesAnalisadas } from "@/components/reunioes-analisadas";

/*
 * O que os outros times têm da empresa, na mesma ficha: reuniões analisadas no
 * Sales Coach (todos os times), negócios e propostas (comercial), leads (SDR),
 * faturas e requerimentos (ADM). Tudo com link para abrir o item.
 */
const brl = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const STATUS_NEGOCIO: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  won: { label: "Ganho", cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  lost: { label: "Perdido", cls: "border-red-500/40 text-red-600 dark:text-red-400" },
};

function useTudo(companyId: string) {
  const fn = useServerFn(tudoDaEmpresa);
  return useQuery({
    queryKey: ["tudo-da-empresa", companyId],
    queryFn: () => fn({ data: { companyId } }),
    staleTime: 60_000,
  });
}

function Bloco({
  titulo,
  vazio,
  children,
  n,
}: {
  titulo: string;
  vazio: string;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo} {n > 0 && <span className="font-normal">({n})</span>}
      </p>
      {n === 0 ? <p className="text-[12px] text-muted-foreground">{vazio}</p> : children}
    </div>
  );
}

const linha =
  "flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-[12px] transition-colors hover:bg-muted/50";

export function TudoDaEmpresaPanel({ companyId }: { companyId: string }) {
  const { data: d, isLoading } = useTudo(companyId);
  if (isLoading) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
  if (!d) return null;
  const abertos = d.negocios.filter((n) => n.status === "open");
  const fechados = d.negocios.filter((n) => n.status !== "open");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Reuniões analisadas
        </p>
        <ReunioesAnalisadas companyId={companyId} />
      </div>

      <Bloco titulo="Negócios" vazio="Nenhum negócio com esta empresa." n={d.negocios.length}>
        <div className="space-y-1.5">
          {[...abertos, ...fechados].slice(0, 12).map((n) => {
            const st = STATUS_NEGOCIO[n.status] ?? STATUS_NEGOCIO.open;
            return (
              <Link key={n.id} to="/negocio/$id" params={{ id: n.id }} className={linha}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.nome ?? "Negócio"}</span>
                  <span className="block truncate text-muted-foreground">
                    {[n.status === "open" ? n.etapa : data(n.fechadoEm), n.responsavel]
                      .filter(Boolean)
                      .join(" · ")}
                    {n.congelado ? " · congelado" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
                    {st.label}
                  </Badge>
                  <span className="mt-0.5 block text-muted-foreground">{brl(n.valor)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Bloco>

      <Bloco titulo="Propostas" vazio="Nenhuma proposta." n={d.propostas.length}>
        <div className="space-y-1.5">
          {d.propostas.slice(0, 8).map((p) => {
            const corpo = (
              <>
                <span className="min-w-0">
                  <span className="block font-medium">Proposta {p.numero ?? ""}</span>
                  <span className="block text-muted-foreground">
                    {p.aceita_em
                      ? `aceita em ${data(p.aceita_em)}`
                      : p.enviada_em
                        ? `enviada em ${data(p.enviada_em)}`
                        : `criada em ${data(p.created_at)}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {p.status}
                  </Badge>
                  <span className="mt-0.5 block text-muted-foreground">{brl(p.valor_final)}</span>
                </span>
              </>
            );
            return p.deal_id ? (
              <Link key={p.id} to="/negocio/$id" params={{ id: p.deal_id }} className={linha}>
                {corpo}
              </Link>
            ) : (
              <div key={p.id} className={linha}>
                {corpo}
              </div>
            );
          })}
        </div>
      </Bloco>

      <Bloco titulo="Leads do SDR" vazio="Nenhum lead desta empresa." n={d.leads.length}>
        <div className="space-y-1.5">
          {d.leads.slice(0, 8).map((l) => (
            <Link key={l.id} to="/lead/$id" params={{ id: l.id }} className={linha}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.nome ?? "Lead"}</span>
                <span className="block truncate text-muted-foreground">
                  {[l.cargo, l.etapa, l.sdr].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {l.reuniao ? `reunião ${data(l.reuniao)}` : data(l.criadoEm)}
              </span>
            </Link>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Faturas" vazio="Nenhuma fatura." n={d.faturas.length}>
        <div className="space-y-1.5">
          {d.faturas.slice(0, 6).map((f) => (
            <div key={f.id} className={linha}>
              <span>
                NF {f.numero_nf ?? "—"} · {data(f.emitida_em)}
              </span>
              <span className="text-muted-foreground">
                {brl(f.valor_liquido)} · {f.status}
              </span>
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Requerimentos" vazio="Nenhum requerimento." n={d.requerimentos.length}>
        <div className="space-y-1.5">
          {d.requerimentos.slice(0, 6).map((r) => (
            <Link key={r.id} to="/requerimento/$id" params={{ id: r.id }} className={linha}>
              <span className="min-w-0 truncate">
                #{r.numero ?? "—"} {r.servico ?? ""}
              </span>
              <span className="shrink-0 capitalize text-muted-foreground">{r.status}</span>
            </Link>
          ))}
        </div>
      </Bloco>
    </div>
  );
}

/**
 * A mesma ficha para a empresa que ainda não é cliente (não tem ficha do CS):
 * dados da base, contatos e tudo o que comercial, SDR e ADM têm dela.
 */
export function EmpresaSemFicha({ companyId }: { companyId: string }) {
  const { data: d, isLoading } = useTudo(companyId);
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando empresa…</p>;
  const e = d?.empresa;
  if (!e) return <p className="p-6 text-sm text-destructive">Empresa não encontrada.</p>;
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
      <div>
        <Link
          to="/cs"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Empresas
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Building2 className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
          <h1 className="truncate text-xl font-semibold">{e.nome}</h1>
          <Badge variant="outline" className="text-[10px]">
            Ainda não é cliente
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            e.cnpj ? `CNPJ ${e.cnpj}` : null,
            e.segmento,
            e.porte,
            [e.cidade, e.estado].filter(Boolean).join("/") || null,
            e.dono ? `Dono: ${e.dono}` : null,
            e.sdr ? `SDR: ${e.sdr}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Quando virar cliente, esta mesma página ganha a parte do CS (saúde, sinaleira, reuniões,
          tarefas).
        </p>
      </div>

      <ResumoDaConta companyId={companyId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="surface-panel p-4">
          <h2 className="section-label mb-3">Todos os times</h2>
          <TudoDaEmpresaPanel companyId={companyId} />
        </section>
        <div className="space-y-4">
          <section className="surface-panel p-4">
            <h2 className="section-label mb-2">Contatos ({d.contatos.length})</h2>
            {d.contatos.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nenhum contato na base.</p>
            ) : (
              <ul className="space-y-1.5">
                {d.contatos.slice(0, 30).map((c) => (
                  <li key={c.id} className="text-[12px]">
                    <span className="font-medium">{c.nome ?? "—"}</span>
                    {c.cargo && <span className="text-muted-foreground"> · {c.cargo}</span>}
                    <span className="block text-muted-foreground">
                      {[c.email, c.telefone].filter(Boolean).join(" · ") || "sem contato"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {(e.site_url || e.linkedin_url) && (
            <section className="surface-panel space-y-1 p-4 text-[12px]">
              {e.site_url && (
                <a
                  href={e.site_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  Site <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {e.linkedin_url && (
                <a
                  href={e.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  LinkedIn <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </section>
          )}
          <PoliticaFaturamentoCard companyId={companyId} />
          <FichaCadastralCard companyId={companyId} />
        </div>
      </div>
    </div>
  );
}
