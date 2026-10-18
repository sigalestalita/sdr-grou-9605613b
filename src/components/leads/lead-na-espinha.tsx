import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Building2, Handshake, User } from "lucide-react";
import { getLeadNaEspinha, listarExecutivos, passarParaExecutivo } from "@/lib/espinha.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Onde o lead está na espinha (contato → empresa → negócio) e o gesto de
 * passar para o executivo, que cria o negócio no funil Vendas. Marcar a
 * reunião pelo convite faz o mesmo automaticamente.
 */
export function LeadNaEspinha({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fn = useServerFn(getLeadNaEspinha);
  const execFn = useServerFn(listarExecutivos);
  const passarFn = useServerFn(passarParaExecutivo);
  const { data } = useQuery({
    queryKey: ["lead-espinha", leadId],
    queryFn: () => fn({ data: { leadId } }),
  });
  const [escolhendo, setEscolhendo] = useState(false);
  const [executivo, setExecutivo] = useState("");
  const { data: executivos } = useQuery({
    queryKey: ["executivos"],
    queryFn: () => execFn(),
    enabled: escolhendo,
  });
  const passar = useMutation({
    mutationFn: () => passarFn({ data: { leadId, executivoId: executivo } }),
    onSuccess: (r) => {
      toast.success("Negócio criado e executivo avisado");
      qc.invalidateQueries({ queryKey: ["lead-espinha", leadId] });
      navigate({ to: "/negocio/$id", params: { id: r.dealId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (!data) return null;
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-[13px]">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <User className="h-3.5 w-3.5" /> {data.contato?.nome ?? "sem contato"}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      {data.empresa ? (
        <Link
          to="/empresas/$uid"
          params={{ uid: data.empresa.uid }}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Building2 className="h-3.5 w-3.5" /> {data.empresa.nome}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> empresa definida na passagem
        </span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      {data.negocio ? (
        <Link
          to="/negocio/$id"
          params={{ id: data.negocio.id }}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Handshake className="h-3.5 w-3.5" /> {data.negocio.nome}
        </Link>
      ) : escolhendo ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-[12px]"
            value={executivo}
            onChange={(e) => setExecutivo(e.target.value)}
          >
            <option value="">Executivo que assume</option>
            {(executivos ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!executivo || passar.isPending}
            onClick={() => passar.mutate()}
          >
            {passar.isPending ? "Criando…" : "Criar negócio"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEscolhendo(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setEscolhendo(true)}>
          <Handshake className="mr-1 h-3.5 w-3.5" /> Passar para o executivo
        </Button>
      )}
    </Card>
  );
}
