import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCsPlaybookBlock,
  listCsPlaybook,
  saveCsPlaybookBlock,
  type CsPlaybookBlock,
} from "@/lib/cs-cadence.functions";
import { useCurrentRole } from "@/lib/use-role";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

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
        content:
          "Guia completo de cadência, ofertas e conteúdos de contato do time de Customer Success.",
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

type BlockDraft = Omit<CsPlaybookBlock, "id"> & { id?: string };

/** Formulário do gestor: criar/editar bloco (markdown; tabelas com | col | col |). */
function BlockEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: BlockDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveCsPlaybookBlock);
  const [d, setD] = useState<BlockDraft>(initial);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: d.id,
          tipo: d.tipo as "gatilho_descricao" | "playbook" | "oferta" | "conteudo_contato",
          titulo: d.titulo,
          corpo: d.corpo,
          cor: d.cor as "geral" | "verde" | "amarelo" | "vermelho",
          ordem: d.ordem,
          ativo: d.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Bloco salvo");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Card className="space-y-2 border-primary/40 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_5rem]">
        <Input
          value={d.titulo}
          onChange={(e) => setD({ ...d, titulo: e.target.value })}
          placeholder="Título"
        />
        <select
          value={d.tipo}
          onChange={(e) => setD({ ...d, tipo: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {Object.entries(TIPO_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={d.cor}
          onChange={(e) => setD({ ...d, cor: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {Object.entries(COR_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input
          type="number"
          value={d.ordem}
          onChange={(e) => setD({ ...d, ordem: Number(e.target.value) })}
          title="Ordem"
        />
      </div>
      <Textarea
        rows={14}
        className="font-mono text-xs"
        value={d.corpo}
        onChange={(e) => setD({ ...d, corpo: e.target.value })}
        placeholder="Corpo em markdown"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.ativo}
            onChange={(e) => setD({ ...d, ativo: e.target.checked })}
          />{" "}
          Ativo (visível para o time)
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={d.titulo.trim().length < 2 || d.corpo.trim().length < 2 || save.isPending}
            onClick={() => save.mutate()}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BlockCard({
  block,
  canEdit,
  onEdit,
  onDelete,
}: {
  block: CsPlaybookBlock;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
            <Badge
              variant="outline"
              className={`text-[10px] ${COR_TONE[block.cor] ?? COR_TONE.geral}`}
            >
              {COR_LABEL[block.cor] ?? block.cor}
            </Badge>
            {!block.ativo && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Inativo
              </Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={onEdit}
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="Apagar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-4">
          <Markdown body={block.corpo} />
        </div>
      ) : null}
    </Card>
  );
}

function CsPlaybookPage() {
  const fetchPlaybook = useServerFn(listCsPlaybook);
  const deleteFn = useServerFn(deleteCsPlaybookBlock);
  const role = useCurrentRole();
  const canEdit = !role.loading && role.canAccessAll;
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<string>("");
  const [cor, setCor] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<BlockDraft | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cs-playbook"],
    queryFn: () => fetchPlaybook(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cs-playbook"] });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const blocks = useMemo(() => {
    const all = (data ?? []).filter((b) => b.ativo || (canEdit && showInactive));
    const q = search.trim().toLowerCase();
    return all.filter((b) => {
      if (tipo && b.tipo !== tipo) return false;
      if (cor && b.cor !== cor) return false;
      if (q && !b.titulo.toLowerCase().includes(q) && !b.corpo.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [data, tipo, cor, search, canEdit, showInactive]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Playbook CS</h1>
          <p className="text-sm text-muted-foreground">
            Sinaleira GROU v2 — lógica de cadência, condução por cor, ofertas e modelos de contato.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              incluir inativos
            </label>
            <Button
              size="sm"
              onClick={() =>
                setEditing({
                  tipo: "playbook",
                  titulo: "",
                  corpo: "",
                  cor: "geral",
                  ordem: ((data ?? []).reduce((m, b) => Math.max(m, b.ordem), 0) || 0) + 10,
                  ativo: true,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Novo bloco
            </Button>
          </div>
        )}
      </header>

      {editing && !editing.id && (
        <BlockEditor initial={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder="Buscar no playbook..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhum bloco encontrado com esses filtros.
        </Card>
      ) : (
        <div className="space-y-3">
          {blocks.map((b) =>
            editing?.id === b.id ? (
              <BlockEditor
                key={b.id}
                initial={editing}
                onClose={() => setEditing(null)}
                onSaved={refresh}
              />
            ) : (
              <BlockCard
                key={b.id}
                block={b}
                canEdit={canEdit}
                onEdit={() => setEditing({ ...b })}
                onDelete={() => {
                  if (window.confirm(`Apagar o bloco "${b.titulo}"?`)) del.mutate(b.id);
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
