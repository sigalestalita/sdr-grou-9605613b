import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listCsEmails } from "@/lib/cs-integrations.functions";
import { Mail, Search } from "lucide-react";

export const Route = createFileRoute("/_app/cs-emails")({
  component: CsEmailsPage,
  head: () => ({
    meta: [
      { title: "E-mails CS | Grou Compass" },
      {
        name: "description",
        content:
          "Acompanhe os e-mails redirecionados do atendimento de Customer Success, vinculados ao cliente e ao responsável.",
      },
      { property: "og:title", content: "E-mails CS | Grou Compass" },
      {
        property: "og:description",
        content: "Caixa compartilhada do time de CS com vínculo automático a cliente e responsável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CsEmailsPage() {
  const listFn = useServerFn(listCsEmails);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cs-emails", q, owner],
    queryFn: () => listFn({ data: { q: q || undefined, userId: owner || undefined } }),
  });

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro ao carregar e-mails"}
      </div>
    );
  }

  const nameOf = (id: string | null) =>
    id ? (data?.users ?? []).find((u) => u.userId === id)?.name ?? "—" : "Sem responsável";

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Mail className="h-5 w-5" /> E-mails do atendimento
        </h1>
        <p className="text-sm text-muted-foreground">
          Mensagens redirecionadas das caixas do time, vinculadas automaticamente ao cliente e ao
          responsável.{" "}
          <Link to="/cs-integracoes" className="text-primary underline">
            Configurar redirecionamento
          </Link>
        </p>
      </div>

      <Card className="grid gap-2 p-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar assunto, remetente ou trecho"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {data?.isManager && (
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todo o time</option>
            {(data?.users ?? []).map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando e-mails…</p>
      ) : (data?.emails ?? []).length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum e-mail recebido ainda. Configure o redirecionamento das caixas do time em
          Integrações CS.
        </Card>
      ) : (
        <div className="space-y-2">
          {(data?.emails ?? []).map((e) => (
            <Card
              key={e.id}
              className="cursor-pointer space-y-1 p-3 transition-colors hover:border-primary/40"
              onClick={() => setOpen(open === e.id ? null : e.id)}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {e.from_name || e.from_email || "Remetente desconhecido"}
                </span>
                <span>{new Date(e.received_at).toLocaleString("pt-BR")}</span>
                {e.client_uid && <Badge variant="outline">{e.client_uid}</Badge>}
                <Badge variant="secondary">{nameOf(e.owner_user_id)}</Badge>
              </div>
              <p className="text-sm font-semibold">{e.subject ?? "(sem assunto)"}</p>
              <p className="text-xs text-muted-foreground">{e.snippet}</p>
              {open === e.id && e.body_text && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                  {e.body_text}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
