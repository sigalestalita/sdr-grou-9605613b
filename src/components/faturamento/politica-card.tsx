import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Pencil, Receipt } from "lucide-react";
import { getPoliticaFaturamento, salvarPoliticaFaturamento } from "@/lib/faturamento.functions";
import {
  formatarCnpj,
  RETENCOES,
  resumoPolitica,
  type Politica,
  type PoliticaEfetiva,
  type PrazoTipo,
} from "@/lib/faturamento/politica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const politicaKey = (ref: { companyId?: string; uid?: string }) => [
  "politica-faturamento",
  ref.companyId ?? null,
  ref.uid ?? null,
];

export function usePoliticaFaturamento(ref: { companyId?: string | null; uid?: string | null }) {
  const fn = useServerFn(getPoliticaFaturamento);
  const companyId = ref.companyId ?? undefined;
  const uid = ref.uid ?? undefined;
  return useQuery({
    queryKey: politicaKey({ companyId, uid }),
    queryFn: () => fn({ data: { companyId, uid } }),
    enabled: !!(companyId || uid),
  });
}

/**
 * Card "Política de faturamento": as regras do cliente que hoje vivem em
 * comentário no WebMais. Aparece na empresa e no negócio — o comercial
 * precisa ver ANTES de negociar. Só o Administrativo (e a gestão) edita.
 */
export function PoliticaFaturamentoCard({
  companyId,
  uid,
  semMoldura,
}: {
  companyId?: string | null;
  uid?: string | null;
  /** Sem o surface-panel (quando já está dentro de um painel). */
  semMoldura?: boolean;
}) {
  const { data, isLoading } = usePoliticaFaturamento({ companyId, uid });
  const [editando, setEditando] = useState(false);

  const corpo = (() => {
    if (isLoading) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
    if (!data?.encontrada)
      return (
        <p className="text-[12px] text-muted-foreground">
          Empresa ainda não está no cadastro unificado.
        </p>
      );
    const p = data.efetiva;
    const frases = resumoPolitica(p);
    return (
      <div className="space-y-2 text-[12px]">
        <dl className="space-y-1">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Código WebMais</dt>
            <dd className={p.codigo_webmais ? "font-medium" : "text-muted-foreground"}>
              {p.codigo_webmais ?? "sem cadastro"}
            </dd>
          </div>
          {data.empresa?.cnpj && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">CNPJ</dt>
              <dd>{formatarCnpj(data.empresa.cnpj)}</dd>
            </div>
          )}
        </dl>
        {frases.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {frases.map((f) => (
              <li
                key={f}
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
              >
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1 text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Nenhuma regra registrada pelo ADM.
          </p>
        )}
        {p.observacoes && (
          <p className="whitespace-pre-wrap rounded border px-2 py-1.5 text-muted-foreground">
            {p.observacoes}
          </p>
        )}
        {p.herdados.length > 0 && data.matriz && (
          <p className="text-[11px] text-muted-foreground">
            Parte das regras vem da matriz ({data.matriz.nome}).
          </p>
        )}
        {p.ficha_url && (
          <a
            href={p.ficha_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Ficha cadastral <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  })();

  const titulo = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="section-label flex items-center gap-1">
        <Receipt className="h-3.5 w-3.5" /> Política de faturamento
      </h2>
      {data?.encontrada && data.podeEditar && (
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditando(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      {semMoldura ? (
        <div>
          {titulo}
          {corpo}
        </div>
      ) : (
        <section className="surface-panel p-4">
          {titulo}
          {corpo}
        </section>
      )}
      {editando && data?.encontrada && (
        <PoliticaDialog
          companyId={data.companyId}
          empresaNome={data.empresa?.nome ?? ""}
          propria={data.propria}
          efetiva={data.efetiva}
          matrizNome={data.matriz?.nome ?? null}
          onClose={() => setEditando(false)}
        />
      )}
    </>
  );
}

const PRAZOS: Array<{ v: PrazoTipo | ""; l: string }> = [
  { v: "", l: "Não definido" },
  { v: "dias_apos_emissao", l: "Dias após a emissão" },
  { v: "dia_fixo", l: "Dia fixo do mês" },
  { v: "a_vista", l: "À vista" },
];

type TriEstado = "" | "sim" | "nao";
const tri = (b: boolean | null): TriEstado => (b === null ? "" : b ? "sim" : "nao");
const deTri = (t: TriEstado): boolean | null => (t === "" ? null : t === "sim");
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function PoliticaDialog({
  companyId,
  empresaNome,
  propria,
  efetiva,
  matrizNome,
  onClose,
}: {
  companyId: string;
  empresaNome: string;
  propria: Politica | null;
  efetiva: PoliticaEfetiva;
  matrizNome: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarPoliticaFaturamento);
  const p = propria;
  const herda = (campo: keyof Politica) =>
    matrizNome && efetiva.herdados.includes(campo) ? `Matriz: ${String(efetiva[campo])}` : "";

  const [f, setF] = useState({
    codigo_webmais: p?.codigo_webmais ?? "",
    exige_oc: tri(p?.exige_oc ?? null),
    janela_emissao_inicio: p?.janela_emissao_inicio?.toString() ?? "",
    janela_emissao_fim: p?.janela_emissao_fim?.toString() ?? "",
    prazo_tipo: (p?.prazo_tipo ?? "") as PrazoTipo | "",
    prazo_valor: p?.prazo_valor?.toString() ?? "",
    aceita_parcelamento: tri(p?.aceita_parcelamento ?? null),
    forma_pagamento: p?.forma_pagamento ?? "",
    retencoes: Object.fromEntries(
      RETENCOES.map((r) => [r.campo, p?.[r.campo]?.toString() ?? ""]),
    ) as Record<(typeof RETENCOES)[number]["campo"], string>,
    regime_tributario: p?.regime_tributario ?? "",
    inscricao_estadual: p?.inscricao_estadual ?? "",
    inscricao_municipal: p?.inscricao_municipal ?? "",
    emails_nf: (p?.emails_nf ?? []).join(", "),
    ficha_url: p?.ficha_url ?? "",
    observacoes: p?.observacoes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          companyId,
          codigo_webmais: f.codigo_webmais.trim() || null,
          exige_oc: deTri(f.exige_oc),
          janela_emissao_inicio: num(f.janela_emissao_inicio),
          janela_emissao_fim: num(f.janela_emissao_fim),
          prazo_tipo: f.prazo_tipo || null,
          prazo_valor: f.prazo_tipo === "a_vista" ? null : num(f.prazo_valor),
          aceita_parcelamento: deTri(f.aceita_parcelamento),
          forma_pagamento: f.forma_pagamento.trim() || null,
          ...(Object.fromEntries(
            RETENCOES.map((r) => [r.campo, num(f.retencoes[r.campo])]),
          ) as Record<(typeof RETENCOES)[number]["campo"], number | null>),
          regime_tributario: f.regime_tributario.trim() || null,
          inscricao_estadual: f.inscricao_estadual.trim() || null,
          inscricao_municipal: f.inscricao_municipal.trim() || null,
          emails_nf: f.emails_nf
            .split(/[,;\s]+/)
            .map((e) => e.trim())
            .filter(Boolean),
          ficha_url: f.ficha_url.trim() || null,
          observacoes: f.observacoes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Política salva");
      qc.invalidateQueries({ queryKey: ["politica-faturamento"] });
      qc.invalidateQueries({ queryKey: ["faturamento"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Política de faturamento · {empresaNome}</DialogTitle>
          <DialogDescription>
            O comercial vê estas regras no negócio antes de negociar, e o ganho que fere uma delas
            não passa.
            {matrizNome
              ? ` Campo vazio: vale o da matriz (${matrizNome}).`
              : " Campo vazio = não definido."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Código WebMais</Label>
              <Input
                value={f.codigo_webmais}
                onChange={(e) => set("codigo_webmais", e.target.value)}
                placeholder="ex.: 004512"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Exige ordem de compra</Label>
              <select
                className={selectCls}
                value={f.exige_oc}
                onChange={(e) => set("exige_oc", e.target.value as TriEstado)}
              >
                <option value="">{herda("exige_oc") || "Não definido"}</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Parcelamento</Label>
              <select
                className={selectCls}
                value={f.aceita_parcelamento}
                onChange={(e) => set("aceita_parcelamento", e.target.value as TriEstado)}
              >
                <option value="">{herda("aceita_parcelamento") || "Não definido"}</option>
                <option value="sim">Pode parcelar</option>
                <option value="nao">Só à vista</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Janela de emissão da nota (dias)</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={f.janela_emissao_inicio}
                  onChange={(e) => set("janela_emissao_inicio", e.target.value)}
                  placeholder="1"
                />
                <span className="text-[12px] text-muted-foreground">a</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={f.janela_emissao_fim}
                  onChange={(e) => set("janela_emissao_fim", e.target.value)}
                  placeholder="20"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Prazo de pagamento</Label>
              <select
                className={selectCls}
                value={f.prazo_tipo}
                onChange={(e) => set("prazo_tipo", e.target.value as PrazoTipo | "")}
              >
                {PRAZOS.map((x) => (
                  <option key={x.v} value={x.v}>
                    {x.v === "" ? herda("prazo_tipo") || x.l : x.l}
                  </option>
                ))}
              </select>
            </div>
            {f.prazo_tipo && f.prazo_tipo !== "a_vista" && (
              <div className="space-y-1">
                <Label className="text-[11px]">
                  {f.prazo_tipo === "dia_fixo" ? "Dia do mês" : "Dias após a emissão"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={f.prazo_tipo === "dia_fixo" ? 31 : 365}
                  value={f.prazo_valor}
                  onChange={(e) => set("prazo_valor", e.target.value)}
                  placeholder={f.prazo_tipo === "dia_fixo" ? "30" : "15"}
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Retenção de impostos na fonte (% sobre o bruto)</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {RETENCOES.map((r) => (
                <div key={r.campo} className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground">{r.rotulo}</span>
                  <Input
                    inputMode="decimal"
                    value={f.retencoes[r.campo]}
                    onChange={(e) =>
                      set("retencoes", { ...f.retencoes, [r.campo]: e.target.value })
                    }
                    placeholder={herda(r.campo) ? String(efetiva[r.campo]) : "0"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Forma de pagamento</Label>
              <Input
                value={f.forma_pagamento}
                onChange={(e) => set("forma_pagamento", e.target.value)}
                placeholder="Boleto, PIX, transferência…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">E-mails para NF / boleto</Label>
              <Input
                value={f.emails_nf}
                onChange={(e) => set("emails_nf", e.target.value)}
                placeholder="nf@cliente.com.br, financeiro@cliente.com.br"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Regime tributário</Label>
              <Input
                value={f.regime_tributario}
                onChange={(e) => set("regime_tributario", e.target.value)}
                placeholder="Lucro real"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Inscrição estadual</Label>
              <Input
                value={f.inscricao_estadual}
                onChange={(e) => set("inscricao_estadual", e.target.value)}
                placeholder="ISENTO"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Inscrição municipal</Label>
              <Input
                value={f.inscricao_municipal}
                onChange={(e) => set("inscricao_municipal", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Link da ficha cadastral</Label>
            <Input
              value={f.ficha_url}
              onChange={(e) => set("ficha_url", e.target.value)}
              placeholder="https://fichacadastral.grougp.com.br/…"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Outras regras do cliente</Label>
            <Textarea
              rows={3}
              value={f.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder="Faturar como licença; OS aprovada antes da nota; enviar nota ao portal do fornecedor…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : "Salvar política"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
