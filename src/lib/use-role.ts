import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/users.functions";
import { useAuth } from "@/lib/use-auth";
import type { AppTeam } from "@/lib/teams";

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

  return {
    role: data?.role ?? null,
    isSuperAdmin,
    isGestao,
    teams,
    /** Super admin e gestão acessam todos os módulos. */
    canAccessAll: isSuperAdmin || isGestao,
    canAccessTeam: (team: AppTeam | null) =>
      team === null || isSuperAdmin || isGestao || teams.includes(team),
    loading: authLoading || isLoading,
  };
}
