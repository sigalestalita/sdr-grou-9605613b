import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCsMasterclassParticipation,
  getCsMasterclass,
  saveCsMasterclassParticipation,
  type CsMasterclassParticipation,
} from "@/lib/cs-masterclass.functions";
import { CS_TAG_USO_LABEL } from "@/lib/cs-types";
import { AlertTriangle, Award, GraduationCap, Lightbulb, Plus, Trash2 } from "lucide-react";

const fmt = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

/**
 * Masterclasses da empresa: o que oferecer agora (regra de cor/tempo),
 * participações com comprovação de uso em projeto real e os marcos de
 */
export function CsMasterclassPanel({ clientUid }: { clientUid: string }) {
  const getFn = useServerFn(getCsMasterclass);
  const saveFn = useServerFn(saveCsMasterclassParticipation);
  const delFn = useServerFn(deleteCsMasterclassParticipation);
  const qc = useQueryClient();
  const key = ["cs-masterclass", clientUid];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { clientUid } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
  };
  const [form, setForm] = useState<null | {
    id?: string;
    moduleId: number;
    heldAt: string;
    participantes: string;
    usedInProject: boolean;
    usedAt: string;
    usedNote: string;
  }>(null);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: form!.id,
          clientUid,
          moduleId: form!.moduleId,
          heldAt: form!.heldAt,
          participantes: form!.participantes || null,
          usedInProject: form!.usedInProject,
          usedAt: form!.usedAt || null,
          usedNote: form!.usedNote || null,
        },
      }),
    onSuccess: () => {
      toast.success("Masterclass registrada");
      setForm(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, clientUid } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const modName = (id: number) => q.data?.modules.find((m) => m.id === id)?.nome ?? `Módulo ${id}`;
  const openNew = (moduleId?: number) =>
    setForm({
      moduleId: moduleId ?? q.data?.modules[0]?.id ?? 1,
      heldAt: new Date().toISOString().slice(0, 10),
      participantes: "",
      usedInProject: false,
      usedAt: "",
      usedNote: "",
    });
  const openEdit = (p: CsMasterclassParticipation) =>
    setForm({
      id: p.id,
      moduleId: p.moduleId,
      heldAt: p.heldAt.slice(0, 10),
      participantes: p.participantes ?? "",
      usedInProject: p.usedInProject,
      usedAt: p.usedAt?.slice(0, 10) ?? "",
      usedNote: p.usedNote ?? "",
    });

  if (q.isLoading) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
  const d = q.data!;

  return (
    <div className="space-y-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => openNew()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Registrar
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Uso do PDA (tag_uso):{" "}
        {d.tagUso ? (
          <span className="font-medium text-foreground">
            {CS_TAG_USO_LABEL[d.tagUso] ?? d.tagUso}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3 w-3" /> não definido — edite em “Sobre esta empresa”; sem
            isso as regras “módulo da tag_uso” não disparam
          </span>
        )}
      </p>

      {d.suggestions.length > 0 ? (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="flex items-center gap-1 font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-primary" /> Oferecer agora
          </p>
          {d.suggestions.map((s) => (
            <div key={s.moduleId} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">
                  <span className="font-medium">Módulo {s.moduleId}</span> · {s.moduleName}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.motivo}</p>
              </div>
              <button
                type="button"
                onClick={() => openNew(s.moduleId)}
                className="shrink-0 text-[11px] text-primary hover:underline"
              >
                registrar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma masterclass indicada pela regra de cor/tempo agora
          {d.diagCause
            ? ""
            : " — no vermelho, informe a causa do diagnóstico em “Sobre esta empresa”"}
          .
        </p>
      )}

      {form && (
        <div className="space-y-2 rounded-md border p-2">
          <select
            value={form.moduleId}
            onChange={(e) => setForm({ ...form, moduleId: Number(e.target.value) })}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          >
            {d.modules.map((m) => (
              <option key={m.id} value={m.id}>
                Módulo {m.id} — {m.nome}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.heldAt}
              onChange={(e) => setForm({ ...form, heldAt: e.target.value })}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Participantes"
              value={form.participantes}
              onChange={(e) => setForm({ ...form, participantes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.usedInProject}
              onChange={(e) => setForm({ ...form, usedInProject: e.target.checked })}
            />
            Cliente usou em projeto real (comprovação)
          </label>
          {form.usedInProject && (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Input
                type="date"
                className="h-8 text-xs"
                value={form.usedAt}
                onChange={(e) => setForm({ ...form, usedAt: e.target.value })}
              />
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Como usou? (ex.: processo seletivo de X vagas)"
                value={form.usedNote}
                onChange={(e) => setForm({ ...form, usedNote: e.target.value })}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Salvar
            </Button>
          </div>
        </div>
      )}

      {d.participations.length > 0 && (
        <ul className="divide-y">
          {d.participations.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 py-1.5">
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="min-w-0 text-left hover:underline"
              >
                <p className="truncate">
                  <GraduationCap className="mr-1 inline h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">Módulo {p.moduleId}</span> · {modName(p.moduleId)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {fmt(p.heldAt)}
                  {p.participantes ? ` · ${p.participantes}` : ""}
                  {p.usedInProject
                    ? ` · usado em projeto ${fmt(p.usedAt)}`
                    : " · sem uso comprovado"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => del.mutate(p.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
