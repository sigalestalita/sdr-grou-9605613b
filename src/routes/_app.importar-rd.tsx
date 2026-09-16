import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { lerExportDeMarketing, type LinhaDoExport } from "@/lib/rd/importar-marketing";
import { criarLeitorCsv, descobrirSeparador } from "@/lib/rd/csv-stream";
import { importarLoteDeMarketing } from "@/lib/rd-marketing.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/importar-rd")({
  component: ImportarRdPage,
  head: () => ({ meta: [{ title: "Importar base do RD | Grou Compass" }] }),
});

const LOTE = 200;

/*
 * Só o começo do arquivo, para mostrar o que foi entendido.
 *
 * O export voltou com 127 MB. Ler tudo para montar uma prévia seria ler duas
 * vezes o mesmo arquivo — e a prévia que importa é o mapeamento das colunas,
 * que o cabeçalho e meia dúzia de linhas já respondem.
 */
async function lerAmostra(f: File): Promise<LinhaDoExport[]> {
  const inicio = await f.slice(0, 256 * 1024).text();
  const sep = descobrirSeparador(inicio.split("\n")[0] ?? "");
  const leitor = criarLeitorCsv(sep);
  const linhas = leitor.alimentar(inicio);
  const [cabecalho, ...resto] = linhas;
  if (!cabecalho) return [];
  return resto
    .slice(0, 20)
    .map((l) => Object.fromEntries(cabecalho.map((h, i) => [h.trim(), (l[i] ?? "").trim()])));
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
  const [amostra, setAmostra] = useState<LinhaDoExport[] | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState({
    criados: 0,
    completados: 0,
    intocados: 0,
    conversoes: 0,
    porDominio: 0,
    porNome: 0,
    semEmpresa: 0,
  });
  const parar = useRef(false);

  const prévia = amostra ? lerExportDeMarketing(amostra) : null;

  async function escolher(f: File) {
    setArquivo(f);
    setAmostra(await lerAmostra(f));
    setFeitos(0);
    setTotal(0);
    setResumo({
      criados: 0,
      completados: 0,
      intocados: 0,
      conversoes: 0,
      porDominio: 0,
      porNome: 0,
      semEmpresa: 0,
    });
  }

  /*
   * Percorre o arquivo sem carregá-lo.
   *
   * O progresso é medido em bytes lidos, não em linhas: com 127 MB não se sabe
   * quantas linhas existem sem ler o arquivo todo antes, e ler duas vezes para
   * mostrar uma porcentagem não compensa.
   */
  async function importar() {
    const f = arquivo;
    if (!f) return;
    setRodando(true);
    parar.current = false;
    setTotal(f.size);
    setFeitos(0);
    setResumo({
      criados: 0,
      completados: 0,
      intocados: 0,
      conversoes: 0,
      porDominio: 0,
      porNome: 0,
      semEmpresa: 0,
    });

    const leitor = f.stream().pipeThrough(new TextDecoderStream()).getReader();
    let cabecalho: string[] | null = null;
    let sep: string | null = null;
    let csv: ReturnType<typeof criarLeitorCsv> | null = null;
    let acumulado: LinhaDoExport[] = [];
    let bytes = 0;

    async function despachar() {
      if (acumulado.length === 0) return;
      const { leads } = lerExportDeMarketing(acumulado);
      acumulado = [];
      if (leads.length === 0) return;
      const r = await importarFn({ data: { linhas: leads } });
      setResumo((s) => ({
        criados: s.criados + r.criados,
        completados: s.completados + r.completados,
        intocados: s.intocados + r.intocados,
        conversoes: s.conversoes + r.conversoes,
        porDominio: s.porDominio + r.vinculos.porDominio,
        porNome: s.porNome + r.vinculos.porNome,
        semEmpresa: s.semEmpresa + r.vinculos.semEmpresa,
      }));
    }

    function registrar(linhas: string[][]) {
      for (const l of linhas) {
        if (!cabecalho) {
          cabecalho = l.map((h) => h.trim());
          continue;
        }
        acumulado.push(
          Object.fromEntries(cabecalho.map((h, i) => [h, (l[i] ?? "").trim()])) as LinhaDoExport,
        );
      }
    }

    try {
      for (;;) {
        if (parar.current) break;
        const { done, value } = await leitor.read();
        if (done) break;
        bytes += new Blob([value]).size;
        if (!csv) {
          sep = descobrirSeparador(value.split("\n")[0] ?? "");
          csv = criarLeitorCsv(sep);
        }
        registrar(csv.alimentar(value));
        while (acumulado.length >= LOTE && !parar.current) {
          const lote = acumulado.splice(0, LOTE);
          const guardado = acumulado;
          acumulado = lote;
          await despachar();
          acumulado = guardado;
        }
        setFeitos(Math.min(bytes, f.size));
      }
      if (csv && !parar.current) registrar(csv.finalizar());
      if (!parar.current) await despachar();
      setFeitos(f.size);
      toast.success(parar.current ? "Importação interrompida" : "Importação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      await leitor.cancel().catch(() => null);
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

        {arquivo && prévia && (
          <div className="rounded-md border border-border p-3 text-[12px]">
            <p className="font-medium">
              {arquivo.name}{" "}
              <span className="font-normal text-muted-foreground">
                ({(arquivo.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </p>
            {/* A prévia sai das primeiras linhas: com 127 MB, ler o arquivo
                inteiro só para contar linhas seria lê-lo duas vezes. */}
            <p className="mt-1 text-muted-foreground">
              Amostra das primeiras linhas, para conferir se as colunas foram entendidas. A contagem
              final aparece durante a importação.
            </p>
            {prévia.leads[0] ? (
              <ul className="mt-2 space-y-1">
                {prévia.leads.slice(0, 3).map((l, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    {l.nome ?? "sem nome"} · {l.email ?? "sem e-mail"} ·{" "}
                    {l.empresa ?? "sem empresa"} ·{" "}
                    {l.nomeUltimaConversao ?? "sem conversão registrada"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                Não consegui ler nenhum lead da amostra. Confira se o export tem coluna de e-mail ou
                telefone.
              </p>
            )}
          </div>
        )}
      </div>

      {arquivo && prévia && prévia.leads.length > 0 && (
        <div className="surface-panel space-y-3 p-4">
          <p className="section-label">3. Importar</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void importar()} disabled={rodando}>
              <Upload className="mr-1 h-4 w-4" />
              {rodando ? `Importando… ${pct}%` : "Importar o arquivo inteiro"}
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
                {(feitos / 1024 / 1024).toFixed(1)} de {(total / 1024 / 1024).toFixed(1)} MB ·{" "}
                <strong>{resumo.criados}</strong> novos · <strong>{resumo.completados}</strong>{" "}
                completados · <strong>{resumo.intocados}</strong> já estavam completos ·{" "}
                <strong>{resumo.conversoes}</strong> conversões registradas
              </p>
              {/* A qualidade do vínculo é o que decide se a base serve para
                  segmentar depois, então aparece separada por chave. */}
              <p className="text-[12px] text-muted-foreground">
                Empresa vinculada: <strong>{resumo.porDominio}</strong> pelo domínio do e-mail ·{" "}
                <strong>{resumo.porNome}</strong> pelo nome · <strong>{resumo.semEmpresa}</strong>{" "}
                sem empresa
              </p>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Quem já existe na base não é sobrescrito: a importação só preenche campo vazio. Dado que
            veio do CRM ou que a SDR corrigiu à mão vale mais do que planilha de marketing. Pode
            rodar o mesmo arquivo de novo sem duplicar nada.
          </p>
          <p className="text-[11px] text-muted-foreground">
            O vínculo com a empresa usa o domínio do e-mail e, na falta dele, o nome. Provedor
            pessoal (gmail, hotmail) é ignorado de propósito: ligaria milhares de pessoas sem
            relação numa empresa só. Empresa que ainda não existe não é criada — o nome fica no lead
            e vira cadastro quando alguém for trabalhar a conta.
          </p>
        </div>
      )}
    </div>
  );
}
