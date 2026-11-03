import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { runRdMirrorSlice, runRdTransform } from "@/lib/rd-master.functions";
import { Aborted, driveMirror, driveTransform, type TransformSlice } from "@/lib/rd/rd-drive";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Passo 1 da migração: espelhar o RD (empresas, contatos, negócios) e
 * transformar o espelho nos objetos do Compass. Veio da tela de Integrações
 * do CS para ficar junto da conferência e do histórico.
 */
export function EspelhoTransformacaoRd({ onTerminou }: { onTerminou?: () => void }) {
  const transformFn = useServerFn(runRdTransform);
  const mirrorFn = useServerFn(runRdMirrorSlice);
  const [transformOut, setTransformOut] = useState<(TransformSlice & { dryRun: boolean }) | null>(
    null,
  );
  // Onda 2 roda em fatias orquestradas pelo navegador: cada chamada é curta,
  // o laço fica aqui e o progresso aparece na tela. Funciona no preview do
  // Lovable, sem precisar publicar nem expor hooks.
  const [driveLog, setDriveLog] = useState<string[]>([]);
  const [driving, setDriving] = useState<"mirror" | "preview" | "transform" | null>(null);
  const driveAbort = useRef<AbortController | null>(null);
  const logLine = (line: string) => setDriveLog((l) => [...l.slice(-199), line]);
  const stopDrive = () => driveAbort.current?.abort();
  const runDrive = async (mode: "mirror" | "preview" | "transform") => {
    const ctl = new AbortController();
    driveAbort.current = ctl;
    setDriving(mode);
    setDriveLog([]);
    try {
      const mirrorCall = (body: Record<string, unknown>) =>
        mirrorFn({ data: body as never }) as ReturnType<Parameters<typeof driveMirror>[0]>;
      if (mode === "mirror") {
        const c = await driveMirror(mirrorCall, logLine, ctl.signal);
        toast.success(
          `Espelho do RD: ${c.organizations} empresas · ${c.contacts} contatos · ${c.deals} negócios`,
        );
      } else {
        const counts = (await mirrorCall({ counts: true })).counts!;
        const r = await driveTransform(
          (body) => transformFn({ data: body }),
          counts,
          mode === "preview",
          logLine,
          ctl.signal,
        );
        setTransformOut(r);
        toast.success(
          `${r.dryRun ? "Prévia" : "Transformação"}: ${(r.companies.created ?? 0) + (r.companies.updated ?? 0)} empresas · ${(r.contacts.created ?? 0) + (r.contacts.updated ?? 0)} contatos · ${(r.deals.created ?? 0) + (r.deals.updated ?? 0)} negócios`,
        );
        if (r.errors.length) toast.error(r.errors[0]);
      }
    } catch (e) {
      if (e instanceof Aborted) toast.message("Interrompido — pode retomar depois, é idempotente");
      else toast.error(e instanceof Error ? e.message : "Erro");
      logLine(e instanceof Error ? e.message : String(e));
    } finally {
      setDriving(null);
      onTerminou?.();
    }
  };
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Onda 2 — Empresas, Contatos e Negócios</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={driving !== null}
            onClick={() => runDrive("mirror")}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${driving === "mirror" ? "animate-spin" : ""}`} />
            {driving === "mirror" ? "Espelhando…" : "1 · Espelhar RD"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={driving !== null}
            onClick={() => runDrive("preview")}
          >
            {driving === "preview" ? "Calculando…" : "2 · Prévia"}
          </Button>
          <Button size="sm" disabled={driving !== null} onClick={() => runDrive("transform")}>
            <RefreshCw
              className={`mr-1 h-4 w-4 ${driving === "transform" ? "animate-spin" : ""}`}
            />
            {driving === "transform" ? "Transformando…" : "3 · Transformar"}
          </Button>
          {driving && (
            <Button size="sm" variant="ghost" onClick={stopDrive}>
              Interromper
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Projeta o espelho do RD (rd_organizations, rd_contacts, rd_deals) nos objetos compartilhados
        segundo docs/rd-field-map.json. Idempotente: rodar de novo só atualiza, e nunca sobrescreve
        campos editados à mão. Rode o espelho (1) antes; os três passos rodam em fatias e podem ser
        interrompidos e retomados. Mantenha esta aba aberta enquanto roda.
      </p>
      {driveLog.length > 0 && (
        <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-5">
          {driveLog.join("\n")}
        </pre>
      )}
      {transformOut && (
        <div className="grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Empresas</span>
            <br />
            {transformOut.companies.created} novas · {transformOut.companies.updated} atualizadas ·{" "}
            {transformOut.companies.linkedByKey ?? 0} ligadas por chave ·{" "}
            {transformOut.companies.csClientsUpdated ?? 0} clientes CS com campos do RD
          </div>
          <div>
            <span className="text-muted-foreground">Contatos</span>
            <br />
            {transformOut.contacts.created} novos · {transformOut.contacts.updated} atualizados ·{" "}
            {transformOut.contacts.semEmpresa ?? 0} sem empresa
          </div>
          <div>
            <span className="text-muted-foreground">Negócios</span>
            <br />
            {transformOut.deals.created} novos · {transformOut.deals.updated} atualizados ·{" "}
            {transformOut.deals.wonFromStage ?? 0} marcados como ganhos
          </div>
          <div>
            <span className="text-muted-foreground">Revisão</span>
            <br />
            {transformOut.dedupe.parent ?? 0} vínculos mãe → filha sugeridos ·{" "}
            {transformOut.products} produtos
          </div>
          {transformOut.errors.length > 0 && (
            <div className="text-destructive sm:col-span-4">
              {transformOut.errors.slice(0, 3).join(" · ")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
