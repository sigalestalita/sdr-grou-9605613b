import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { Building2, Loader2, X } from "lucide-react";
import {
  buscarClientesCs,
  opcoesDoClienteCs,
  vincularEventoDaAgenda,
} from "@/lib/cs-agenda-reunioes.functions";
import { saveCsMeeting } from "@/lib/cs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-sm";

type Cliente = { clientUid: string; nome: string };

/** Busca de cliente do CS pelo nome; mostra o escolhido com um X para trocar. */
function EscolherCliente({
  valor,
  onChange,
}: {
  valor: Cliente | null;
  onChange: (c: Cliente | null) => void;
}) {
  const fn = useServerFn(buscarClientesCs);
  const [termo, setTermo] = useState("");
  const [atrasado, setAtrasado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);
  const { data, isFetching } = useQuery({
    queryKey: ["cs-buscar-clientes", atrasado],
    queryFn: () => fn({ data: { q: atrasado } }),
    enabled: !valor && atrasado.length >= 2,
  });
  if (valor)
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{valor.nome}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
          title="Trocar empresa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  return (
    <div className="space-y-1">
      <Input
        autoFocus
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar a empresa pelo nome…"
      />
      {atrasado.length >= 2 && (
        <div className="max-h-44 overflow-y-auto rounded-md border">
          {isFetching && !data ? (
            <p className="p-2 text-xs text-muted-foreground">Buscando…</p>
          ) : !data?.length ? (
            <p className="p-2 text-xs text-muted-foreground">Nenhum cliente com esse nome.</p>
          ) : (
            data.map((c) => (
              <button
                key={c.clientUid}
                type="button"
                onClick={() => onChange({ clientUid: c.clientUid, nome: c.nome })}
                className="flex w-full items-center justify-between border-b px-3 py-1.5 text-left text-sm last:border-0 hover:bg-muted/50"
              >
                <span className="truncate">{c.nome}</span>
                {c.tipo === "consultoria" && (
                  <span className="text-[10px] text-muted-foreground">consultoria</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function useOpcoes(clientUid: string | null) {
  const fn = useServerFn(opcoesDoClienteCs);
  return useQuery({
    queryKey: ["cs-opcoes-cliente", clientUid],
    queryFn: () => fn({ data: { clientUid: clientUid! } }),
    enabled: !!clientUid,
    staleTime: 60_000,
  });
}

/** Agenda uma reunião direto na Agenda do CS: empresa, contato, tipo e horário. */
export function AgendarReuniaoDialog({
  dia,
  onClose,
}: {
  /** Dia clicado na agenda (o horário padrão é 09:00, ou a próxima hora se for hoje). */
  dia?: Date;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveCsMeeting);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const { data: opcoes } = useOpcoes(cliente?.clientUid ?? null);
  const inicioPadrao = () => {
    const d = dia ? new Date(dia) : new Date();
    const hoje = d.toDateString() === new Date().toDateString();
    if (hoje) d.setHours(new Date().getHours() + 1, 0, 0, 0);
    else d.setHours(9, 0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };
  const [f, setF] = useState({
    titulo: "",
    tipo: "",
    contato: "",
    inicio: inicioPadrao(),
    duracao: "60",
    link: "",
    pauta: "",
  });

  const salvar = useMutation({
    mutationFn: () => {
      if (!cliente) throw new Error("Escolha a empresa");
      if (!f.tipo) throw new Error("Escolha o tipo da reunião");
      const c = opcoes?.contatos.find((x) => x.id === f.contato);
      return saveFn({
        data: {
          clientUid: cliente.clientUid,
          title: f.titulo.trim() || `Reunião com ${c?.nome ?? cliente.nome}`,
          categoryId: f.tipo,
          occurredAt: f.inicio,
          durationMinutes: f.duracao ? Number(f.duracao) : null,
          status: "agendada",
          contactId: f.contato || null,
          attendees: c ? [c.nome, c.email].filter(Boolean).join(" · ") : null,
          meetingUrl: f.link.trim() || null,
          summary: f.pauta.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Reunião agendada");
      qc.invalidateQueries({ queryKey: ["cs-agenda"] });
      if (cliente) qc.invalidateQueries({ queryKey: ["cs-meetings", cliente.clientUid] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao agendar"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Agendar reunião</DialogTitle>
          <DialogDescription>
            Com uma pessoa do cliente. Fica na ficha da empresa e na agenda; pode haver várias no
            mesmo dia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <EscolherCliente
            valor={cliente}
            onChange={(c) => {
              setCliente(c);
              setF((x) => ({ ...x, contato: "" }));
            }}
          />
          {cliente && (
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className={SELECT}
                value={f.contato}
                onChange={(e) => setF({ ...f, contato: e.target.value })}
              >
                <option value="">
                  {opcoes?.contatos.length ? "Com quem (contato)…" : "Sem contatos cadastrados"}
                </option>
                {(opcoes?.contatos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.cargo ? ` · ${c.cargo}` : ""}
                  </option>
                ))}
              </select>
              <select
                className={`${SELECT} ${f.tipo ? "" : "border-amber-500/60"}`}
                value={f.tipo}
                onChange={(e) => setF({ ...f, tipo: e.target.value })}
              >
                <option value="">Tipo da reunião (obrigatório)…</option>
                {(opcoes?.tipos ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Input
                className="sm:col-span-2"
                value={f.titulo}
                onChange={(e) => setF({ ...f, titulo: e.target.value })}
                placeholder="Título (padrão: Reunião com …)"
              />
              <Input
                type="datetime-local"
                value={f.inicio}
                onChange={(e) => setF({ ...f, inicio: e.target.value })}
              />
              <Input
                type="number"
                min={5}
                step={5}
                value={f.duracao}
                onChange={(e) => setF({ ...f, duracao: e.target.value })}
                placeholder="Duração (min)"
              />
              <Input
                className="sm:col-span-2"
                value={f.link}
                onChange={(e) => setF({ ...f, link: e.target.value })}
                placeholder="Link da reunião (Meet, Zoom…)"
              />
              <Textarea
                className="sm:col-span-2"
                rows={2}
                value={f.pauta}
                onChange={(e) => setF({ ...f, pauta: e.target.value })}
                placeholder="Pauta (opcional)"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={!cliente || !f.tipo || salvar.isPending}
          >
            {salvar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Liga um evento da Google Agenda a uma empresa e a um contato dela. */
export function VincularEventoDialog({
  evento,
  onClose,
}: {
  evento: {
    id: string;
    titulo: string;
    clientUid: string | null;
    clienteNome: string | null;
    contactId: string | null;
  };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(vincularEventoDaAgenda);
  const [cliente, setCliente] = useState<Cliente | null>(
    evento.clientUid
      ? { clientUid: evento.clientUid, nome: evento.clienteNome ?? "Cliente" }
      : null,
  );
  const [contato, setContato] = useState(evento.contactId ?? "");
  const { data: opcoes } = useOpcoes(cliente?.clientUid ?? null);

  const salvar = useMutation({
    mutationFn: (desvincular: boolean) =>
      fn({
        data: {
          eventId: evento.id,
          clientUid: desvincular ? null : (cliente?.clientUid ?? null),
          contactId: desvincular ? null : contato || null,
        },
      }),
    onSuccess: (_r, desvincular) => {
      toast.success(desvincular ? "Vínculo removido" : "Reunião vinculada");
      qc.invalidateQueries({ queryKey: ["cs-agenda"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao vincular"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Vincular à empresa e ao contato</DialogTitle>
          <DialogDescription>{evento.titulo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <EscolherCliente
            valor={cliente}
            onChange={(c) => {
              setCliente(c);
              setContato("");
            }}
          />
          {cliente && (
            <select className={SELECT} value={contato} onChange={(e) => setContato(e.target.value)}>
              <option value="">
                {opcoes?.contatos.length ? "Contato (opcional)…" : "Sem contatos cadastrados"}
              </option>
              {(opcoes?.contatos ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          )}
          <p className="text-[11px] text-muted-foreground">
            Quando o e-mail de um convidado é de um contato cadastrado, o vínculo já é automático.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {evento.clientUid ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => salvar.mutate(true)}
              disabled={salvar.isPending}
            >
              Desvincular
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => salvar.mutate(false)} disabled={!cliente || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Vincular
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
