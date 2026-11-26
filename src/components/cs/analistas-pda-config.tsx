import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { Building2, FileUp, GraduationCap, Loader2, Search, Trash2, X } from "lucide-react";
import {
  importarAnalistasPda,
  listarAnalistasPda,
  removerAnalistaPda,
  vincularAnalistaPda,
  type AnalistaPda,
} from "@/lib/analistas-pda.functions";
import { buscarEmpresasParaMesclar } from "@/lib/empresas-mescla.functions";
import { lerAnalistasPda, MAX_ANALISTAS_POR_IMPORTACAO } from "@/lib/cs/analistas-pda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  telefone: "Telefone",
  cargo: "Cargo",
  empresa: "Empresa",
  cnpj: "CNPJ",
  certificado_em: "Data de certificação",
};
const ROTULO_VINCULO: Record<string, string> = {
  cnpj: "pelo CNPJ",
  contato: "pelo e-mail do contato",
  dominio: "pelo domínio do e-mail",
  nome: "pelo nome da empresa",
  manual: "à mão",
  sem_empresa: "sem empresa",
};

/** CSV salvo pelo Excel costuma vir em Windows-1252. */
async function lerArquivo(f: File): Promise<string> {
  const bytes = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Configurações do CS → Analistas PDA: importar o CSV dos analistas
 * certificados e ligar à mão os que ficaram sem empresa.
 */
export function AnalistasPdaConfig() {
  const qc = useQueryClient();
  const importarFn = useServerFn(importarAnalistasPda);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const leitura = useMemo(() => lerAnalistasPda(texto), [texto]);

  const importar = useMutation({
    mutationFn: () => {
      if (!leitura.analistas.length) throw new Error("Nenhum analista lido");
      if (leitura.analistas.length > MAX_ANALISTAS_POR_IMPORTACAO)
        throw new Error(`Máximo de ${MAX_ANALISTAS_POR_IMPORTACAO} por vez; divida o arquivo`);
      return importarFn({ data: { linhas: leitura.analistas } });
    },
    onSuccess: (r) => {
      const vinc = Object.entries(r.por_vinculo)
        .map(([k, v]) => `${v} ${ROTULO_VINCULO[k] ?? k}`)
        .join(", ");
      toast.success(`${r.novos} novos, ${r.atualizados} atualizados · ${vinc}`);
      setTexto("");
      setArquivo(null);
      qc.invalidateQueries({ queryKey: ["analistas-pda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao importar"),
  });

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="h-4 w-4 text-primary" /> Analistas PDA
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Importe o CSV dos analistas certificados (ou cole as colunas da planilha). Colunas
          reconhecidas pelo nome: nome, e-mail, telefone, cargo, empresa, CNPJ e data de
          certificação; as outras ficam guardadas no cadastro. A empresa é ligada pelo CNPJ, pelo
          e-mail de um contato já cadastrado, pelo domínio do e-mail ou pelo nome da empresa.
          Importar de novo atualiza pelo e-mail, sem duplicar. Os analistas aparecem na aba
          “Analistas PDA” de cada empresa.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => {
            setArquivo(null);
            setTexto(e.target.value);
          }}
          rows={5}
          spellCheck={false}
          placeholder={
            "Nome;E-mail;Empresa;CNPJ;Data de certificação\nAna Souza;ana@empresa.com.br;Empresa X;12.345.678/0001-90;10/03/2025"
          }
          className="w-full rounded-md border bg-background p-2 font-mono text-[12px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-3 text-[12px] font-medium hover:bg-muted/50">
            <FileUp className="h-3.5 w-3.5" /> Escolher arquivo .csv
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain,.xlsx,.xls"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (/\.(xlsx?|ods)$/i.test(f.name)) {
                  toast.error("Planilha do Excel: salve como CSV ou copie e cole as colunas aqui.");
                  return;
                }
                setArquivo(f.name);
                setTexto(await lerArquivo(f));
              }}
            />
          </label>
          {arquivo && <span className="text-[12px] text-muted-foreground">{arquivo}</span>}
          {texto && (
            <button
              type="button"
              className="text-[12px] text-muted-foreground hover:underline"
              onClick={() => {
                setTexto("");
                setArquivo(null);
              }}
            >
              limpar
            </button>
          )}
        </div>
      </div>

      {texto.trim() && (
        <div className="space-y-2 rounded-md border p-3">
          {leitura.analistas.length === 0 ? (
            <p className="text-[12px] text-destructive">
              Não achei as colunas. A primeira linha precisa ser o cabeçalho, com ao menos “Nome” ou
              “E-mail”.
            </p>
          ) : (
            <>
              <p className="text-[12px]">
                <span className="font-medium">
                  {leitura.analistas.length.toLocaleString("pt-BR")} analistas
                </span>{" "}
                lidos
                {leitura.repetidos > 0 && ` · ${leitura.repetidos} repetidos`}
                {leitura.ignoradas > 0 && ` · ${leitura.ignoradas} linhas sem nome`}
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(leitura.colunas).map(([campo, cab]) => (
                  <Badge key={campo} variant="secondary" className="text-[10px]">
                    {ROTULO_CAMPO[campo] ?? campo} ← {cab}
                  </Badge>
                ))}
              </div>
              <div className="divide-y rounded border text-[12px]">
                {leitura.analistas.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex flex-wrap gap-x-3 px-2 py-1">
                    <span className="font-medium">{a.nome}</span>
                    <span className="text-muted-foreground">
                      {[a.email, a.empresa, a.cnpj, a.certificado_em].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={() => importar.mutate()} disabled={importar.isPending}>
                {importar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Importar {leitura.analistas.length.toLocaleString("pt-BR")} analistas
              </Button>
            </>
          )}
        </div>
      )}

      <ListaDeAnalistas />
    </Card>
  );
}

function ListaDeAnalistas() {
  const listarFn = useServerFn(listarAnalistasPda);
  const [semEmpresa, setSemEmpresa] = useState(true);
  const [q, setQ] = useState("");
  const [qAtrasado, setQAtrasado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQAtrasado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ["analistas-pda", semEmpresa, qAtrasado],
    queryFn: () => listarFn({ data: { semEmpresa, q: qAtrasado } }),
  });
  if (!isLoading && data?.total === 0) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={semEmpresa ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setSemEmpresa(true)}
        >
          Sem empresa {data ? `(${data.semEmpresa})` : ""}
        </Button>
        <Button
          size="sm"
          variant={!semEmpresa ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setSemEmpresa(false)}
        >
          Todos {data ? `(${data.total})` : ""}
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, e-mail ou empresa"
            className="h-7 w-56 pl-7 text-xs"
          />
        </div>
      </div>
      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Carregando…</p>
      ) : !data?.analistas.length ? (
        <p className="text-[12px] text-muted-foreground">
          {semEmpresa ? "Todos os analistas estão ligados a uma empresa." : "Nenhum analista."}
        </p>
      ) : (
        <div className="max-h-[420px] divide-y overflow-y-auto rounded-md border">
          {data.analistas.map((a) => (
            <LinhaAnalista key={a.id} a={a} />
          ))}
        </div>
      )}
      {data && data.analistas.length >= 300 && (
        <p className="text-[11px] text-muted-foreground">Mostrando 300; use a busca.</p>
      )}
    </div>
  );
}

function LinhaAnalista({ a }: { a: AnalistaPda }) {
  const qc = useQueryClient();
  const vincularFn = useServerFn(vincularAnalistaPda);
  const removerFn = useServerFn(removerAnalistaPda);
  const [ligando, setLigando] = useState(false);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["analistas-pda"] });
  const vincular = useMutation({
    mutationFn: (companyId: string | null) => vincularFn({ data: { id: a.id, companyId } }),
    onSuccess: () => {
      toast.success("Empresa atualizada");
      setLigando(false);
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remover = useMutation({
    mutationFn: () => removerFn({ data: { id: a.id } }),
    onSuccess: () => {
      toast.success("Analista removido");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <div className="space-y-1 px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{a.nome}</span>
        <span className="text-muted-foreground">
          {[
            a.email,
            a.telefone,
            a.certificadoEm && format(new Date(`${a.certificadoEm}T12:00:00`), "dd/MM/yyyy"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {a.empresaNome ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3 text-muted-foreground" /> {a.empresaNome}
              {a.vinculo && (
                <span className="text-[10px] text-muted-foreground">
                  ({ROTULO_VINCULO[a.vinculo] ?? a.vinculo})
                </span>
              )}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              sem empresa{a.empresaInformada ? ` · informada: ${a.empresaInformada}` : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setLigando((v) => !v)}
            className="text-primary hover:underline"
          >
            {a.empresaNome ? "trocar" : "ligar empresa"}
          </button>
          <button
            type="button"
            title="Remover analista"
            onClick={() => {
              if (window.confirm(`Remover ${a.nome} dos analistas PDA?`)) remover.mutate();
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {ligando && (
        <BuscaEmpresa
          inicial={a.empresaInformada ?? ""}
          onEscolher={(id) => vincular.mutate(id)}
          onDesligar={a.companyId ? () => vincular.mutate(null) : undefined}
          onFechar={() => setLigando(false)}
        />
      )}
    </div>
  );
}

function BuscaEmpresa({
  inicial,
  onEscolher,
  onDesligar,
  onFechar,
}: {
  inicial: string;
  onEscolher: (companyId: string) => void;
  onDesligar?: () => void;
  onFechar: () => void;
}) {
  const fn = useServerFn(buscarEmpresasParaMesclar);
  const [termo, setTermo] = useState(inicial);
  const [atrasado, setAtrasado] = useState(inicial.trim());
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);
  const { data, isFetching } = useQuery({
    queryKey: ["analistas-busca-empresa", atrasado],
    queryFn: () => fn({ data: { q: atrasado } }),
    enabled: atrasado.length >= 2,
  });
  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar empresa pelo nome ou CNPJ"
          className="h-7 text-xs"
        />
        {onDesligar && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDesligar}>
            Desligar
          </Button>
        )}
        <button type="button" onClick={onFechar} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {atrasado.length >= 2 && (
        <div className="max-h-40 overflow-y-auto rounded border bg-background">
          {isFetching && !data ? (
            <p className="p-2 text-[11px] text-muted-foreground">Buscando…</p>
          ) : !data?.length ? (
            <p className="p-2 text-[11px] text-muted-foreground">Nenhuma empresa.</p>
          ) : (
            data.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEscolher(e.id)}
                className="block w-full border-b px-2 py-1 text-left text-[12px] last:border-0 hover:bg-muted/50"
              >
                <span className="block truncate">{e.nome}</span>
                {e.detalhe && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {e.detalhe}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
