import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  decidirRevisaoValor,
  listarRevisaoValores,
  type LinhaRevisao,
} from "@/lib/revisao-valores.functions";

export const Route = createFileRoute("/_app/revisao-valores")({
  component: RevisaoValoresPage,
  head: () => ({ meta: [{ title: "Revisão de valores | Grou Compass" }] }),
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

type Status = "pendente" | "corrigido" | "mantido" | "todos";
const ABAS: Array<{ v: Status; l: string }> = [
  { v: "pendente", l: "Para revisar" },
  { v: "corrigido", l: "Corrigidos" },
  { v: "mantido", l: "Mantidos" },
  { v: "todos", l: "Todos" },
];

function RevisaoValoresPage() {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarRevisaoValores);
  const decidirFn = useServerFn(decidirRevisaoValor);
  const [status, setStatus] = useState<Status>("pendente");
  const [busca, setBusca] = useState("");
  const [buscaAtrasada, setBuscaAtrasada] = useState("");
  const [pagina, setPagina] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAtrasada(busca.trim());
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["revisao-valores", status, buscaAtrasada, pagina],
    queryFn: () => listarFn({ data: { status, busca: buscaAtrasada, pagina } }),
    placeholderData: (anterior) => anterior,
  });
  const decidir = useMutation({
    mutationFn: (v: {
      dealId: string;
      acao: "dividir10" | "dividir100" | "manter" | "valor" | "desfazer";
      valor?: number;
    }) => decidirFn({ data: v }),
    onSuccess: (r, v) => {
      toast.success(
        v.acao === "desfazer" ? "Voltou para revisar" : `Valor gravado: ${brl(r.valor)}`,
      );
      qc.invalidateQueries({ queryKey: ["revisao-valores"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const r = data?.resumo;
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1;

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Revisão de valores</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Negócios antigos cujo valor veio do campo “[backup] Valor” do RD, que perdeu a vírgula dos
          centavos (R$ 2.456,10 virou 24.561). Estão aqui os que ficaram muito acima do preço típico
          do produto naquele ano. Escolha o valor certo: a decisão já corrige o negócio e pode ser
          desfeita.
        </p>
      </div>

      {r && (
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="outline">Para revisar: {r.pendente}</Badge>
          <Badge variant="outline">Corrigidos: {r.corrigido}</Badge>
          <Badge variant="outline">Mantidos: {r.mantido}</Badge>
          {r.corrigido + r.mantido > 0 && (
            <span className="text-muted-foreground">
              Revisados somavam {brl(r.somaAntes)} → agora {brl(r.somaDepois)}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map((a) => (
          <Button
            key={a.v}
            size="sm"
            variant={status === a.v ? "default" : "outline"}
            onClick={() => {
              setStatus(a.v);
              setPagina(0);
            }}
          >
            {a.l}
          </Button>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Empresa, negócio ou produto…"
            className="pl-8"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      )}
      {isLoading && !data && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Empresa · negócio</th>
                <th className="p-2">Produto</th>
                <th className="p-2">Fechado</th>
                <th className="p-2 text-right">No Compass</th>
                <th className="p-2 text-right">Preço típico no ano</th>
                <th className="p-2">Valor certo</th>
              </tr>
            </thead>
            <tbody>
              {data.linhas.map((l) => (
                <Linha
                  key={l.dealId}
                  l={l}
                  ocupado={decidir.isPending}
                  decidir={(v) => decidir.mutate(v)}
                />
              ))}
              {data.linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Nada aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && paginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground">
            {pagina + 1} de {paginas} · {data.total} negócios
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagina + 1 >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}

function Linha({
  l,
  ocupado,
  decidir,
}: {
  l: LinhaRevisao;
  ocupado: boolean;
  decidir: (v: {
    dealId: string;
    acao: "dividir10" | "dividir100" | "manter" | "valor" | "desfazer";
    valor?: number;
  }) => void;
}) {
  const [outro, setOutro] = useState("");
  const d10 = Math.round((l.valorOriginal / 10) * 100) / 100;
  const d100 = Math.round(l.valorOriginal) / 100;
  const sugerido = (v: number) => l.sugestao != null && Math.abs(l.sugestao - v) < 0.01;
  const revisado = l.status !== "pendente";
  return (
    <tr className="border-t align-top">
      <td className="p-2">
        <div className="font-medium">{l.empresa ?? "—"}</div>
        <Link
          to="/negocio/$id"
          params={{ id: l.dealId }}
          className="text-xs text-primary hover:underline"
        >
          {l.negocio ?? "Negócio"}
        </Link>
        {l.rdDealId && (
          <a
            href={`https://crm.rdstation.com/app/deals/${l.rdDealId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary"
          >
            RD <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
      <td className="max-w-[220px] p-2 text-xs">{l.produto ?? "—"}</td>
      <td className="whitespace-nowrap p-2 text-xs">{dataBr(l.fechadoEm)}</td>
      <td className="whitespace-nowrap p-2 text-right font-mono">{brl(l.valorOriginal)}</td>
      <td className="whitespace-nowrap p-2 text-right text-xs text-muted-foreground">
        {brl(l.precoTipico)}
      </td>
      <td className="p-2">
        {revisado ? (
          <div className="flex items-center gap-2">
            <Badge variant={l.status === "corrigido" ? "default" : "outline"}>
              {l.status === "corrigido" ? brl(l.valorFinal) : "Mantido"}
            </Badge>
            <span className="text-xs text-muted-foreground">{l.revisadoPor}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              title="Desfazer"
              onClick={() => decidir({ dealId: l.dealId, acao: "desfazer" })}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={sugerido(d10) ? "default" : "outline"}
              disabled={ocupado}
              onClick={() => decidir({ dealId: l.dealId, acao: "dividir10" })}
            >
              {brl(d10)}
            </Button>
            <Button
              size="sm"
              variant={sugerido(d100) ? "default" : "outline"}
              disabled={ocupado}
              onClick={() => decidir({ dealId: l.dealId, acao: "dividir100" })}
            >
              {brl(d100)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() => decidir({ dealId: l.dealId, acao: "manter" })}
            >
              Está certo
            </Button>
            <Input
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const v = Number(outro.replace(/\./g, "").replace(",", "."));
                if (Number.isFinite(v) && v >= 0)
                  decidir({ dealId: l.dealId, acao: "valor", valor: v });
              }}
              placeholder="Outro (Enter)"
              className="h-8 w-28 text-xs"
            />
          </div>
        )}
      </td>
    </tr>
  );
}
