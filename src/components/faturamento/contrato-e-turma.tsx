import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSignature, GraduationCap } from "lucide-react";
import {
  inscreverNaTurma,
  listarContratos,
  listarTurmas,
  solicitarContrato,
  STATUS_CONTRATO,
} from "@/lib/contratos-turmas.functions";
import { moeda } from "@/lib/comercial/metas";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
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

const ROTULO = Object.fromEntries(STATUS_CONTRATO.map((s) => [s.v, s.l]));

/**
 * Contrato do negócio. A solicitação pode vir antes, durante ou depois da
 * venda; leva o que a Fabi pede hoje por e-mail. Quem faz e envia é o ADM.
 */
export function ContratoDoNegocio({
  dealId,
  valor,
  fichaUrl,
}: {
  dealId: string;
  valor: number;
  fichaUrl: string | null;
}) {
  const fn = useServerFn(listarContratos);
  const { data } = useQuery({
    queryKey: ["contratos", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });
  const [abrindo, setAbrindo] = useState(false);

  return (
    <section className="surface-panel space-y-2 p-4">
      <h2 className="section-label flex items-center gap-1">
        <FileSignature className="h-3.5 w-3.5" /> Contrato
      </h2>
      {(data?.itens ?? []).map((c) => (
        <div key={c.id} className="rounded border px-2 py-1.5 text-[12px]">
          <p className="flex justify-between gap-2">
            <span className="font-medium">
              {c.tipo === "aditivo"
                ? "Aditivo"
                : c.tipo === "minuta_geral"
                  ? "Minuta geral"
                  : "Minuta"}
            </span>
            <span className="text-muted-foreground">{ROTULO[c.status] ?? c.status}</span>
          </p>
          {c.contratoUrl ? (
            <a
              href={c.contratoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              arquivo do contrato
            </a>
          ) : null}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setAbrindo(true)}>
        Pedir minuta / aditivo
      </Button>
      {abrindo && (
        <SolicitarContratoDialog
          dealId={dealId}
          valor={valor}
          fichaUrl={fichaUrl}
          onClose={() => setAbrindo(false)}
        />
      )}
    </section>
  );
}

function SolicitarContratoDialog({
  dealId,
  valor,
  fichaUrl,
  onClose,
}: {
  dealId: string;
  valor: number;
  fichaUrl: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(solicitarContrato);
  const [f, setF] = useState({
    tipo: "minuta" as "minuta" | "aditivo" | "minuta_geral",
    compra: "",
    vencimento: "",
    parcelamento: "",
    valor: valor ? String(valor) : "",
    contato: "",
    modelo: "",
    obs: "",
    ficha: fichaUrl ?? "",
    proposta: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const url = (s: string) => (s.trim() ? s.trim() : null);
  const salvar = useMutation({
    mutationFn: () =>
      fn({
        data: {
          dealId,
          tipo: f.tipo,
          compra: f.compra.trim() || null,
          vencimento: f.vencimento || null,
          regras_parcelamento: f.parcelamento.trim() || null,
          valor_bruto: f.valor ? Number(f.valor.replace(",", ".")) : null,
          contato_envio: f.contato.trim() || null,
          modelo_compra: f.modelo.trim() || null,
          observacoes: f.obs.trim() || null,
          ficha_url: url(f.ficha),
          proposta_url: url(f.proposta),
        },
      }),
    onSuccess: () => {
      toast.success("Pedido enviado ao ADM");
      qc.invalidateQueries({ queryKey: ["contratos"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const campo = (rotulo: string, k: keyof typeof f, ph = "", tipo = "text") => (
    <div className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      <Input
        type={tipo}
        value={String(f[k])}
        placeholder={ph}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedir minuta ou aditivo</DialogTitle>
          <DialogDescription>
            O que a Fabi precisa para montar o contrato. Ficha cadastral e proposta final vão como
            link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(
              [
                ["minuta", "Minuta"],
                ["aditivo", "Aditivo"],
                ["minuta_geral", "Minuta geral"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set("tipo", v)}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${
                  f.tipo === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Qual a compra</Label>
            <Textarea rows={2} value={f.compra} onChange={(e) => set("compra", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("Data de vencimento", "vencimento", "", "date")}
            {campo("Valor bruto", "valor", "18500")}
          </div>
          {campo("Regras de parcelamento", "parcelamento", "3x boleto, 30/60/90")}
          {campo(
            "Contato do responsável para envio do contrato",
            "contato",
            "Nome · e-mail · telefone",
          )}
          {f.tipo === "minuta_geral" && campo("Modelo de compra", "modelo")}
          {campo("Ficha cadastral (link)", "ficha", "https://fichacadastral.grougp.com.br/…")}
          {campo("Proposta comercial final (link)", "proposta", "https://drive.google.com/…")}
          <div className="space-y-1">
            <Label className="text-[11px]">Observações adicionais</Label>
            <Textarea rows={2} value={f.obs} onChange={(e) => set("obs", e.target.value)} />
          </div>
          {valor > 0 && Number(f.valor) !== valor && (
            <p className="text-[11px] text-muted-foreground">Valor do negócio: {moeda(valor)}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Enviando…" : "Enviar ao ADM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inscrever participantes do cliente numa turma aberta. A inscrição fica
 * pendente até o ADM aprovar (e só aprova se houver vaga).
 */
export function InscreverEmTurma({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const turmasFn = useServerFn(listarTurmas);
  const inscreverFn = useServerFn(inscreverNaTurma);
  const [aberto, setAberto] = useState(false);
  const [turmaId, setTurmaId] = useState("");
  const [texto, setTexto] = useState("");
  const { data } = useQuery({
    queryKey: ["turmas"],
    queryFn: () => turmasFn(),
    enabled: aberto,
  });
  const abertas = (data?.turmas ?? []).filter(
    (t) => t.status === "aberta" || t.status === "confirmada",
  );
  // Uma pessoa por linha: "Nome; e-mail; telefone"
  const participantes = texto
    .split("\n")
    .map((l) => l.split(/[;\t]/).map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([nome, email, telefone]) => ({
      nome,
      email: email && email.includes("@") ? email : null,
      telefone: telefone || null,
    }));
  const salvar = useMutation({
    mutationFn: () => inscreverFn({ data: { turmaId, dealId, participantes } }),
    onSuccess: () => {
      toast.success("Inscrições enviadas para o ADM aprovar");
      qc.invalidateQueries({ queryKey: ["turmas"] });
      setAberto(false);
      setTexto("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
        <GraduationCap className="mr-1 h-3.5 w-3.5" /> Inscrever em turma
      </Button>
      {aberto && (
        <Dialog open onOpenChange={(o) => !o && setAberto(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Inscrever em turma</DialogTitle>
              <DialogDescription>
                As inscrições ficam pendentes até o ADM aprovar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                value={turmaId}
                onChange={(e) => setTurmaId(e.target.value)}
              >
                <option value="">Escolha a turma</option>
                {abertas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {dataBr(t.inicio)}
                    {t.vagas ? ` · ${Math.max(t.vagas - t.aprovadas, 0)} vaga(s)` : ""}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <Label className="text-[11px]">
                  Participantes — um por linha: Nome; e-mail; telefone
                </Label>
                <Textarea
                  rows={6}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={"Ana Souza; ana@cliente.com.br; 11 99999-0000"}
                />
                <p className="text-[11px] text-muted-foreground">
                  {participantes.length} participante(s)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!turmaId || participantes.length === 0 || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                Inscrever
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
