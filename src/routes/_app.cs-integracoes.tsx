import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  connectCsCalendly,
  disconnectCsCalendly,
  listCsIntegrations,
  rotateCsInboundToken,
  saveCsMailbox,
  syncCsCalendly,
} from "@/lib/cs-integrations.functions";
import { getRdCsSyncLogs, syncRdCsClients } from "@/lib/cs-rd.functions";
import { Building2, CalendarClock, Copy, Link2, Mail, RefreshCw, Unlink } from "lucide-react";

export const Route = createFileRoute("/_app/cs-integracoes")({
  component: CsIntegrationsPage,
  head: () => ({
    meta: [
      { title: "Integrações CS | Grou Compass" },
      {
        name: "description",
        content:
          "Vincule a agenda do Calendly e a caixa de e-mail de cada pessoa do time de Customer Success.",
      },
      { property: "og:title", content: "Integrações CS | Grou Compass" },
      {
        property: "og:description",
        content: "Conexão de agenda Calendly e caixa de e-mail do time de Customer Success.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CsIntegrationsPage() {
  const listFn = useServerFn(listCsIntegrations);
  const connectFn = useServerFn(connectCsCalendly);
  const disconnectFn = useServerFn(disconnectCsCalendly);
  const mailboxFn = useServerFn(saveCsMailbox);
  const syncFn = useServerFn(syncCsCalendly);
  const rotateFn = useServerFn(rotateCsInboundToken);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["cs-integrations"],
    queryFn: () => listFn(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cs-integrations"] });

  const [token, setToken] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [mailbox, setMailbox] = useState("");

  const connect = useMutation({
    mutationFn: () => connectFn({ data: { token, ...(targetUser ? { userId: targetUser } : {}) } }),
    onSuccess: (r) => {
      toast.success(`Calendly conectado (${r.name ?? r.email}) — ${r.events} evento(s)`);
      setToken("");
      setTargetUser("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const disconnect = useMutation({
    mutationFn: (userId?: string) => disconnectFn({ data: userId ? { userId } : {} }),
    onSuccess: () => {
      toast.success("Calendly desconectado");
      invalidate();
    },
  });

  const saveMailbox = useMutation({
    mutationFn: () => mailboxFn({ data: { mailbox } }),
    onSuccess: () => {
      toast.success("Caixa de e-mail vinculada");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const sync = useMutation({
    mutationFn: (all: boolean) => syncFn({ data: { all } }),
    onSuccess: (r) => {
      toast.success(`${r.events} evento(s) sincronizado(s) de ${r.users} agenda(s)`);
      if (r.failures.length) toast.error(r.failures[0]);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const rotate = useMutation({
    mutationFn: () => rotateFn({}),
    onSuccess: () => {
      toast.success("Novo endereço de recebimento gerado");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const rdSyncFn = useServerFn(syncRdCsClients);
  const rdLogsFn = useServerFn(getRdCsSyncLogs);
  const rdLogs = useQuery({
    queryKey: ["cs-rd-sync-logs"],
    queryFn: () => rdLogsFn(),
    enabled: Boolean(data?.isManager),
  });
  const rdSync = useMutation({
    mutationFn: (dryRun: boolean) => rdSyncFn({ data: { dryRun } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.matched} cliente(s) no RD · ${r.created} criado(s) · ${r.updated} atualizado(s)`,
      );
      if (r.errors.length) toast.error(r.errors[0]);
      rdLogs.refetch();
      qc.invalidateQueries({ queryKey: ["cs-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro ao carregar integrações"}
        </p>
      </div>
    );
  }

  const mine = data?.mine;
  const inboundUrl =
    typeof window !== "undefined" && data?.inboundToken
      ? `${window.location.origin}/api/public/cs/email-inbound?token=${data.inboundToken}`
      : "";

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Integrações do Customer Success
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada pessoa vincula a própria agenda do Calendly e a caixa de e-mail do atendimento. O
          gestor enxerga a agenda e os e-mails de todo o time.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Minha agenda (Calendly)</h2>
            {mine?.calendlyConnected && <Badge variant="secondary">Conectado</Badge>}
          </div>
          {mine?.calendlyConnected && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {mine.calendlyName} · {mine.calendlyEmail}
              </p>
              <p className="text-xs text-muted-foreground">
                Última sincronização:{" "}
                {mine.calendlyLastSyncAt
                  ? new Date(mine.calendlyLastSyncAt).toLocaleString("pt-BR")
                  : "nunca"}
              </p>
              {mine.calendlyLastError && (
                <p className="text-xs text-destructive">{mine.calendlyLastError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sync.isPending}
                  onClick={() => sync.mutate(false)}
                >
                  <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
                  Sincronizar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(undefined)}>
                  <Unlink className="mr-1 h-4 w-4" /> Desconectar
                </Button>
              </div>
            </div>
          )}
          {(!mine?.calendlyConnected || data?.isManager) && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Gere um token pessoal em calendly.com → Integrations → API &amp; Webhooks → Personal
                access token e cole abaixo.
              </p>
              <Input
                placeholder="eyJraWQiOi..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {data?.isManager && (
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Vincular em nome de
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    value={targetUser}
                    onChange={(e) => setTargetUser(e.target.value)}
                  >
                    <option value="">Eu mesmo</option>
                    {(data?.teamUsers ?? [])
                      .filter((u) => u.userId !== mine?.userId)
                      .map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <Button
                size="sm"
                disabled={token.trim().length < 10 || connect.isPending}
                onClick={() => connect.mutate()}
              >
                {connect.isPending ? "Conectando…" : "Conectar Calendly"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Minha caixa de e-mail</h2>
            {mine?.mailbox && <Badge variant="secondary">Vinculada</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Informe o endereço usado no atendimento. Os e-mails redirecionados para o endereço de
            recebimento abaixo são atribuídos automaticamente a você e ao cliente correspondente.
          </p>
          <Input
            placeholder={mine?.mailbox ?? "nome.sobrenome@grougp.com.br"}
            value={mailbox}
            onChange={(e) => setMailbox(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!mailbox.trim() || saveMailbox.isPending}
            onClick={() => saveMailbox.mutate()}
          >
            Salvar caixa
          </Button>
        </Card>
      </div>

      {data?.isManager && (
        <>
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Endereço de recebimento (redirecionamento)</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => rotate.mutate()}>
                  Gerar novo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sync.isPending}
                  onClick={() => sync.mutate(true)}
                >
                  <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
                  Sincronizar todas as agendas
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure no Gmail/Outlook (ou no Zapier/Make) o encaminhamento das caixas do time
              para este endpoint. Cada mensagem encaminhada entra em “E-mails CS”.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">
                {inboundUrl || "—"}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(inboundUrl);
                  toast.success("Endereço copiado");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Hooks de automação (agendadores externos)</h2>
            <p className="text-xs text-muted-foreground">
              Todos exigem o mesmo token do endereço de recebimento. O sync incremental do RD já
              roda a cada 15 minutos pelo agendador do banco; os demais podem ser chamados por
              Zapier, Make ou cron externo com POST nestas URLs. Gerar um novo token invalida as
              URLs antigas — atualize o agendador depois.
            </p>
            <div className="divide-y rounded-md border text-[11px]">
              {(
                [
                  ["sync-rd", "Sync incremental do RD (agendado a cada 15 min)"],
                  ["sync-rd-all", "Espelho completo do RD (empresas, contatos, negócios)"],
                  ["transform-rd", "Onda 2: projeta o espelho em Empresas, Contatos e Negócios"],
                  ["sync-rd-cs-clients", "Clientes do RD para o CS"],
                  ["run-fups", "Disparo de FUPs e automações de WhatsApp"],
                  ["send-weekly-digest", "Resumo semanal por e-mail"],
                ] as const
              ).map(([slug, label]) => {
                const url =
                  typeof window !== "undefined" && data?.inboundToken
                    ? `${window.location.origin}/api/public/hooks/${slug}?token=${data.inboundToken}`
                    : "";
                return (
                  <div key={slug} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-56 shrink-0 text-muted-foreground">{label}</span>
                    <code className="min-w-0 flex-1 truncate">{url || "—"}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        toast.success("URL copiada");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Clientes do RD CRM</h2>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rdSync.isPending}
                  onClick={() => rdSync.mutate(true)}
                >
                  Prévia
                </Button>
                <Button size="sm" disabled={rdSync.isPending} onClick={() => rdSync.mutate(false)}>
                  <RefreshCw className={`mr-1 h-4 w-4 ${rdSync.isPending ? "animate-spin" : ""}`} />
                  {rdSync.isPending ? "Importando…" : "Importar / atualizar"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Traz as empresas do RD CRM com ciclo de vida <strong>Cliente</strong>,{" "}
              <strong>Cliente Inativo</strong> e <strong>Cliente de Partner</strong>. Cria os cards
              que faltam e atualiza os que já existem (nome, CNPJ, site, setor, responsável e
              situação), sem apagar sinaleira, health score nem histórico.
            </p>
            {(rdLogs.data?.logs ?? []).length > 0 && (
              <div className="divide-y rounded-md border text-xs">
                {(rdLogs.data?.logs ?? []).map((l) => {
                  const d = (l.detail ?? {}) as Record<string, number | string[]>;
                  return (
                    <div key={l.id} className="flex flex-wrap gap-3 px-3 py-2">
                      <span className="text-muted-foreground">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </span>
                      <Badge variant={l.status === "ok" ? "secondary" : "outline"}>
                        {l.status}
                      </Badge>
                      <span>
                        {Number(d.matched ?? 0)} clientes · {Number(d.created ?? 0)} criados ·{" "}
                        {Number(d.updated ?? 0)} atualizados
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Status do time</h2>
            </div>
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <div className="divide-y">
                {(data?.users ?? []).map((u) => (
                  <div
                    key={u.userId}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-40 flex-1 truncate">{u.name}</span>
                    <Badge variant={u.calendlyConnected ? "secondary" : "outline"}>
                      {u.calendlyConnected ? "Calendly OK" : "Sem agenda"}
                    </Badge>
                    <Badge variant={u.mailbox ? "secondary" : "outline"}>
                      {u.mailbox ?? "Sem e-mail"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {u.calendlyLastSyncAt
                        ? new Date(u.calendlyLastSyncAt).toLocaleString("pt-BR")
                        : "—"}
                    </span>
                    {u.calendlyConnected && (
                      <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(u.userId)}>
                        <Unlink className="mr-1 h-4 w-4" /> Desvincular
                      </Button>
                    )}
                  </div>
                ))}
                {(data?.users ?? []).length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Ninguém vinculou agenda ou e-mail ainda.
                  </p>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
