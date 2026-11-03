import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { aplicarImpostos, consultarCnpj, dadosImpostos } from "@/lib/impostos.functions";
import {
  calcular,
  CATEGORIAS_ESPECIAIS_ISS,
  CLASSIFICACOES,
  ehPortoAlegre,
  REGIMES,
  tipoPessoaDoDocumento,
  type Regime,
} from "@/lib/impostos/calculo";
import { moedaBr } from "@/lib/propostas/render";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROTULO = Object.fromEntries(CLASSIFICACOES.map((c) => [c.v, c.rotulo]));

/**
 * Calculadora de impostos retidos (a mesma que o comercial usava à parte).
 * Os itens já vêm com a classificação fiscal do catálogo; aqui só se
 * confirma o cliente: CPF/CNPJ, regime, município e a categoria especial de
 * ISS (só Porto Alegre). "Usar na proposta" grava no negócio.
 */
export function CalculadoraImpostos({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const dadosFn = useServerFn(dadosImpostos);
  const cnpjFn = useServerFn(consultarCnpj);
  const aplicarFn = useServerFn(aplicarImpostos);
  const { data } = useQuery({
    queryKey: ["impostos", dealId],
    queryFn: () => dadosFn({ data: { dealId } }),
  });
  const [doc, setDoc] = useState("");
  const [tipo, setTipo] = useState<"CPF" | "CNPJ">("CNPJ");
  const [regime, setRegime] = useState<Regime | "">("");
  const [municipio, setMunicipio] = useState("");
  const [especial, setEspecial] = useState<boolean | null>(null);
  const [receita, setReceita] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const u = data.ultimoCliente;
    setDoc(u?.documento || data.documento);
    setTipo(u?.tipoPessoa ?? data.tipoPessoa);
    setRegime(u?.regime ?? data.empresa?.regime_tributario ?? "");
    setMunicipio(u?.municipio ?? data.empresa?.cidade ?? "");
    setEspecial(u?.categoriaEspecialIss ?? data.empresa?.iss_categoria_especial ?? null);
  }, [data]);

  const poa = ehPortoAlegre(municipio);
  const cliente = {
    tipoPessoa: tipo,
    regime: regime || null,
    municipio: municipio || null,
    categoriaEspecialIss: poa ? !!especial : false,
  };
  const r = useMemo(
    () => (data ? calcular(data.itens, cliente) : null),
    [data, tipo, regime, municipio, especial],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = useMutation({
    mutationFn: () => cnpjFn({ data: { cnpj: doc } }),
    onSuccess: (x) => {
      setTipo("CNPJ");
      setMunicipio(x.municipio);
      setRegime(x.regime);
      setReceita(
        `${x.razaoSocial} · ${x.municipio}/${x.uf} · ${x.situacao}${x.cnae ? ` · CNAE: ${x.cnae}` : ""}`,
      );
      toast.success(
        "CNPJ consultado. Lucro Real e Isento a Receita não informa: ajuste se for o caso.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const aplicar = useMutation({
    mutationFn: () => aplicarFn({ data: { dealId, cliente: { documento: doc, ...cliente } } }),
    onSuccess: (x) => {
      toast.success(`Impostos de ${moedaBr(x.impostos)} aplicados na proposta`);
      qc.invalidateQueries({ queryKey: ["itens-negocio", dealId] });
      qc.invalidateQueries({ queryKey: ["negocio", dealId] });
      qc.invalidateQueries({ queryKey: ["impostos", dealId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const falta =
    tipo === "CNPJ" && !regime
      ? "Escolha o regime tributário"
      : poa && especial === null
        ? "Responda a categoria especial de ISS"
        : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impostos retidos na fonte</DialogTitle>
          <DialogDescription>
            O que o cliente retém ao pagar. Os itens já trazem a classificação fiscal do catálogo.
          </DialogDescription>
        </DialogHeader>
        {!data || !r ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px]">CNPJ / CPF do cliente</Label>
                <div className="flex gap-2">
                  <Input
                    value={doc}
                    onChange={(e) => {
                      setDoc(e.target.value);
                      const t = tipoPessoaDoDocumento(e.target.value);
                      if (t) setTipo(t);
                    }}
                    placeholder="00.000.000/0000-00"
                  />
                  <Button
                    variant="outline"
                    disabled={buscar.isPending}
                    onClick={() => buscar.mutate()}
                  >
                    <Search className="mr-1 h-3.5 w-3.5" />{" "}
                    {buscar.isPending ? "Buscando…" : "Buscar"}
                  </Button>
                </div>
                {receita && <p className="text-[11px] text-muted-foreground">{receita}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "CPF" | "CNPJ")}
                >
                  <option value="CNPJ">Pessoa jurídica (CNPJ)</option>
                  <option value="CPF">Pessoa física (CPF)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Regime tributário</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                  value={regime}
                  disabled={tipo === "CPF"}
                  onChange={(e) => setRegime(e.target.value as Regime)}
                >
                  <option value="">Selecione</option>
                  {REGIMES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px]">Município do tomador</Label>
                <Input
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  placeholder="Ex.: Porto Alegre"
                />
              </div>
            </div>

            {poa && tipo === "CNPJ" && (
              <div
                className={`space-y-2 rounded-lg border p-3 ${especial === null ? "border-destructive" : ""}`}
              >
                <p className="text-[13px] font-medium">
                  O tomador é categoria especial de ISS em Porto Alegre?
                </p>
                <div className="flex gap-4 text-[13px]">
                  {[true, false].map((v) => (
                    <label key={String(v)} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={especial === v}
                        onChange={() => setEspecial(v)}
                      />{" "}
                      {v ? "Sim" : "Não"}
                    </label>
                  ))}
                </div>
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer">Quem é categoria especial</summary>
                  <ol className="mt-1 list-decimal pl-5">
                    {CATEGORIAS_ESPECIAIS_ISS.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                </details>
              </div>
            )}

            <div className="space-y-2">
              {r.itens.map((i, idx) => (
                <div key={idx} className="rounded-md border p-2.5 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{i.nome}</span>
                    <span className="tabular-nums">{moedaBr(i.bruto)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {i.classificacao
                      ? ROTULO[i.classificacao]
                      : "Sem classificação fiscal (o ADM define no catálogo)"}{" "}
                    · {i.regra}
                  </p>
                  {i.impostos.map((l) => (
                    <div key={l.imposto} className="flex justify-between text-muted-foreground">
                      <span>
                        {l.imposto} ({l.aliquota.toLocaleString("pt-BR")}%)
                      </span>
                      <span className="tabular-nums">{moedaBr(l.valor)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <dl className="space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
              <div className="flex justify-between">
                <dt>Bruto</dt>
                <dd className="tabular-nums">{moedaBr(r.bruto)}</dd>
              </div>
              {r.porImposto.map((l) => (
                <div key={l.imposto} className="flex justify-between text-muted-foreground">
                  <dt>{l.imposto}</dt>
                  <dd className="tabular-nums">− {moedaBr(l.valor)}</dd>
                </div>
              ))}
              <div className="flex justify-between font-semibold">
                <dt>Impostos retidos ({r.aliquotaEfetiva.toLocaleString("pt-BR")}%)</dt>
                <dd className="tabular-nums">{moedaBr(r.impostos)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Líquido a receber</dt>
                <dd className="tabular-nums">{moedaBr(r.liquido)}</dd>
              </div>
            </dl>
            {r.semClassificacao > 0 && (
              <p className="text-[12px] text-destructive">
                {r.semClassificacao} item(ns) sem classificação fiscal ficaram fora do cálculo.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {falta && (
            <span className="mr-auto self-center text-[12px] text-destructive">{falta}</span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!r || !!falta || aplicar.isPending} onClick={() => aplicar.mutate()}>
            {aplicar.isPending ? "Aplicando…" : "Usar na proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
