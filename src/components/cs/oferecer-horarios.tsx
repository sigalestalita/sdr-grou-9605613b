import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarRange, Check, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  cancelarOfertaDeHorarios,
  criarOfertaDeHorarios,
  escolherHorarioDaOferta,
  listarOfertasDoCliente,
} from "@/lib/cs-reuniao-ofertas.functions";
import { MAX_HORARIOS } from "@/lib/cs/oferta-horarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const local = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const sugestao = (dias: number) => {
  const d = addDays(new Date(), dias);
  d.setHours(10, 0, 0, 0);
  return local(d);
};

/**
 * Oferecer horários ao cliente: o CS reserva 2 a 6 horários e manda o link;
 * o cliente escolhe um (ou o CS marca o escolhido). Fica na aba Reuniões.
 */
export function OfertasDeHorarios({
  clientUid,
  contatos,
  tipos,
  invalidar,
}: {
  clientUid: string;
  contatos: Array<{ id: string; nome: string; email?: string | null }>;
  tipos: Array<{ id: string; name: string }>;
  invalidar: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarOfertasDoCliente);
  const criarFn = useServerFn(criarOfertaDeHorarios);
  const escolherFn = useServerFn(escolherHorarioDaOferta);
  const cancelarFn = useServerFn(cancelarOfertaDeHorarios);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    titulo: "",
    tipo: "",
    contato: "",
    duracao: "60",
    link: "",
    pauta: "",
    horarios: [sugestao(1), sugestao(2)],
  });

  const { data: ofertas } = useQuery({
    queryKey: ["cs-ofertas", clientUid],
    queryFn: () => listFn({ data: { clientUid } }),
  });
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["cs-ofertas", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-agenda"] });
    invalidar();
  };
  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Mande para o cliente escolher o horário.");
    } catch {
      toast.info(link);
    }
  };

  const criar = useMutation({
    mutationFn: () => {
      const c = contatos.find((x) => x.id === f.contato);
      return criarFn({
        data: {
          clientUid,
          contactId: f.contato || null,
          title: f.titulo.trim() || `Reunião com ${c?.nome ?? "o cliente"}`,
          categoryId: f.tipo,
          durationMinutes: Number(f.duracao) || 60,
          meetingUrl: f.link.trim() || null,
          summary: f.pauta.trim() || null,
          horarios: f.horarios.filter(Boolean).map((h) => new Date(h).toISOString()),
        },
      });
    },
    onSuccess: async (r) => {
      setAberto(false);
      atualizar();
      await copiar(r.link);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao oferecer horários"),
  });
  const escolher = useMutation({
    mutationFn: (p: { ofertaId: string; meetingId: string }) => escolherFn({ data: p }),
    onSuccess: (r) => {
      toast.success(
        r.convite?.enviado
          ? `Horário confirmado e convite de calendário enviado para ${r.convite.para.join(", ")}.`
          : "Horário confirmado. Os outros foram liberados. (Convite não enviado: o contato não tem e-mail.)",
      );
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const cancelar = useMutation({
    mutationFn: (ofertaId: string) => cancelarFn({ data: { ofertaId } }),
    onSuccess: () => {
      toast.success("Oferta cancelada. Os horários foram liberados.");
      atualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const abertas = (ofertas ?? []).filter((o) => o.status === "aberta");

  return (
    <div className="space-y-2">
      {!aberto ? (
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Oferecer horários
        </Button>
      ) : (
        <Card className="space-y-2 p-3">
          <p className="text-[12px] font-semibold">Oferecer horários para o cliente escolher</p>
          <p className="text-[11px] text-muted-foreground">
            Os horários ficam reservados na sua agenda. O cliente escolhe um pelo link (ou você
            marca o escolhido aqui) e os outros são liberados.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={SELECT}
              value={f.contato}
              onChange={(e) => setF({ ...f, contato: e.target.value })}
            >
              <option value="">
                {contatos.length ? "Com quem (contato)…" : "Sem contatos cadastrados"}
              </option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select
              className={`${SELECT} ${f.tipo ? "" : "border-amber-500/60"}`}
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
            >
              <option value="">Tipo da reunião (obrigatório)…</option>
              {tipos.map((t) => (
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
              type="number"
              min={5}
              step={5}
              value={f.duracao}
              onChange={(e) => setF({ ...f, duracao: e.target.value })}
              placeholder="Duração (min)"
            />
            <Input
              value={f.link}
              onChange={(e) => setF({ ...f, link: e.target.value })}
              placeholder="Link da reunião (Meet, Zoom…)"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Horários oferecidos</p>
            {f.horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={h}
                  onChange={(e) =>
                    setF({
                      ...f,
                      horarios: f.horarios.map((x, j) => (j === i ? e.target.value : x)),
                    })
                  }
                />
                {f.horarios.length > 2 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setF({ ...f, horarios: f.horarios.filter((_, j) => j !== i) })}
                    title="Tirar este horário"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {f.horarios.length < MAX_HORARIOS && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                onClick={() =>
                  setF({ ...f, horarios: [...f.horarios, sugestao(f.horarios.length + 1)] })
                }
              >
                <Plus className="h-3 w-3" /> Mais um horário
              </button>
            )}
          </div>
          <Textarea
            rows={2}
            value={f.pauta}
            onChange={(e) => setF({ ...f, pauta: e.target.value })}
            placeholder="Pauta (opcional)"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={!f.tipo || criar.isPending} onClick={() => criar.mutate()}>
              {criar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Reservar e copiar link
            </Button>
          </div>
        </Card>
      )}

      {abertas.length > 0 && (
        <div className="space-y-2">
          <p className="section-label">Aguardando o cliente escolher</p>
          {abertas.map((o) => (
            <Card key={o.id} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{o.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.contatoNome ? `com ${o.contatoNome} · ` : ""}oferecida{" "}
                    {format(new Date(o.criadaEm), "dd/MM HH:mm")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => copiar(o.link)}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copiar link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-destructive hover:text-destructive"
                    disabled={cancelar.isPending}
                    onClick={() => {
                      if (window.confirm("Cancelar a oferta e liberar os horários?"))
                        cancelar.mutate(o.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Cancelar
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {o.horarios
                  .filter((h) => h.status === "reservada")
                  .map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]"
                    >
                      <Badge variant="outline" className="text-[9px]">
                        reservado
                      </Badge>
                      {format(new Date(h.inicio), "EEE dd/MM HH:mm", { locale: ptBR })}
                      <button
                        type="button"
                        title="O cliente escolheu este: confirmar"
                        className="ml-1 text-emerald-600 hover:text-emerald-700"
                        disabled={escolher.isPending}
                        onClick={() => escolher.mutate({ ofertaId: o.id, meetingId: h.id })}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
