import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { lerExportDeMarketing, type LinhaDoExport } from "@/lib/rd/importar-marketing";
import { importarLoteDeMarketing } from "@/lib/rd-marketing.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/importar-rd")({
  component: ImportarRdPage,
  head: () => ({ meta: [{ title: "Importar base do RD | Grou Compass" }] }),
});

const LOTE = 200;

/** CSV do RD: separador variável e campo com aspas por causa da vírgula. */
function lerCsv(texto: string): LinhaDoExport[] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const sep = (texto.split("\n")[0]?.match(/;/g)?.length ?? 0) > 0 ? ";" : ",";

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo.replace(/\r$/, ""));
      if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== "")) linhas.push(linha);

  const [cabecalho, ...resto] = linhas;
  if (!cabecalho) return [];
  return resto.map((l) =>
    Object.fromEntries(cabecalho.map((h, i) => [h.trim(), (l[i] ?? "").trim()])),
  );
}

/*
 * Importar a base de marketing do RD.
 *
 * São ~70 mil leads que converteram em conteúdo e nunca viraram negociação. A
 * API de marketing do RD é feita para consultar um lead por vez, não para
 * listar a base inteira, então o caminho é o export do próprio RD.
 *
 * Vai em lotes por dois motivos: requisição com 70 mil linhas não passa, e em
 * lote dá para ver o progresso e parar no meio se algo sair errado.
 */
function ImportarRdPage() {
  const importarFn = useServerFn(importarLoteDeMarketing);
  const [linhas, setLinhas] = useState<LinhaDoExport[] | null>(null);
  const [arquivo, setArquivo] = useState<string>("");
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState({
    criados: 0,
    completados: 0,
    intocados: 0,
    conversoes: 0,
  });
  const parar = useRef(false);

  const prévia = linhas ? lerExportDeMarketing(linhas) : null;

  async function escolher(f: File) {
    const texto = await f.text();
    const lidas = lerCsv(texto);
    setArquivo(f.name);
    setLinhas(lidas);
    setFeitos(0);
    setTotal(0);
    setResumo({ criados: 0, completados: 0, intocados: 0, conversoes: 0 });
  }

  async function importar() {
    if (!prévia) return;
    const leads = prévia.leads;
    setRodando(true);
    parar.current = false;
    setTotal(leads.length);
    setFeitos(0);

    try {
      for (let i = 0; i < leads.length; i += LOTE) {
        if (parar.current) break;
        const r = await importarFn({ data: { linhas: leads.slice(i, i + LOTE) } });
        setResumo((s) => ({
          criados: s.criados + r.criados,
          completados: s.completados + r.completados,
          intocados: s.intocados + r.intocados,
          conversoes: s.conversoes + r.conversoes,
        }));
        setFeitos(Math.min(i + LOTE, leads.length));
      }
      toast.success(parar.current ? "Importação interrompida" : "Importação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setRodando(false);
    }
  }

  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">Importar a base de marketing do RD</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Os leads que converteram em conteúdo e nunca viraram negociação. Eles entram{" "}
          <strong>fora do kanban de SDR</strong>, para não pesar o carregamento, e ficam disponíveis
          para busca, segmentação e campanha.
        </p>
      </div>

      <div className="surface-panel space-y-3 p-4">
        <p className="section-label">1. Exporte no RD</p>
        <p className="text-[12px] text-muted-foreground">
          No RD Station Marketing: <strong>Base de Leads → Exportações</strong>, exporte todos os
          contatos em CSV. O arquivo vem por e-mail quando fica pronto.
        </p>

        <p className="section-label pt-2">2. Escolha o arquivo</p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void escolher(f);
          }}
          className="block w-full text-[12px] file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-[12px]"
        />

        {prévia && (
          <div className="rounded-md border border-border p-3 text-[12px]">
            <p className="font-medium">{arquivo}</p>
            <p className="mt-1 text-muted-foreground">
              {linhas?.length ?? 0} linha(s) no arquivo · <strong>{prévia.leads.length}</strong>{" "}
              para importar
              {prévia.ignoradas > 0 && (
                <> · {prévia.ignoradas} sem e-mail e sem telefone, que serão ignoradas</>
              )}
            </p>
            {prévia.leads[0] && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Primeira linha lida: {prévia.leads[0].nome ?? "sem nome"} ·{" "}
                {prévia.leads[0].email ?? "sem e-mail"} · {prévia.leads[0].empresa ?? "sem empresa"}
              </p>
            )}
          </div>
        )}
      </div>

      {prévia && prévia.leads.length > 0 && (
        <div className="surface-panel space-y-3 p-4">
          <p className="section-label">3. Importar</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void importar()} disabled={rodando}>
              <Upload className="mr-1 h-4 w-4" />
              {rodando ? `Importando… ${pct}%` : `Importar ${prévia.leads.length} leads`}
            </Button>
            {rodando && (
              <Button
                variant="outline"
                onClick={() => {
                  parar.current = true;
                }}
              >
                Parar
              </Button>
            )}
          </div>

          {total > 0 && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                {feitos} de {total} · <strong>{resumo.criados}</strong> novos ·{" "}
                <strong>{resumo.completados}</strong> completados ·{" "}
                <strong>{resumo.intocados}</strong> já estavam completos ·{" "}
                <strong>{resumo.conversoes}</strong> conversões registradas
              </p>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Quem já existe na base não é sobrescrito: a importação só preenche campo vazio. Dado que
            veio do CRM ou que a SDR corrigiu à mão vale mais do que planilha de marketing. Pode
            rodar o mesmo arquivo de novo sem duplicar nada.
          </p>
        </div>
      )}
    </div>
  );
}
