import { useCurrentRole } from "@/lib/use-role";

/**
 * Rótulo do responsável pelo atendimento no inbox: "CS" para quem é apenas do
 * time de Customer Success, "SDR" para o comercial (e para quem vê os dois).
 */
export function useOwnerLabel(): "CS" | "SDR" {
  const { teams, isSuperAdmin, isGestao } = useCurrentRole();
  const csOnly =
    !isSuperAdmin && !isGestao && teams.includes("cs") && !teams.includes("comercial");
  return csOnly ? "CS" : "SDR";
}
