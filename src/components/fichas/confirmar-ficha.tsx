import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link2 } from "lucide-react";
import { buscarEmpresaParaFicha, confirmarFicha, getFicha } from "@/lib/fichas.functions";
import { formatarDocumento } from "@/lib/fichas/normalizar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Confirmação do executivo: a ficha bateu (ou não) com uma empresa pelo CNPJ.
 * Ele confere os dados e confirma o vínculo — ou escolhe a empresa certa.
 * Confirmar completa o cadastro e a política de faturamento da empresa.
 */
export function ConfirmarFicha({ fichaId }: { fichaId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getFicha);
  const buscarFn = useServerFn(buscarEmpresaParaFicha);
  const confirmarFn = useServerFn(confirmarFicha);
  const { data } = useQuery({
    queryKey: ["ficha", fichaId],
    queryFn: () => getFn({ data: { id: fichaId } }),
  });
  const [busca, setBusca] = useState("");
  const { data: achadas } = useQuery({
    queryKey: ["ficha-busca-empresa", busca],
    queryFn: () => buscarFn({ data: { q: busca } }),
    enabled: busca.trim().length >= 2,
  });
  const confirmar = useMutation({
    mutationFn: (companyId: string | null) => confirmarFn({ data: { id: fichaId, companyId } }),
    onSuccess: (_r, companyId) => {
      toast.success(companyId ? "Ficha confirmada e ligada à empresa" : "Vínculo desfeito");
      qc.invalidateQueries({ queryKey: ["ficha", fichaId] });
      qc.invalidateQueries({ queryKey: ["fichas"] });
      qc.invalidateQueries({ queryKey: ["politica-faturamento"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (!data) return null;
  const { ficha, confirmadaPorNome, sugestoes } = data;

  const opcao = (e: { id: string; nome: string; cnpj: string | null }) => (
    <li key={e.id} className="flex items-center justify-between gap-2 py-1">
      <span className="min-w-0 truncate">
        {e.nome}
        {e.cnpj ? (
          <span className="ml-1 text-muted-foreground">· {formatarDocumento(e.cnpj)}</span>
        ) : null}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0"
        disabled={confirmar.isPending}
        onClick={() => confirmar.mutate(e.id)}
      >
        <Link2 className="mr-1 h-3 w-3" /> Vincular
      </Button>
    </li>
  );

  return (
    <div className="space-y-2 rounded-md border p-3 text-[13px]">
      {ficha.confirmadaEm && ficha.empresa ? (
        <p className="flex items-center gap-1.5 text-success">
          <CheckCircle2 className="h-4 w-4" />
          Confirmada{confirmadaPorNome ? ` por ${confirmadaPorNome}` : ""} em{" "}
          {new Date(ficha.confirmadaEm).toLocaleDateString("pt-BR")} · {ficha.empresa.nome}
        </p>
      ) : ficha.empresa ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Ligada pelo CNPJ a <strong>{ficha.empresa.nome}</strong>. Os dados conferem?
          </span>
          <Button
            size="sm"
            disabled={confirmar.isPending}
            onClick={() => confirmar.mutate(ficha.empresa!.id)}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar dados
          </Button>
        </div>
      ) : (
        <p className="text-warning">
          Esta ficha ainda não está ligada a nenhuma empresa. Escolha a empresa para confirmar.
        </p>
      )}

      {!ficha.empresa && sugestoes.length > 0 && (
        <div>
          <p className="text-[12px] text-muted-foreground">Empresas com nome parecido</p>
          <ul className="divide-y">{sugestoes.map(opcao)}</ul>
        </div>
      )}

      <details className="text-[12px]" open={!ficha.empresa && sugestoes.length === 0}>
        <summary className="cursor-pointer text-muted-foreground">
          {ficha.empresa ? "Não é esta empresa? Trocar" : "Buscar outra empresa"}
        </summary>
        <Input
          className="mt-2 h-8"
          placeholder="Nome ou CNPJ da empresa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {achadas && achadas.length > 0 && <ul className="mt-1 divide-y">{achadas.map(opcao)}</ul>}
        {achadas && achadas.length === 0 && (
          <p className="mt-1 text-muted-foreground">
            Nenhuma empresa encontrada. Cadastre a empresa com o CNPJ da ficha e ela se liga
            sozinha.
          </p>
        )}
        {ficha.empresa && (
          <button
            type="button"
            className="mt-2 text-muted-foreground underline"
            disabled={confirmar.isPending}
            onClick={() => confirmar.mutate(null)}
          >
            Desfazer o vínculo
          </button>
        )}
      </details>
    </div>
  );
}
