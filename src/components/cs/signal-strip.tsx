import { CS_SIGNAL_LABEL, type CsSignal } from "@/lib/cs-types";

const DOT: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  sem_dado: "bg-muted-foreground/30",
};

/** Histórico visual da sinaleira (mais antiga -> mais recente). */
export function SignalStrip({
  history,
  weeks,
  size = "sm",
}: {
  history: CsSignal[];
  weeks?: string[];
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-4 w-4" : "h-2.5 w-2.5";
  return (
    <div className="flex items-center gap-1">
      {history.map((s, i) => (
        <span
          key={`${weeks?.[i] ?? i}`}
          title={`${weeks?.[i] ? `Semana de ${weeks[i]} — ` : ""}${CS_SIGNAL_LABEL[s] ?? s}`}
          className={`${dim} rounded-sm ${DOT[s] ?? DOT.sem_dado}`}
        />
      ))}
    </div>
  );
}
