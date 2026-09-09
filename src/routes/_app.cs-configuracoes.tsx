import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/use-auth";
import { CsSettingsPanel } from "@/components/cs/cs-settings-panel";
import { listCsBoard } from "@/lib/cs.functions";

export const Route = createFileRoute("/_app/cs-configuracoes")({
  component: CsSettingsPage,
  head: () => ({
    meta: [
      { title: "Configurações CS | Grou Compass" },
      {
        name: "description",
        content:
          "Pesos do health score, SLA da jornada, roteamento automático e importação da carteira de CS.",
      },
    ],
  }),
});

function CsSettingsPage() {
  const boardFn = useServerFn(listCsBoard);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["cs-board", user?.id],
    queryFn: () => boardFn({}),
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">Configurações CS</h1>
        <p className="text-[12px] text-muted-foreground">
          Tudo que o playbook parametriza, editável sem deploy. Só a gestão salva.
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <CsSettingsPanel
          profiles={data?.profiles ?? []}
          weights={data?.weights}
          signalPoints={data?.signalPoints}
          options={data?.options}
          dailyTarget={data?.dailyTarget}
          evidence={data?.evidence}
          escalation={data?.escalation}
          sla={data?.sla}
          routing={data?.routing}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cs-board"] })}
        />
      )}
    </div>
  );
}
