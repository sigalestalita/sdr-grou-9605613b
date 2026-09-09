import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentRole } from "@/lib/use-role";
import { useAuth } from "@/lib/use-auth";

/**
 * Página de entrada por módulo: SDR cai no Pipeline (como sempre foi);
 * CS, executivos e gestão caem no Início.
 */
function Landing() {
  const { user, loading } = useAuth();
  const role = useCurrentRole();
  if (loading || (user && role.loading)) return null;
  if (!user) return <Navigate to="/login" />;
  const csSide = role.canAccessAll || role.teams.includes("cs") || role.roles.includes("executivo");
  return <Navigate to={csSide ? "/inicio" : "/kanban"} />;
}

export const Route = createFileRoute("/")({
  component: Landing,
});
