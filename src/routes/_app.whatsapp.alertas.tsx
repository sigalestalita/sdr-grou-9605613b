import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHotLeadAlerts } from "@/lib/hot-alerts.functions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Mail, MessageCircle, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/alertas")({
  component: HotAlertsLogPage,
});

type ChannelResult = {
  ok?: boolean;
  error?: string;
  skipped?: string;
  reason?: string;
  to?: string[];
  phone?: string;
  mode?: string;
  ms?: number;
  message_id?: string;
  provider_message_id?: string;
};

function ChannelBadge({ ch, result }: { ch: "email" | "wpp"; result?: ChannelResult }) {
  const Icon = ch === "email" ? Mail : MessageCircle;
  if (!result) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-muted-foreground text-xs">
        <Icon className="h-3 w-3" /> —
      </div>
    );
  }
  const status = result.ok ? "ok" : result.skipped ? "skipped" : "error";
  const color =
    status === "ok"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "skipped"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";
  const label = status === "ok" ? "enviado" : status === "skipped" ? "pulado" : "erro";
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded border text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="font-medium">{label}</span>
      {result.ms != null && <span className="opacity-70">· {result.ms}ms</span>}
    </div>
  );
}

function reasonText(result?: ChannelResult) {
  if (!result) return null;
  if (result.ok) return null;
  return result.reason || result.error || result.skipped || "falha desconhecida";
}

function AlertRow({ row }: { row: { id: string; created_at: string; status: string; detail: any } }) {
  const [open, setOpen] = useState(false);
  const detail = row.detail ?? {};
  const email = detail.email as ChannelResult | undefined;
  const wpp = detail.whatsapp as ChannelResult | undefined;
  const priority = detail.priority as string | undefined;
  const skipReason = row.status === "skipped" ? (detail.reason as string | undefined) : undefined;

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="text-xs text-muted-foreground w-32 shrink-0">
          {new Date(row.created_at).toLocaleString("pt-BR")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{detail.lead_name || "—"}</span>
            {priority && (
              <Badge variant="outline" className="text-[10px] py-0 h-4">
                {priority === "alta" ? "🔥 alta" : "⚡ média"}
              </Badge>
            )}
            {detail.lead_type && (
              <Badge variant="outline" className="text-[10px] py-0 h-4">
                {String(detail.lead_type)}
              </Badge>
            )}
          </div>
          {skipReason && <div className="text-xs text-amber-400 mt-0.5">pulado: {skipReason}</div>}
        </div>
        <ChannelBadge ch="email" result={email} />
        <ChannelBadge ch="wpp" result={wpp} />
        <Badge
          variant="outline"
          className={
            row.status === "ok"
              ? "border-emerald-500/40 text-emerald-400"
              : row.status === "skipped"
                ? "border-amber-500/40 text-amber-400"
                : "border-red-500/40 text-red-400"
          }
        >
          {row.status}
        </Badge>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 bg-black/20">
          <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-1 flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</div>
              {email ? (
                <div className="space-y-0.5">
                  <div>Status: <span className={email.ok ? "text-emerald-400" : "text-red-400"}>{email.ok ? "enviado" : "não enviado"}</span></div>
                  {email.to && <div>Para: {Array.isArray(email.to) ? email.to.join(", ") : String(email.to)}</div>}
                  {email.ms != null && <div>Latência: {email.ms}ms</div>}
                  {email.message_id && <div>Message ID: <code className="text-[10px]">{email.message_id}</code></div>}
                  {reasonText(email) && <div className="text-red-400">Motivo: {reasonText(email)}</div>}
                </div>
              ) : <div className="text-muted-foreground">—</div>}
            </div>
            <div>
              <div className="text-muted-foreground mb-1 flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WhatsApp</div>
              {wpp ? (
                <div className="space-y-0.5">
                  <div>Status: <span className={wpp.ok ? "text-emerald-400" : "text-red-400"}>{wpp.ok ? "enviado" : "não enviado"}</span></div>
                  {wpp.phone && <div>Para: {wpp.phone}</div>}
                  {wpp.mode && <div>Modo: {wpp.mode}</div>}
                  {wpp.ms != null && <div>Latência: {wpp.ms}ms</div>}
                  {wpp.provider_message_id && <div>Message ID: <code className="text-[10px]">{wpp.provider_message_id}</code></div>}
                  {reasonText(wpp) && <div className="text-red-400">Motivo: {reasonText(wpp)}</div>}
                </div>
              ) : <div className="text-muted-foreground">—</div>}
            </div>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Payload completo</summary>
            <pre className="mt-2 p-3 bg-black/40 rounded text-[10px] overflow-x-auto">{JSON.stringify(detail, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function HotAlertsLogPage() {
  const fn = useServerFn(listHotLeadAlerts);
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "error" | "skipped">("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["hot-alerts-log", statusFilter],
    queryFn: () => fn({ data: { limit: 200, status: statusFilter } }),
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      sent: rows.filter((r) => r.status === "ok").length,
      errors: rows.filter((r) => r.status === "error").length,
      skipped: rows.filter((r) => r.status === "skipped").length,
    };
  }, [data]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Log de alertas de lead quente</h2>
          <p className="text-xs text-muted-foreground">
            Cada disparo (ou tentativa) de alerta HOT para SDR — canais, latência e motivos de falha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">Enviados</SelectItem>
              <SelectItem value="error">Com erro</SelectItem>
              <SelectItem value="skipped">Pulados</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Enviados", value: stats.sent, color: "text-emerald-400" },
          { label: "Com erro", value: stats.errors, color: "text-red-400" },
          { label: "Pulados", value: stats.skipped, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="border border-white/5 rounded-lg p-3 bg-white/5">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-2xl font-semibold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>
        ) : (data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-white/10 rounded-lg">
            Nenhum alerta registrado ainda.
          </div>
        ) : (
          (data ?? []).map((row) => <AlertRow key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}