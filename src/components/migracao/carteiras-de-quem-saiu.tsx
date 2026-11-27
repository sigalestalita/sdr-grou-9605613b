import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  carteirasSemDono,
  transferirCarteira,
  type CarteiraSemDono,
} from "@/lib/migracao-rd.functions";

type OpcaoNegocios = "nenhum" | "abertos" | "todos";
const n = (v: number) => v.toLocaleString("pt-BR");

/**
 * Carteiras de quem saiu: negócios e empresas sem dono no Compass, pelo nome do
 * dono no RD. A gestão escolhe para quem vai e o que vai (negócios abertos, todos
 * os negócios, empresas). O enviado fica marcado como manual e o RD não desfaz.
 */
export function CarteirasDeQuemSaiu() {
  const qc = useQueryClient();
  const listarFn = useServerFn(carteirasSemDono);
  const transferirFn = useServerFn(transferirCarteira);
  const { data, isLoading, error } = useQuery({
    queryKey: ["carteiras-sem-dono"],
    queryFn: () => listarFn(),
  });
  const transferir = useMutation({
    mutationFn: (v: {
      nome: string;
      destinoId: string;
      negocios: OpcaoNegocios;
      empresas: boolean;
    }) => transferirFn({ data: v }),
    onSuccess: (r, v) => {
      const quem = data?.usuarios.find((u) => u.id === v.destinoId)?.nome ?? "";
      toast.success(
        `Carteira de ${v.nome} enviada para ${quem}: ${n(r.negocios)} negócios e ${n(r.empresas)} empresas`,
      );
      qc.invalidateQueries({ queryKey: ["carteiras-sem-dono"] });
      qc.invalidateQueries({ queryKey: ["comercial-pipeline"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Card className="overflow-x-auto p-0">
      <h2 className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold">
        <UserMinus className="h-4 w-4" /> Carteiras de quem saiu
      </h2>
      <p className="px-4 pb-2 text-[12px] text-muted-foreground">
        Negócios e empresas sem responsável no Compass, pelo nome do dono no RD (pessoas sem login
        aqui). Escolha para quem enviar e o quê. O que for enviado não volta a ficar sem dono na
        releitura do RD. Os negócios ganhos ficam como estão, a não ser que você escolha “todos os
        negócios”: assim as vendas antigas continuam no nome de quem vendeu.
      </p>
      {isLoading && <p className="px-4 pb-4 text-[12px] text-muted-foreground">Carregando…</p>}
      {error && (
        <p className="px-4 pb-4 text-[12px] text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      )}
      {data && data.carteiras.length === 0 && (
        <p className="px-4 pb-4 text-[12px] text-muted-foreground">Nenhuma carteira sem dono.</p>
      )}
      {data && data.carteiras.length > 0 && (
        <table className="w-full text-[12px]">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-1.5 font-normal">Dono no RD</th>
              <th className="py-1.5 pr-3 text-right font-normal">Negócios abertos</th>
              <th className="py-1.5 pr-3 text-right font-normal">Negócios (todos)</th>
              <th className="py-1.5 pr-3 text-right font-normal">Empresas</th>
              <th className="py-1.5 pr-4 font-normal">Enviar para</th>
            </tr>
          </thead>
          <tbody>
            {data.carteiras.map((c) => (
              <Linha
                key={c.nome}
                c={c}
                usuarios={data.usuarios}
                ocupado={transferir.isPending}
                enviar={(v) => transferir.mutate({ nome: c.nome, ...v })}
              />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Linha({
  c,
  usuarios,
  ocupado,
  enviar,
}: {
  c: CarteiraSemDono;
  usuarios: Array<{ id: string; nome: string }>;
  ocupado: boolean;
  enviar: (v: { destinoId: string; negocios: OpcaoNegocios; empresas: boolean }) => void;
}) {
  const [destino, setDestino] = useState("");
  const [negocios, setNegocios] = useState<OpcaoNegocios>(c.abertos > 0 ? "abertos" : "nenhum");
  const [empresas, setEmpresas] = useState(c.empresas > 0);
  const qtdNegocios = negocios === "todos" ? c.negocios : negocios === "abertos" ? c.abertos : 0;
  const qtdEmpresas = empresas ? c.empresas : 0;
  const nada = qtdNegocios + qtdEmpresas === 0;
  const quem = usuarios.find((u) => u.id === destino)?.nome;

  function confirmar() {
    if (!destino || nada) return;
    const partes = [
      qtdNegocios ? `${n(qtdNegocios)} negócios${negocios === "abertos" ? " abertos" : ""}` : "",
      qtdEmpresas ? `${n(qtdEmpresas)} empresas` : "",
    ].filter(Boolean);
    if (!window.confirm(`Enviar ${partes.join(" e ")} de ${c.nome} para ${quem}?`)) return;
    enviar({ destinoId: destino, negocios, empresas });
  }

  return (
    <tr className="border-b align-middle">
      <td className="px-4 py-1.5">{c.nome}</td>
      <td className="py-1.5 pr-3 text-right">{n(c.abertos)}</td>
      <td className="py-1.5 pr-3 text-right text-muted-foreground">
        {n(c.negocios)}
        {c.ganhos > 0 && <span className="text-[11px]"> ({n(c.ganhos)} ganhos)</span>}
      </td>
      <td className="py-1.5 pr-3 text-right">{n(c.empresas)}</td>
      <td className="py-1.5 pr-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            className="h-7 w-44 rounded-md border bg-background px-1 text-[11px]"
            value={destino}
            disabled={ocupado}
            onChange={(e) => setDestino(e.target.value)}
          >
            <option value="">Escolha quem recebe</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded-md border bg-background px-1 text-[11px]"
            value={negocios}
            disabled={ocupado || c.negocios === 0}
            onChange={(e) => setNegocios(e.target.value as OpcaoNegocios)}
          >
            <option value="abertos">Negócios abertos</option>
            <option value="todos">Todos os negócios</option>
            <option value="nenhum">Nenhum negócio</option>
          </select>
          <label className="flex items-center gap-1 text-[11px]">
            <input
              type="checkbox"
              checked={empresas}
              disabled={ocupado || c.empresas === 0}
              onChange={(e) => setEmpresas(e.target.checked)}
            />
            Empresas
          </label>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={ocupado || !destino || nada}
            onClick={confirmar}
          >
            Enviar
          </Button>
        </div>
      </td>
    </tr>
  );
}
