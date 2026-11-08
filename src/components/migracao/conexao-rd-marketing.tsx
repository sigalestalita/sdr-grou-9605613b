import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { conectarRdMarketing, statusRdMarketing } from "@/lib/rd-marketing-api.functions";

/**
 * Conexão com a API do RD Marketing: traz todas as conversões e
 * oportunidades de cada lead (o export em CSV só traz a primeira e a última).
 */
export function ConexaoRdMarketing() {
  const statusFn = useServerFn(statusRdMarketing);
  const conectarFn = useServerFn(conectarRdMarketing);
  const { data, refetch, error } = useQuery({
    queryKey: ["rd-marketing-conexao"],
    queryFn: () => statusFn({}),
  });
  const conectar = useMutation({
    mutationFn: () => conectarFn({}),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao conectar"),
  });

  // Volta do RD com ?rdm=ok|erro.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("rdm");
    if (!r) return;
    if (r === "ok") toast.success("RD Marketing conectado");
    else toast.error(p.get("msg") || "Não foi possível conectar o RD Marketing");
    p.delete("rdm");
    p.delete("msg");
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    void refetch();
  }, [refetch]);

  if (error) return null;
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold">Histórico completo pela API do RD Marketing</p>
          <p className="text-[12px] text-muted-foreground">
            Traz todas as conversões e oportunidades de cada lead. O CSV só traz a primeira e a
            última.
          </p>
        </div>
        <Button
          size="sm"
          variant={data?.conectado ? "outline" : "default"}
          disabled={!data?.temCredenciais || conectar.isPending}
          onClick={() => conectar.mutate()}
        >
          <Link2 className="mr-1 h-3.5 w-3.5" />
          {data?.conectado ? "Reconectar" : "Conectar RD Marketing"}
        </Button>
      </div>
      {data && !data.temCredenciais && (
        <p className="text-[12px] text-warning">
          Falta colocar RD_MKT_CLIENT_ID e RD_MKT_CLIENT_SECRET nos secrets do Lovable.
        </p>
      )}
      {data?.conectado && (
        <p className="text-[12px] text-muted-foreground">
          Conectado em {new Date(data.conectadoEm ?? "").toLocaleString("pt-BR")} ·{" "}
          {data.leadsLigados.toLocaleString("pt-BR")} leads ligados ao RD ·{" "}
          {data.historicosBuscados.toLocaleString("pt-BR")} com histórico importado
        </p>
      )}
      {data?.ultimoErro && (
        <p className="text-[11px] text-destructive">Último erro: {data.ultimoErro}</p>
      )}
    </Card>
  );
}
