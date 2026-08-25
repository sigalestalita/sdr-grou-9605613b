import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCsPlaybook, type CsPlaybookBlock } from "@/lib/cs-cadence.functions";
import { BookOpen, ChevronDown, ChevronRight, Megaphone, Sparkles, Target } from "lucide-react";

export const Route = createFileRoute("/_app/cs-playbook")({
  component: CsPlaybookPage,
  head: () => ({
    meta: [
      { title: "Playbook CS | Grou Compass" },
      {
        name: "description",
        content:
          "Playbook CS Sinaleira GROU v2: lógica de cadência, condução por cor, Masterclasses, funcionalidades e modelos de contato.",
      },
      { property: "og:title", content: "Playbook CS | Grou Compass" },
      {
        property: "og:description",
        content: "Guia completo de cadência, ofertas e conteúdos de contato do time de Customer Success.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TIPO_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  gatilho_descricao: { label: "Gatilhos e cadência", icon: Target },
  playbook: { label: "Playbooks de condução", icon: BookOpen },
  oferta: { label: "Ofertas e conteúdos", icon: Sparkles },
  conteudo_contato: { label: "Modelos de contato", icon: Megaphone },
};

const COR_TONE: Record<string, string> = {
  geral: "border-border bg-muted text-muted-foreground",
  verde: "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
  amarelo: "border-amber-500/50 bg-amber-500/10 text-amber-500",
  vermelho: "border-red-500/50 bg-red-500/10 text-red-500",
};

const COR_LABEL: Record<string, string> = {
  geral: "Geral",
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
};

/** Render leve de markdown (títulos, listas, tabelas, citações e blocos de código). */
function Markdown({ body }: { body: string }) {
  const lines = body.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    if (line.startsWith("|")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) buf.push(lines[i++]);
      const rows = buf.filter((r) => !/^\|[\s|:-]+\|$/.test(r.trim()));
      const cells = rows.map((r) =>
        r
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      );
      const [head, ...rest] = cells;
      out.push(
        <div key={key++} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                {(head ?? []).map((h, hi) => (
                  <th key={hi} className="px-2 py-1.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((r, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1.5 align-top text-muted-foreground">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      out.push(
        <h4 key={key++} className="mt-3 text-sm font-semibold">
          <Inline text={line.slice(4)} />
        </h4>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        <h3 key={key++} className="mt-4 text-sm font-bold uppercase tracking-wide text-primary">
          <Inline text={line.slice(3)} />
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      out.push(
        <blockquote
          key={key++}
          className="rounded-r-lg border-l-2 border-primary/60 bg-muted/40 px-3 py-2 text-xs italic leading-relaxed"
        >
          {buf.map((b, bi) => (
            <p key={bi} className={bi > 0 ? "mt-2" : undefined}>
              <Inline text={b} />
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }
    if (/^(\d+\.\s|-\s)/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const buf: string[] = [];
      while (i < lines.length && /^(\d+\.\s|-\s)/.test(lines[i])) {
        buf.push(lines[i].replace(/^(\d+\.\s|-\s)/, ""));
        i++;
      }
      const items = buf.map((b, bi) => (
        <li key={bi}>
          <Inline text={b} />
        </li>
      ));
      out.push(
        ordered ? (
          <ol key={key++} className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
            {items}
          </ol>
        ) : (
          <ul key={key++} className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
            {items}
          </ul>
        ),
      );
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    out.push(
      <p key={key++} className="text-xs leading-relaxed text-muted-foreground">
        <Inline text={line} />
      </p>,
    );
    i++;
  }

  return <div className="space-y-2">{out}</div>;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function BlockCard({ block }: { block: CsPlaybookBlock }) {
  const [open, setOpen] = useState(false);
  const meta = TIPO_META[block.tipo] ?? TIPO_META.playbook;
  const Icon = meta.icon;
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{block.titulo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {meta.label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${COR_TONE[block.cor] ?? COR_TONE.geral}`}>
              {COR_LABEL[block.cor] ?? block.cor}
            </Badge>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? <div className="border-t border-border px-4 py-4">
        <Markdown body={block.corpo} />
      </div> : null}
    </Card>
  );
}

function CsPlaybookPage() {
  const fetchPlaybook = useServerFn(listCsPlaybook);
  const [tipo, setTipo] = useState<string>("");
  const [cor, setCor] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["cs-playbook"],
    queryFn: () => fetchPlaybook(),
  });

  const blocks = useMemo(() => {
    const all = (data ?? []).filter((b) => b.ativo);
    const q = search.trim().toLowerCase();
    return all.filter((b) => {
      if (tipo && b.tipo !== tipo) return false;
      if (cor && b.cor !== cor) return false;
      if (q && !b.titulo.toLowerCase().includes(q) && !b.corpo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, tipo, cor, search]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Playbook CS</h1>
        <p className="text-sm text-muted-foreground">
          Sinaleira GROU v2 — lógica de cadência, condução por cor, ofertas e modelos de contato.
        </p>
      </header>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder="Buscar no playbook..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
          >
            <option value="">Todas as cores</option>
            {Object.entries(COR_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["vermelho", "amarelo", "verde"] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant={cor === c ? "default" : "outline"}
              onClick={() => setCor((v) => (v === c ? "" : c))}
            >
              Cadência {COR_LABEL[c]}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando playbook...</Card>
      ) : blocks.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum bloco encontrado com esses filtros.</Card>
      ) : (
        <div className="space-y-3">
          {blocks.map((b) => (
            <BlockCard key={b.id} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}
