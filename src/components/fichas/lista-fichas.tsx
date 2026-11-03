import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { importarFichasCsv, listarFichas, type Ficha } from "@/lib/fichas.functions";
import { formatarDocumento } from "@/lib/fichas/normalizar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FichaDados } from "./ficha-cadastral";

/**
 * Todas as fichas recebidas do app de cadastro. As que não acharam empresa
 * pelo CNPJ ficam marcadas; quando a empresa passa a existir no Compass com
 * aquele CNPJ, a ficha se liga sozinha.
 */
export function ListaFichas() {
  const fn = useServerFn(listarFichas);
  const qc = useQueryClient();
  const importarFn = useServerFn(importarFichasCsv);
  const importar = useMutation({
    mutationFn: async (arq: File) => importarFn({ data: { csv: await arq.text() } }),
    onSuccess: (r) => {
      toast.success(
        `${r.novas} fichas importadas (${r.comEmpresa} ligadas a empresas)${r.repetidas ? ` · ${r.repetidas} já estavam aqui` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["fichas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const [busca, setBusca] = useState("");
  const [soltas, setSoltas] = useState(false);
  const [ver, setVer] = useState<Ficha | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["fichas", "todas", busca, soltas],
    queryFn: () => fn({ data: { busca, soltas } }),
  });
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Vêm do app de cadastro (cadastro-grou.lovable.app) a cada envio, e ficam na empresa e no
        negócio. {data ? `${data.total} fichas · ${data.soltas} sem empresa no Compass.` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar por nome, CNPJ/CPF ou e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={soltas} onChange={(e) => setSoltas(e.target.checked)} />{" "}
          Só sem empresa
        </label>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
          <Upload className="h-3.5 w-3.5" />
          {importar.isPending ? "Importando…" : "Importar CSV do painel"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importar.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar.mutate(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Cidade</th>
                <th className="px-3 py-2">Vendedor</th>
                <th className="px-3 py-2">Empresa no Compass</th>
                <th className="px-3 py-2">Enviada</th>
              </tr>
            </thead>
            <tbody>
              {(data?.fichas ?? []).map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  onClick={() => setVer(f)}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{f.nomeFantasia ?? f.nome}</span>
                    <span className="block text-[11px] text-muted-foreground">{f.email ?? ""}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[12px]">
                    {f.tipo} {formatarDocumento(f.documento)}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {[f.cidade, f.estado].filter(Boolean).join("/")}
                  </td>
                  <td className="px-3 py-2 text-[12px]">{f.vendedor ?? "—"}</td>
                  <td className="px-3 py-2 text-[12px]">
                    {f.empresa ? (
                      <Link
                        to="/empresas/$uid"
                        params={{ uid: f.empresa.uid }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.empresa.nome}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">não encontrada</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {new Date(f.enviadaEm).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ver && (
        <Dialog open onOpenChange={(o) => !o && setVer(null)}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{ver.nomeFantasia ?? ver.nome}</DialogTitle>
            </DialogHeader>
            <p className="text-[12px] text-muted-foreground">
              {ver.tipo} {formatarDocumento(ver.documento)} · enviada em{" "}
              {new Date(ver.enviadaEm).toLocaleString("pt-BR")}
              {ver.origem === "csv" ? " · histórico importado (só o resumo do CSV)" : ""}
            </p>
            <FichaDados f={ver} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
