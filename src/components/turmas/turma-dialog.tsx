import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { salvarTurma } from "@/lib/contratos-turmas.functions";
import { listarCatalogo } from "@/lib/catalogo.functions";
import { listarPessoas } from "@/lib/notificacoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const STATUS_TURMA: Record<string, string> = {
  aberta: "Inscrições abertas",
  confirmada: "Confirmada",
  em_andamento: "Em andamento",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};

export function TurmaDialog({
  turma,
  onClose,
}: {
  turma?: Record<string, string | number | null>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarTurma);
  const catalogoFn = useServerFn(listarCatalogo);
  const pessoasFn = useServerFn(listarPessoas);
  const { data: catalogo } = useQuery({ queryKey: ["catalogo"], queryFn: () => catalogoFn() });
  const { data: pessoas } = useQuery({ queryKey: ["pessoas-mencao"], queryFn: () => pessoasFn() });
  const s = (k: string) => (turma?.[k] == null ? "" : String(turma[k]));
  const [f, setF] = useState({
    nome: s("nome"),
    product_id: s("product_id"),
    formato: s("formato") || "online",
    inicio: s("inicio"),
    fim: s("fim"),
    horario: s("horario"),
    vagas: s("vagas"),
    trainer_id: s("trainer_id"),
    local: s("local"),
    link_acesso: s("link_acesso"),
    kickoff_em: s("kickoff_em").slice(0, 16),
    status: s("status") || "aberta",
    observacoes: s("observacoes"),
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id: turma?.id ? String(turma.id) : undefined,
          nome: f.nome.trim(),
          product_id: f.product_id || null,
          formato: (f.formato || null) as "online" | "presencial" | "hibrido" | null,
          inicio: f.inicio || null,
          fim: f.fim || null,
          horario: f.horario.trim() || null,
          vagas: f.vagas ? Number(f.vagas) : null,
          trainer_id: f.trainer_id || null,
          local: f.local.trim() || null,
          link_acesso: f.link_acesso.trim() || null,
          kickoff_em: f.kickoff_em ? new Date(f.kickoff_em).toISOString() : null,
          status: f.status as "aberta",
          observacoes: f.observacoes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Turma salva");
      qc.invalidateQueries({ queryKey: ["turmas"] });
      qc.invalidateQueries({ queryKey: ["turma"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";
  const servicos = (catalogo?.produtos ?? []).filter((p) => p.tipo === "servico" && p.ativo);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{turma ? "Editar turma" : "Nova turma"}</DialogTitle>
          <DialogDescription>Vagas limitam a aprovação das inscrições.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Nome</Label>
            <Input
              value={f.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Certificação PDA — novembro"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Serviço do catálogo</Label>
              <select
                className={sel}
                value={f.product_id}
                onChange={(e) => set("product_id", e.target.value)}
              >
                <option value="">—</option>
                {servicos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Trainer</Label>
              <select
                className={sel}
                value={f.trainer_id}
                onChange={(e) => set("trainer_id", e.target.value)}
              >
                <option value="">—</option>
                {(pessoas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Início</Label>
              <Input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Fim</Label>
              <Input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Vagas</Label>
              <Input
                type="number"
                min={1}
                value={f.vagas}
                onChange={(e) => set("vagas", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Formato</Label>
              <select
                className={sel}
                value={f.formato}
                onChange={(e) => set("formato", e.target.value)}
              >
                <option value="online">Online</option>
                <option value="presencial">Presencial</option>
                <option value="hibrido">Híbrido</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Horário</Label>
              <Input
                value={f.horario}
                onChange={(e) => set("horario", e.target.value)}
                placeholder="9h–12h"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Situação</Label>
              <select
                className={sel}
                value={f.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {Object.entries(STATUS_TURMA).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Kick-off</Label>
              <Input
                type="datetime-local"
                value={f.kickoff_em}
                onChange={(e) => set("kickoff_em", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Local</Label>
              <Input value={f.local} onChange={(e) => set("local", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Link de acesso (online)</Label>
            <Input
              value={f.link_acesso}
              onChange={(e) => set("link_acesso", e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={f.nome.trim().length < 2 || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
