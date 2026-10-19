import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, History, RefreshCw } from "lucide-react";
import { getConferenciaRd, importarHistoricoRd } from "@/lib/migracao-rd.functions";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/migracao-rd")({
  component: MigracaoRdPage,
  head: () => ({ meta: [{ title: "Migração do RD | Grou Compass" }] }),
});

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fase 1 da migração: conferir, funil a funil, se tudo o que está no RD
 * chegou ao CRM; ver quem do RD não tem usuário aqui (o card fica sem dono);
 * e trazer o histórico de anotações e atividades dos negócios.
 */
function MigracaoRdPage() {
  const qc = useQueryClient();
  const confFn = useServerFn(getConferenciaRd);
  const histFn = useServerFn(importarHistoricoRd);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["conferencia-rd"],
    queryFn: () => confFn(),
    staleTime: Infinity,
    retry: false,
  });
  const [aberto, setAberto] = useState<string | null>(null);
  const [hist, setHist] = useState<{
    rodando: boolean;
    negocios: number;
    atividades: number;
    restantes: number | null;
    aviso: string | null;
  }>({ rodando: false, negocios: 0, atividades: 0, restantes: null, aviso: null });
  const parar = useRef(false);

  async function rodarHistorico() {
    parar.current = false;
    setHist((h) => ({ ...h, rodando: true, aviso: null }));
    try {
      for (;;) {
        if (parar.current) break;
        const r = await histFn({ data: { lote: 20 } });
        setHist((h) => ({
          ...h,
          negocios: h.negocios + r.negocios,
          atividades: h.atividades + r.atividades,
          restantes: r.restantes,
          aviso: r.erro,
        }));
        if (r.restantes === 0) break;
        // Limite do RD: espera um minuto e segue de onde parou.
        await espera(r.erro?.includes("429") ? 60_000 : 1_000);
      }
      if (!parar.current) toast.success("Histórico importado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setHist((h) => ({ ...h, rodando: false }));
      qc.invalidateQueries({ queryKey: ["conferencia-rd"] });
    }
  }

  const t = data?.totais;
  const semUsuario = (data?.donos ?? []).filter((d) => !d.usuario);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Migração do RD · fase 1</h1>
          <p className="text-[12px] text-muted-foreground">
            1. Espelhar e transformar em{" "}
            <Link to="/cs-integracoes" className="underline">
              Integrações
            </Link>{" "}
            (rode a prévia antes) · 2. Conferir aqui · 3. Acertar os donos sem usuário e rodar de
            novo · 4. Importar o histórico
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Conferindo…" : "Atualizar conferência"}
        </Button>
      </header>

      {error && (
        <Card className="p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro na conferência"}
        </Card>
      )}

      {t && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Total titulo="Empresas" rd={t.rdEmpresas} crm={t.empresas} />
          <Total titulo="Contatos" rd={t.rdContatos} crm={t.contatos} />
          <Total titulo="Cards de funil no RD" rd={t.rdCards} crm={null} />
          <Total titulo="Negócios com histórico" rd={t.negociosImportados} crm={t.comHistorico} />
        </div>
      )}

      {data && (
        <Card className="overflow-x-auto p-0">
          <h2 className="px-4 pt-4 text-[13px] font-semibold">Funil a funil</h2>
          <p className="px-4 pb-2 text-[12px] text-muted-foreground">
            "Esperados" exclui cards perdidos dos funis do CS. Clique no funil para ver as etapas.
          </p>
          <table className="w-full text-[12px]">
            <thead className="border-y bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Funil no RD</th>
                <th className="py-2 pr-3">Vira</th>
                <th className="py-2 pr-3 text-right">Abertos</th>
                <th className="py-2 pr-3 text-right">Ganhos</th>
                <th className="py-2 pr-3 text-right">Perdidos</th>
                <th className="py-2 pr-3 text-right">Esperados</th>
                <th className="py-2 pr-4 text-right">No CRM</th>
              </tr>
            </thead>
            <tbody>
              {data.funis.map((f) => (
                <Fragment key={f.funil}>
                  <tr
                    className="cursor-pointer border-b hover:bg-muted/30"
                    onClick={() => setAberto(aberto === f.funil ? null : f.funil)}
                  >
                    <td className="px-4 py-2 font-medium">{f.funil}</td>
                    <td className="py-2 pr-3">{f.destino}</td>
                    <td className="py-2 pr-3 text-right">{f.abertos}</td>
                    <td className="py-2 pr-3 text-right">{f.ganhos}</td>
                    <td className="py-2 pr-3 text-right">{f.perdidos}</td>
                    <td className="py-2 pr-3 text-right">{f.esperados}</td>
                    <td className="py-2 pr-4 text-right">
                      <Status ok={f.noCrm} de={f.esperados} />
                    </td>
                  </tr>
                  {aberto === f.funil &&
                    f.etapas.map((e) => (
                      <tr key={`${f.funil}|${e.etapa}`} className="border-b bg-muted/20">
                        <td className="py-1.5 pl-8 text-muted-foreground" colSpan={5}>
                          {e.etapa}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{e.total}</td>
                        <td className="py-1.5 pr-4 text-right">
                          <Status ok={e.noCrm} de={e.total} />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-x-auto p-0">
            <h2 className="px-4 pt-4 text-[13px] font-semibold">Vendas ganhas por ano</h2>
            <p className="px-4 pb-2 text-[12px] text-muted-foreground">
              Funis de venda. "Venda" aberta no RD conta como ganha.
            </p>
            <table className="w-full text-[12px]">
              <thead className="border-y bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Ano</th>
                  <th className="py-2 pr-3 text-right">RD</th>
                  <th className="py-2 pr-3 text-right">CRM</th>
                  <th className="py-2 pr-4 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {data.anos.map((a) => (
                  <tr key={a.ano} className="border-b">
                    <td className="px-4 py-2">{a.ano}</td>
                    <td className="py-2 pr-3 text-right">
                      {a.rdQtd} · {moeda(a.rdValor)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {a.crmQtd} · {moeda(a.crmValor)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        Math.abs(a.rdValor - a.crmValor) > 1
                          ? "text-destructive"
                          : "text-emerald-600"
                      }`}
                    >
                      {moeda(a.crmValor - a.rdValor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-0">
            <h2 className="px-4 pt-4 text-[13px] font-semibold">Donos no RD</h2>
            <p className="px-4 pb-2 text-[12px] text-muted-foreground">
              {semUsuario.length
                ? `${semUsuario.length} sem usuário no CRM: os cards deles chegam sem dono. Crie o usuário com o mesmo nome (ou e-mail) e rode a transformação de novo.`
                : "Todos os donos têm usuário no CRM."}
            </p>
            <table className="w-full text-[12px]">
              <tbody>
                {data.donos.map((d) => (
                  <tr key={d.nome} className="border-b">
                    <td className="px-4 py-1.5">{d.nome}</td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {d.cards} cards
                    </td>
                    <td className="py-1.5 pr-4">
                      {d.usuario ? (
                        <span className="text-emerald-600">→ {d.usuario}</span>
                      ) : (
                        <span className="text-destructive">sem usuário</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <History className="h-4 w-4" /> Histórico dos negócios
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Anotações e atividades de cada negócio no RD viram a linha do tempo do negócio aqui. São
          duas consultas ao RD por negócio; com o limite da API, conte algumas horas para a base
          inteira. Pode parar e continuar: o que já veio não duplica.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {hist.rodando ? (
            <Button size="sm" variant="outline" onClick={() => (parar.current = true)}>
              Parar
            </Button>
          ) : (
            <Button size="sm" onClick={rodarHistorico}>
              {hist.negocios ? "Continuar" : "Importar histórico"}
            </Button>
          )}
          {(hist.negocios > 0 || hist.restantes !== null) && (
            <span>
              {hist.negocios} negócios · {hist.atividades} anotações/atividades
              {hist.restantes !== null && ` · faltam ${hist.restantes}`}
            </span>
          )}
          {hist.aviso && <span className="text-amber-600">{hist.aviso}</span>}
        </div>
      </Card>

      {data && (
        <p className="text-[11px] text-muted-foreground">
          Conferido em {format(new Date(data.geradoEm), "dd/MM/yyyy HH:mm")}
        </p>
      )}
    </div>
  );
}

function Total({ titulo, rd, crm }: { titulo: string; rd: number; crm: number | null }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-muted-foreground">{titulo}</p>
      <p className="text-lg font-semibold">
        {crm === null
          ? rd.toLocaleString("pt-BR")
          : `${crm.toLocaleString("pt-BR")} / ${rd.toLocaleString("pt-BR")}`}
      </p>
      {crm !== null && <Status ok={crm} de={rd} />}
    </Card>
  );
}

function Status({ ok, de }: { ok: number; de: number }) {
  const p = pct(ok, de);
  return (
    <span
      className={`inline-flex items-center gap-1 ${p >= 99 ? "text-emerald-600" : "text-amber-600"}`}
    >
      {p >= 99 ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {ok.toLocaleString("pt-BR")} ({p}%)
    </span>
  );
}
