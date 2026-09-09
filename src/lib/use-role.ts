import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/users.functions";
import { useAuth } from "@/lib/use-auth";
import { canOpenPath, type AppRole, type AppTeam } from "@/lib/teams";

export function useCurrentRole() {
  const { user, loading: authLoading } = useAuth();
  const fn = useServerFn(getMyRole);
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: () => fn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const isSuperAdmin = !!data?.isSuperAdmin;
  const isGestao = !!data?.isGestao;
  const teams = (data?.teams ?? []) as AppTeam[];
  const roles = (data?.roles ?? []) as AppRole[];
  const canAccessAll = isSuperAdmin || isGestao;

  return {
    role: data?.role ?? null,
    roles,
    isSuperAdmin,
    isGestao,
    teams,
    /** Super admin e gestão acessam todos os módulos. */
    canAccessAll,
    canAccessTeam: (team: AppTeam | null) => team === null || canAccessAll || teams.includes(team),
    /** Pode abrir a rota (time ou papel, conforme src/lib/teams.ts). */
    canAccessPath: (pathname: string) => canOpenPath(pathname, { teams, roles, canAccessAll }),
    /** Item de menu: só gestão, por time, por papel — ou livre. */
    canSee: (item: { team?: AppTeam; roles?: AppRole[]; managerOnly?: boolean }) => {
      if (item.managerOnly) return canAccessAll;
      if (canAccessAll) return true;
      if (item.team && teams.includes(item.team)) return true;
      if (item.roles?.some((r) => roles.includes(r))) return true;
      return !item.team && !item.roles;
    },
    loading: authLoading || isLoading,
  };
}
