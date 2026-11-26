import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Loader2, Plus, X } from "lucide-react";
import {
  criarNegocio,
  FONTES_NEGOCIO_DO_EXECUTIVO,
  opcoesNovoNegocio,
} from "@/lib/comercial-negocio.functions";
import { buscarEmpresaParaFicha } from "@/lib/fichas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";

type Empresa = { id: string; nome: string; cnpj: string | null };

/**
 * Botão + formulário para o executivo abrir um negócio do zero. Sem isso, a
 * proposta só nascia de negócio vindo do SDR, do CS ou do RD.
 */
export function NovoNegocioButton({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="sm" className={className ?? "h-8 text-xs"} onClick={() => setAberto(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Novo negócio
      </Button>
      {aberto && <NovoNegocioDialog onClose={() => setAberto(false)} />}
    </>
  );
}

function NovoNegocioDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const opcoesFn = useServerFn(opcoesNovoNegocio);
  const criarFn = useServerFn(criarNegocio);
  const buscarFn = useServerFn(buscarEmpresaParaFicha);
  const { data: opcoes } = useQuery({
    queryKey: ["novo-negocio", "opcoes"],
    queryFn: () => opcoesFn(),
    staleTime: 5 * 60_000,
  });

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [termo, setTermo] = useState("");
  const [atrasado, setAtrasado] = useState("");
  const [tipoEmpresa, setTipoEmpresa] = useState<"empresa" | "pessoa_fisica" | "consultoria">(
    "empresa",
  );
  const [contato, setContato] = useState({ nome: "", email: "", telefone: "", cargo: "" });
  const [nome, setNome] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [valor, setValor] = useState("");
  const [produtos, setProdutos] = useState("");
  const [fonte, setFonte] = useState<string>(FONTES_NEGOCIO_DO_EXECUTIVO[0]);
  const [executivoId, setExecutivoId] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");
  const [proximoPassoEm, setProximoPassoEm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setAtrasado(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);
  const { data: achadas, isFetching } = useQuery({
    queryKey: ["novo-negocio", "empresas", atrasado],
    queryFn: () => buscarFn({ data: { q: atrasado } }),
    enabled: !empresa && atrasado.length >= 2,
  });

  const criar = useMutation({
    mutationFn: () => {
      const empresaNome = empresa ? "" : termo.trim();
      if (!empresa && empresaNome.length < 2) throw new Error("Escolha ou digite a empresa");
      const temContato = contato.nome.trim() || contato.email.trim();
      const v = Number(valor.replace(/\./g, "").replace(",", ".") || 0);
      if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido");
      return criarFn({
        data: {
          empresaId: empresa?.id ?? null,
          empresaNome,
          tipoEmpresa,
          contato: temContato
            ? {
                nome: contato.nome.trim() || contato.email.trim(),
                email: contato.email.trim() || null,
                telefone: contato.telefone.trim() || null,
                cargo: contato.cargo.trim() || null,
              }
            : null,
          nome: nome.trim(),
          pipelineId: pipelineId || null,
          valor: v,
          produtos: produtos.trim() || null,
          fonte,
          executivoId: executivoId || null,
          proximoPasso: proximoPasso.trim() || null,
          proximoPassoEm: proximoPassoEm
            ? new Date(`${proximoPassoEm}T09:00:00`).toISOString()
            : null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Negócio criado");
      qc.invalidateQueries({ queryKey: ["comercial-pipeline"] });
      onClose();
      navigate({ to: "/negocio/$id", params: { id: r.dealId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar o negócio"),
  });

  const novaEmpresa = !empresa && termo.trim().length >= 2;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Novo negócio</DialogTitle>
          <DialogDescription>
            Para prospecção sua, indicação ou evento. Depois de criado, a proposta sai da ficha do
            negócio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Bloco titulo="Empresa">
            {empresa ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{empresa.nome}</span>
                  {empresa.cnpj && (
                    <span className="text-[11px] text-muted-foreground">{empresa.cnpj}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setEmpresa(null)}
                  title="Trocar empresa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  autoFocus
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Buscar pelo nome ou CNPJ, ou digitar uma nova"
                  className="text-[13px]"
                />
                {atrasado.length >= 2 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border">
                    {isFetching && !achadas ? (
                      <p className="p-2 text-[12px] text-muted-foreground">Buscando…</p>
                    ) : (
                      (achadas ?? []).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            setEmpresa(e);
                            setTermo("");
                          }}
                          className="flex w-full items-center justify-between gap-2 border-b px-3 py-1.5 text-left text-[13px] last:border-0 hover:bg-muted/50"
                        >
                          <span className="truncate">{e.nome}</span>
                          {e.cnpj && (
                            <span className="text-[11px] text-muted-foreground">{e.cnpj}</span>
                          )}
                        </button>
                      ))
                    )}
                    {novaEmpresa && (
                      <p className="border-t bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
                        Não achou? Ao criar, entra a empresa nova “{termo.trim()}”.
                      </p>
                    )}
                  </div>
                )}
                {novaEmpresa && (
                  <select
                    className={SELECT}
                    value={tipoEmpresa}
                    onChange={(e) => setTipoEmpresa(e.target.value as typeof tipoEmpresa)}
                  >
                    <option value="empresa">Empresa</option>
                    <option value="consultoria">Consultoria</option>
                    <option value="pessoa_fisica">Pessoa física</option>
                  </select>
                )}
              </>
            )}
          </Bloco>

          <Bloco titulo="Contato principal (opcional)">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={contato.nome}
                onChange={(e) => setContato({ ...contato, nome: e.target.value })}
                placeholder="Nome"
                className="text-[13px]"
              />
              <Input
                value={contato.cargo}
                onChange={(e) => setContato({ ...contato, cargo: e.target.value })}
                placeholder="Cargo"
                className="text-[13px]"
              />
              <Input
                type="email"
                value={contato.email}
                onChange={(e) => setContato({ ...contato, email: e.target.value })}
                placeholder="E-mail"
                className="text-[13px]"
              />
              <Input
                value={contato.telefone}
                onChange={(e) => setContato({ ...contato, telefone: e.target.value })}
                placeholder="Telefone"
                className="text-[13px]"
              />
            </div>
          </Bloco>

          <Bloco titulo="Negócio">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={`Nome (padrão: ${empresa?.nome || termo.trim() || "a empresa"})`}
                className="text-[13px] sm:col-span-2"
                maxLength={200}
              />
              <select
                className={SELECT}
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                title="Funil"
              >
                <option value="">Funil: Novos Negócios</option>
                {(opcoes?.pipelines ?? [])
                  .filter((p) => p.slug !== "novos-negocios")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      Funil: {p.nome}
                    </option>
                  ))}
              </select>
              <select
                className={SELECT}
                value={fonte}
                onChange={(e) => setFonte(e.target.value)}
                title="Origem"
              >
                {FONTES_NEGOCIO_DO_EXECUTIVO.map((f) => (
                  <option key={f} value={f}>
                    Origem: {f}
                  </option>
                ))}
              </select>
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Valor estimado (R$)"
                className="text-[13px]"
              />
              {opcoes?.isManager ? (
                <select
                  className={SELECT}
                  value={executivoId}
                  onChange={(e) => setExecutivoId(e.target.value)}
                  title="Executivo"
                >
                  <option value="">Executivo: eu</option>
                  {opcoes.executivos
                    .filter((p) => p.id !== opcoes.meuId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Executivo: {p.nome}
                      </option>
                    ))}
                </select>
              ) : (
                <div />
              )}
              <Input
                value={produtos}
                onChange={(e) => setProdutos(e.target.value)}
                placeholder="Produtos/serviços de interesse (ex.: PDA Assessment, Master Líder)"
                className="text-[13px] sm:col-span-2"
                maxLength={1000}
              />
            </div>
          </Bloco>

          <Bloco titulo="Próximo passo (opcional)">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Input
                value={proximoPasso}
                onChange={(e) => setProximoPasso(e.target.value)}
                placeholder="Ex.: enviar proposta"
                className="text-[13px]"
                maxLength={300}
              />
              <Input
                type="date"
                value={proximoPassoEm}
                onChange={(e) => setProximoPassoEm(e.target.value)}
                className="text-[13px]"
              />
            </div>
          </Bloco>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
            {criar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Criar negócio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}
