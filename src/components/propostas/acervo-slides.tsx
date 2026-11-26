import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Eye, EyeOff, Presentation, Upload } from "lucide-react";
import {
  atualizarSlideDoAcervo,
  importarAcervo,
  listarAcervo,
} from "@/lib/propostas-acervo.functions";
import {
  agruparPorSecao,
  MAX_SLIDES_NA_PROPOSTA,
  montarApresentacao,
  secoesDasPaginas,
  sugerirProgramas,
  type SlideDoAcervo,
} from "@/lib/propostas/acervo";
import { MAPA_DA_APRESENTACAO, SECOES_DA_APRESENTACAO } from "@/lib/propostas/apresentacao-grou";
import type { Apresentacao } from "@/lib/propostas/render";
import { Button } from "@/components/ui/button";

type SlideComMiniatura = SlideDoAcervo & { miniatura: string | null };

function useAcervo() {
  const fn = useServerFn(listarAcervo);
  return useQuery({
    queryKey: ["proposta-acervo"],
    queryFn: () => fn(),
    staleTime: 10 * 60_000,
  });
}

function Miniatura({ s, apagado }: { s: SlideComMiniatura; apagado?: boolean }) {
  return s.miniatura ? (
    <img
      src={s.miniatura}
      alt={s.titulo ?? `Slide ${s.ordem}`}
      loading="lazy"
      className={`aspect-video w-full rounded-md border object-cover ${apagado ? "opacity-40" : ""}`}
    />
  ) : (
    <div className="aspect-video w-full rounded-md border bg-muted" />
  );
}

// ---------------------------------------------------------------------------
// Gestão do acervo (aba "Apresentação" em Propostas)
// ---------------------------------------------------------------------------
export function GerirAcervo() {
  const qc = useQueryClient();
  const { data, isLoading } = useAcervo();
  const importarFn = useServerFn(importarAcervo);
  const atualizarFn = useServerFn(atualizarSlideDoAcervo);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const slides = useMemo(() => (data?.slides ?? []) as SlideComMiniatura[], [data]);
  const grupos = useMemo(() => agruparPorSecao(slides), [slides]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["proposta-acervo"] });

  const atualizar = useMutation({
    mutationFn: (v: { ids: string[]; ativo?: boolean; programa?: string; secao?: string }) =>
      atualizarFn({ data: v }),
    onSuccess: () => {
      setMarcados(new Set());
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const importar = async (arquivo: File) => {
    if (
      slides.length &&
      !confirm(
        "Trocar o acervo pela apresentação deste PDF? As propostas já montadas continuam com os slides que têm.",
      )
    )
      return;
    const { enviarAcervoPdf } = await import("@/lib/propostas/apresentacao-arquivos");
    setProgresso("Lendo o PDF…");
    try {
      const { importacao, imagens } = await enviarAcervoPdf(arquivo, (feito, total, etapa) =>
        setProgresso(
          etapa === "lendo"
            ? `Convertendo página ${feito + 1} de ${total}…`
            : `Enviando slide ${Math.min(feito + 1, total)} de ${total}…`,
        ),
      );
      const secoes = secoesDasPaginas(imagens.length);
      setProgresso("Salvando…");
      await importarFn({
        data: {
          importacao,
          slides: imagens.map((url, i) => ({
            ordem: i + 1,
            programa: secoes[i].programa,
            secao: secoes[i].secao,
            titulo: secoes[i].titulo,
            imagemUrl: url,
          })),
        },
      });
      toast.success(
        secoes[0]?.mapeado
          ? `Acervo importado · ${imagens.length} slides já separados por serviço`
          : `Acervo importado · ${imagens.length} slides. O PDF não bate com a apresentação mapeada: marque os slides e escolha a seção de cada um.`,
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setProgresso(null);
    }
  };

  const opcoesSecao = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of SECOES_DA_APRESENTACAO) m.set(s.programa, s.secao);
    for (const g of grupos) if (!m.has(g.programa)) m.set(g.programa, g.secao);
    m.delete("sem-secao");
    return [...m].map(([programa, secao]) => ({ programa, secao }));
  }, [grupos]);

  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="surface-panel flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="max-w-[70ch] space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Presentation className="h-4 w-4" /> Apresentação comercial (acervo de slides)
          </p>
          <p className="text-[12.5px] text-muted-foreground">
            A apresentação da Grou separada por serviço/produto. Na proposta, o comercial escolhe
            daqui o que vai para o prospect. Para atualizar, importe o PDF da apresentação inteira:
            com os mesmos {MAPA_DA_APRESENTACAO.length} slides, cada página já entra na seção certa.
          </p>
          {slides.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {slides.length} slides em {grupos.length} seções
              {slides.some((s) => !s.ativo)
                ? ` · ${slides.filter((s) => !s.ativo).length} escondidos`
                : ""}
            </p>
          )}
        </div>
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium hover:border-primary ${progresso ? "pointer-events-none opacity-60" : ""}`}
        >
          <Upload className="h-3.5 w-3.5" />
          {slides.length ? "Trocar pelo PDF novo" : "Importar PDF da apresentação"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importar(f);
            }}
          />
        </label>
      </div>
      {progresso && <p className="text-[12.5px] text-muted-foreground">{progresso}</p>}

      {marcados.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-[12.5px] shadow">
          <span className="font-medium">{marcados.size} marcados</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-[12px]"
            defaultValue=""
            onChange={(e) => {
              const o = opcoesSecao.find((x) => x.programa === e.target.value);
              if (o) atualizar.mutate({ ids: [...marcados], programa: o.programa, secao: o.secao });
            }}
          >
            <option value="" disabled>
              Mover para a seção…
            </option>
            {opcoesSecao.map((o) => (
              <option key={o.programa} value={o.programa}>
                {o.secao}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => atualizar.mutate({ ids: [...marcados], ativo: false })}
          >
            <EyeOff className="mr-1 h-3.5 w-3.5" /> Esconder
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => atualizar.mutate({ ids: [...marcados], ativo: true })}
          >
            <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Limpar
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : slides.length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Ainda não há acervo. Importe o PDF da apresentação comercial.
        </p>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const aberta = !!abertas[g.programa];
            const ocultos = g.slides.filter((s) => !s.ativo).length;
            return (
              <div key={g.programa} className="surface-panel p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setAbertas((a) => ({ ...a, [g.programa]: !aberta }))}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    {aberta ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {g.secao}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {g.slides.length} slides{ocultos ? ` · ${ocultos} escondidos` : ""}
                  </span>
                </button>
                {aberta && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {(g.slides as SlideComMiniatura[]).map((s) => (
                      <label key={s.id} className="relative cursor-pointer space-y-1">
                        <input
                          type="checkbox"
                          checked={marcados.has(s.id)}
                          onChange={() => alternar(s.id)}
                          className="absolute left-1.5 top-1.5 z-10"
                        />
                        <Miniatura s={s} apagado={!s.ativo} />
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {s.ordem}. {s.titulo ?? ""}
                          {!s.ativo ? " · escondido" : ""}
                        </p>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escolha na proposta
// ---------------------------------------------------------------------------
export function EscolherDoAcervo({
  itens,
  ocupado,
  onUsar,
}: {
  itens: string[];
  ocupado: boolean;
  onUsar: (ap: Apresentacao) => void;
}) {
  const { data, isLoading } = useAcervo();
  const slides = useMemo(
    () => ((data?.slides ?? []) as SlideComMiniatura[]).filter((s) => s.ativo),
    [data],
  );
  const grupos = useMemo(() => agruparPorSecao(slides), [slides]);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [escolhidos, setEscolhidos] = useState<Set<string> | null>(null);

  // Primeira abertura: as seções sugeridas pelos itens da proposta.
  const sugeridos = useMemo(() => {
    const programas = new Set(
      sugerirProgramas(
        itens,
        grupos.map((g) => ({ programa: g.programa, secao: g.secao })),
      ),
    );
    return new Set(slides.filter((s) => programas.has(s.programa)).map((s) => s.id));
  }, [itens, grupos, slides]);
  const atuais = escolhidos ?? sugeridos;

  const marcar = (ids: string[], on: boolean) =>
    setEscolhidos(() => {
      const n = new Set(atuais);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  if (isLoading) return <p className="text-[12.5px] text-muted-foreground">Carregando o acervo…</p>;
  if (slides.length === 0)
    return (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
        O acervo da apresentação comercial ainda não foi importado. Peça para a gestão importar em
        Propostas → Apresentação, ou envie um PDF.
      </p>
    );

  const total = atuais.size;
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
        Já vêm marcados a apresentação da Grou e os serviços dos itens desta proposta. Marque ou
        desmarque a seção inteira ou slide a slide; a ordem é a da apresentação.
      </p>
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
        {grupos.map((g) => {
          const ids = g.slides.map((s) => s.id);
          const n = ids.filter((id) => atuais.has(id)).length;
          const aberta = !!abertas[g.programa];
          return (
            <div key={g.programa} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={n === ids.length}
                  ref={(el) => {
                    if (el) el.indeterminate = n > 0 && n < ids.length;
                  }}
                  onChange={(e) => marcar(ids, e.target.checked)}
                />
                <button
                  type="button"
                  className="flex flex-1 items-center justify-between gap-2 text-left text-[12.5px]"
                  onClick={() => setAbertas((a) => ({ ...a, [g.programa]: !aberta }))}
                >
                  <span className="font-medium">{g.secao}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {n}/{ids.length}
                    {aberta ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
              </div>
              {aberta && (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {(g.slides as SlideComMiniatura[]).map((s) => (
                    <label key={s.id} className="relative cursor-pointer">
                      <input
                        type="checkbox"
                        checked={atuais.has(s.id)}
                        onChange={(e) => marcar([s.id], e.target.checked)}
                        className="absolute left-1 top-1 z-10"
                      />
                      <Miniatura s={s} apagado={!atuais.has(s.id)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[12px] ${total > MAX_SLIDES_NA_PROPOSTA ? "text-destructive" : "text-muted-foreground"}`}
        >
          {total} slides
          {total > MAX_SLIDES_NA_PROPOSTA ? ` (máximo ${MAX_SLIDES_NA_PROPOSTA})` : ""}
        </span>
        <Button
          size="sm"
          disabled={ocupado || total === 0 || total > MAX_SLIDES_NA_PROPOSTA}
          onClick={() => onUsar(montarApresentacao(slides, atuais))}
        >
          {ocupado ? "Salvando…" : "Usar estes slides"}
        </Button>
      </div>
    </div>
  );
}
