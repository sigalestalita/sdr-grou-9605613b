import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { descadastrarManual, listarDescadastros } from "@/lib/email-marketing.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/email-marketing/descadastros")({
  component: DescadastrosPage,
  head: () => ({ meta: [{ title: "Descadastros | Grou Compass" }] }),
});

const ORIGENS: Record<string, string> = {
  link: "Link no e-mail",
  manual: "Manual",
  bounce: "E-mail inválido",
  reclamacao: "Marcou como spam",
};
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function DescadastrosPage() {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarDescadastros);
  const descadastrarFn = useServerFn(descadastrarManual);
  const { data, isLoading, error } = useQuery({
    queryKey: ["email-mkt", "descadastros"],
    queryFn: () => listarFn(),
  });
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return data ?? [];
    return (data ?? []).filter((d) =>
      [d.email, d.motivo ?? "", d.origem].some((v) => v.toLowerCase().includes(b)),
    );
  }, [data, busca]);

  const { validos, invalidos } = useMemo(() => {
    const partes = texto
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const unicos = [...new Set(partes)];
    return {
      validos: unicos.filter((e) => EMAIL_OK.test(e)),
      invalidos: unicos.filter((e) => !EMAIL_OK.test(e)),
    };
  }, [texto]);

  const enviar = useMutation({
    mutationFn: () =>
      descadastrarFn({ data: { emails: validos.slice(0, 5000), motivo: motivo.trim() || null } }),
    onSuccess: (r) => {
      toast.success(`${r.total.toLocaleString("pt-BR")} e-mail(s) descadastrado(s)`);
      setTexto("");
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["email-mkt", "descadastros"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
      <div className="min-w-0 space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Quem está aqui não recebe nenhuma campanha de e-mail marketing, mesmo que entre numa
          segmentação.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar e-mail, motivo ou origem"
            className="h-9 w-full text-[13px] sm:w-72"
          />
          <span className="text-[12px] text-muted-foreground">
            {data
              ? `${lista.length.toLocaleString("pt-BR")} de ${data.length.toLocaleString("pt-BR")}`
              : ""}
          </span>
        </div>
        <Card className="overflow-hidden">
          {isLoading ? (
            <p className="p-4 text-[13px] text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="p-4 text-[13px] text-destructive">
              {error instanceof Error ? error.message : "Erro ao carregar"}
            </p>
          ) : lista.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-muted-foreground">
              {data?.length ? "Nada encontrado." : "Ninguém descadastrado ainda."}
            </p>
          ) : (
            <div className="max-h-[calc(100vh-240px)] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">E-mail</th>
                    <th className="px-3 py-2">Origem</th>
                    <th className="hidden px-3 py-2 sm:table-cell">Motivo</th>
                    <th className="px-3 py-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d) => (
                    <tr key={d.email} className="border-b align-top last:border-0">
                      <td className="break-all px-3 py-2">
                        {d.email}
                        {d.motivo && (
                          <span className="block text-[11px] text-muted-foreground sm:hidden">
                            {d.motivo}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">
                        {ORIGENS[d.origem] ?? d.origem}
                      </td>
                      <td className="hidden px-3 py-2 text-[12px] text-muted-foreground sm:table-cell">
                        {d.motivo ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="h-fit space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Ban className="h-4 w-4" /> Descadastrar manualmente
        </h2>
        <Textarea
          rows={7}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={"um@email.com\noutro@email.com, mais@email.com"}
          className="font-mono text-[12px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Um por linha ou separados por vírgula.
          {texto.trim() && ` ${validos.length} válido(s).`}
          {invalidos.length > 0 && (
            <span className="block text-amber-600">
              Ignorados ({invalidos.length}): {invalidos.slice(0, 5).join(", ")}
              {invalidos.length > 5 ? "…" : ""}
            </span>
          )}
        </p>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={200}
          placeholder="Motivo (opcional)"
          className="text-[13px]"
        />
        <Button
          size="sm"
          className="w-full"
          disabled={enviar.isPending || validos.length === 0}
          onClick={() => {
            if (
              window.confirm(
                `Descadastrar ${validos.length} e-mail(s)? Eles deixam de receber campanhas.`,
              )
            )
              enviar.mutate();
          }}
        >
          {enviar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Descadastrar
        </Button>
      </Card>
    </div>
  );
}
