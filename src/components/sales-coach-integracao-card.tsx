import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  gerarTokenSalesCoach,
  revogarTokenSalesCoach,
  tokensSalesCoach,
} from "@/lib/integracao-sales-coach.functions";

const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "nunca";

/**
 * Configurações → Integração com o Sales Coach. O token aparece uma vez; depois
 * só o começo dele, para saber qual revogar.
 */
export function SalesCoachIntegracaoCard() {
  const qc = useQueryClient();
  const listarFn = useServerFn(tokensSalesCoach);
  const gerarFn = useServerFn(gerarTokenSalesCoach);
  const revogarFn = useServerFn(revogarTokenSalesCoach);
  const [novo, setNovo] = useState<{ token: string; endereco: string } | null>(null);
  const { data: tokens = [], error } = useQuery({
    queryKey: ["sales-coach-tokens"],
    queryFn: () => listarFn(),
    retry: false,
  });
  const gerar = useMutation({
    mutationFn: () => gerarFn({ data: {} }),
    onSuccess: (r) => {
      setNovo(r);
      qc.invalidateQueries({ queryKey: ["sales-coach-tokens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => revogarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Token revogado. O Sales Coach para de gravar no Compass.");
      qc.invalidateQueries({ queryKey: ["sales-coach-tokens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const copiar = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => toast.success("Copiado"),
      () => toast.error("Não deu para copiar; selecione e copie à mão"),
    );
  const ativos = tokens.filter((t) => !t.revogadoEm);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex justify-between items-center gap-3">
        <h2 className="font-semibold">Integração com o Sales Coach</h2>
        <Badge variant={ativos.length ? "default" : "secondary"}>
          {ativos.length
            ? `${ativos.length} token ativo${ativos.length > 1 ? "s" : ""}`
            : "Sem token"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada reunião analisada no Sales Coach cai aqui: o resumo vira atividade “reunião” na linha
        do tempo do negócio (sem negócio aberto, da empresa ou do lead), o próximo passo combinado
        vira o próximo passo do negócio com aviso para o dono, e as notas da análise ficam guardadas
        no negócio. No Sales Coach: Configurações → Integração com CRM → Compass, e cole o endereço
        e o token gerados aqui.
      </p>
      {error && (
        <p className="text-xs text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar"}
        </p>
      )}
      {novo && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-medium">
            Copie agora: o token não aparece de novo. Se perder, gere outro e revogue este.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={novo.endereco} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copiar(novo.endereco)}>
              Copiar endereço
            </Button>
          </div>
          <div className="flex gap-2">
            <Input readOnly value={novo.token} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copiar(novo.token)}>
              Copiar token
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNovo(null)}>
            Já copiei
          </Button>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <span className="font-mono text-xs">{t.prefixo}…</span>{" "}
                <span className="text-xs text-muted-foreground">
                  criado por {t.criadoPor} em {quando(t.criadoEm)} · último uso {quando(t.usadoEm)}
                </span>
              </div>
              {t.revogadoEm ? (
                <Badge variant="outline">Revogado em {quando(t.revogadoEm)}</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revogar.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Revogar este token? O Sales Coach deixa de gravar no Compass até receber um novo.",
                      )
                    )
                      revogar.mutate(t.id);
                  }}
                >
                  Revogar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
        {gerar.isPending ? "Gerando…" : "Gerar token"}
      </Button>
    </Card>
  );
}
