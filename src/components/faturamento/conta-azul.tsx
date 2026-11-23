import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, RefreshCw } from "lucide-react";
import {
  desconectarContaAzul,
  getContaAzulAuthUrl,
  getContaAzulDoNegocio,
  getContaAzulStatus,
  ligarVendaContaAzul,
  sincronizarContaAzulAgora,
} from "@/lib/contaazul.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const brl = (v: unknown) =>
  v == null
    ? "—"
    : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Card de Configurações: conexão e última leitura da Conta Azul. */
export function ContaAzulConexaoCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getContaAzulStatus);
  const urlFn = useServerFn(getContaAzulAuthUrl);
  const sairFn = useServerFn(desconectarContaAzul);
  const syncFn = useServerFn(sincronizarContaAzulAgora);
  const { data: s } = useQuery({
    queryKey: ["conta-azul-status"],
    queryFn: () => statusFn(),
    refetchInterval: 30_000,
  });
  const conectar = useMutation({
    mutationFn: () => urlFn({ data: { origin: window.location.origin } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const sair = useMutation({
    mutationFn: () => sairFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conta-azul-status"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      if (!("vendas" in r)) toast.error("Conta Azul não conectada");
      else
        toast.success(
          `Conta Azul: ${r.vendas} vendas, ${r.notas} notas, ${r.receber} contas a receber · ${r.negociosAtualizados} negócios atualizados`,
        );
      qc.invalidateQueries({ queryKey: ["conta-azul-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const r = s?.ultimoResultado;
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Conta Azul</h2>
        <Badge variant={s?.conectada ? "default" : "destructive"}>
          {s?.conectada ? "Conectada" : "Não conectada"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        O Compass lê da Conta Azul, a cada 15 minutos, as vendas, as notas de serviço e o contas a
        receber: mostra no negócio se foi faturado (vendido x faturado), avisa o executivo e o ADM
        quando a nota falha ou é cancelada, e alimenta o alerta de cliente em atraso. A nota
        continua sendo emitida na Conta Azul.
      </p>
      {s && !s.credenciais && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          Falta o app da Conta Azul: crie no Portal do Desenvolvedor e salve CONTAAZUL_CLIENT_ID e
          CONTAAZUL_CLIENT_SECRET nos secrets do Lovable.
        </p>
      )}
      {s?.conectada && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Conectada em {s.conectadaEm ? new Date(s.conectadaEm).toLocaleString("pt-BR") : "—"}
            {s.ultimoEm ? ` · última leitura ${new Date(s.ultimoEm).toLocaleString("pt-BR")}` : ""}
          </p>
          {r && (
            <p>
              Última leitura: {r.vendas} vendas · {r.notas} notas · {r.receber} contas a receber ·{" "}
              {r.negociosAtualizados} negócios atualizados
            </p>
          )}
          {s.ultimoErro && <p className="text-destructive">Erro: {s.ultimoErro}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {s?.conectada ? (
          <>
            <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
              Ler agora
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sair.mutate()}
              disabled={sair.isPending}
            >
              Desconectar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => conectar.mutate()}
            disabled={conectar.isPending || !s?.credenciais}
          >
            Conectar à Conta Azul
          </Button>
        )}
      </div>
    </Card>
  );
}

const ROTULO_NF: Record<string, { texto: string; cor: string }> = {
  EMITIDA: { texto: "Faturado", cor: "text-success" },
  PARCIAL: { texto: "Faturado em parte", cor: "text-success" },
  EM_EMISSAO: { texto: "Nota em emissão", cor: "text-muted-foreground" },
  FALHA: { texto: "Nota com problema", cor: "text-destructive" },
  CANCELADA: { texto: "Nota cancelada", cor: "text-destructive" },
  SEM_NOTA: { texto: "Ainda sem nota", cor: "text-muted-foreground" },
};

/** Bloco no negócio: venda da Conta Azul, notas e vendido x faturado. */
export function ContaAzulDoNegocio({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getContaAzulDoNegocio);
  const ligarFn = useServerFn(ligarVendaContaAzul);
  const { data } = useQuery({
    queryKey: ["conta-azul-negocio", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });
  const [numero, setNumero] = useState("");
  const ligar = useMutation({
    mutationFn: (n: number | null) => ligarFn({ data: { dealId, numero: n } }),
    onSuccess: (r) => {
      if (r.aviso) toast.info(r.aviso);
      else toast.success("Venda ligada");
      setNumero("");
      qc.invalidateQueries({ queryKey: ["conta-azul-negocio", dealId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const n = data?.negocio;
  if (!n) return null;
  const ligado = !!(n.ca_venda_id || n.ca_venda_numero);
  if (!ligado && !data?.podeLigar) return null;
  const nf = ROTULO_NF[String(n.ca_nf_status ?? "")];
  return (
    <Card className="space-y-2 p-4 text-[13px]">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <Link2 className="h-3.5 w-3.5 text-primary" /> Conta Azul
      </h2>
      {ligado ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-muted-foreground">Venda</dt>
            <dd>
              nº {String(n.ca_venda_numero ?? "—")}
              {n.ca_situacao ? ` · ${String(n.ca_situacao).toLowerCase().replace(/_/g, " ")}` : ""}
              {!n.ca_venda_id ? " (aguardando leitura)" : ""}
            </dd>
            <dt className="text-muted-foreground">Faturamento</dt>
            <dd className={nf?.cor}>
              {nf?.texto ?? "—"}
              {n.ca_nf_numeros ? ` · NF ${String(n.ca_nf_numeros)}` : ""}
            </dd>
            <dt className="text-muted-foreground">Vendido</dt>
            <dd>{brl(n.amount)}</dd>
            <dt className="text-muted-foreground">Faturado</dt>
            <dd>{brl(n.ca_valor_faturado)}</dd>
          </dl>
          {data?.notas && data.notas.length > 0 && (
            <ul className="divide-y rounded border text-[12px]">
              {data.notas.map((x, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 px-2 py-1">
                  <span>
                    NF {String(x.numero_nfse ?? "—")} · {String(x.status ?? "").toLowerCase()}
                    {x.motivo_cancelamento ? ` · ${String(x.motivo_cancelamento)}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {x.data_competencia
                      ? new Date(`${String(x.data_competencia)}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                        )
                      : ""}{" "}
                    · {brl(x.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {n.ca_sincronizado_em ? (
            <p className="text-[11px] text-muted-foreground">
              Lido da Conta Azul em {new Date(String(n.ca_sincronizado_em)).toLocaleString("pt-BR")}
            </p>
          ) : null}
          {data?.podeLigar && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline"
              disabled={ligar.isPending}
              onClick={() => ligar.mutate(null)}
            >
              Desligar a venda
            </button>
          )}
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-[12px] text-muted-foreground">
            Ainda sem venda da Conta Azul. O Compass liga sozinho quando acha uma única venda da
            mesma empresa com o mesmo valor; se não, informe o número da venda.
          </p>
          <div className="flex gap-2">
            <Input
              className="h-8 max-w-[160px]"
              inputMode="numeric"
              placeholder="Nº da venda"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={!numero || ligar.isPending}
              onClick={() => ligar.mutate(Number(numero))}
            >
              Ligar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
