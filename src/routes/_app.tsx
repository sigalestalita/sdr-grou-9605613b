import { createFileRoute, Outlet, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  Kanban as KanbanIcon,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  MessageCircle,
  LineChart,
  Bot,
  Activity,
  CalendarDays,
  Search,
  Users,
  HeartPulse,
  Mail,
  Link2,

} from "lucide-react";
import lidiLogo from "@/assets/lidi-logo-white.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, useCommandPalette } from "@/components/app-shell/command-palette";
import { InboxNotifier } from "@/components/app-shell/inbox-notifier";
import { useCurrentRole } from "@/lib/use-role";
import { TEAM_LABEL, teamForPath, type AppTeam } from "@/lib/teams";
import { ShieldAlert, ChevronRight } from "lucide-react";


export const Route = createFileRoute("/_app")({
  component: AppShell,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof KanbanIcon;
  team?: AppTeam;
  managerOnly?: boolean;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Comercial / SDR",
    items: [
      { to: "/dashboard", label: "Visão geral", icon: BarChart3, team: "comercial" },
      { to: "/kanban", label: "Pipeline", icon: KanbanIcon, team: "comercial" },
      { to: "/whatsapp", label: "Inbox", icon: MessageCircle, team: "comercial" },
      { to: "/agenda", label: "Agenda de FUPs", icon: CalendarDays, team: "comercial" },
      { to: "/cadencia", label: "Cadência", icon: Activity, team: "comercial" },
    ],
  },
  {
    label: "Customer Success",
    items: [
      { to: "/cs", label: "Carteira CS", icon: HeartPulse, team: "cs" },
      { to: "/cs-agenda", label: "Agenda CS", icon: CalendarDays, team: "cs" },
      { to: "/cs-emails", label: "E-mails CS", icon: Mail, team: "cs" },
      { to: "/whatsapp", label: "Inbox / Disparos CS", icon: MessageCircle, team: "cs" },
      { to: "/cs-integracoes", label: "Integrações CS", icon: Link2, team: "cs" },
    ],
  },

  {
    label: "Análise",
    items: [
      { to: "/leads-analytics", label: "Performance", icon: LineChart, team: "comercial" },
      { to: "/analytics-chat", label: "Chat Analytics", icon: Bot, team: "comercial" },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/usuarios", label: "Usuários", icon: Users, managerOnly: true },
      { to: "/configuracoes", label: "Configurações", icon: SettingsIcon, managerOnly: true },
      { to: "/novidades", label: "Novidades", icon: Sparkles },
    ],
  },
];


function AppShell() {
  const { user, loading } = useAuth();
  const role = useCurrentRole();
  const navigate = useNavigate();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const palette = useCommandPalette();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !user && !redirecting) {
      setRedirecting(true);
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate, redirecting]);

  if (loading || !user) {
    return (
      <div className="grid place-items-center min-h-screen text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/login" });
  }

  const currentPath = router.state.location.pathname;
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  const canSee = (item: NavItem) => {
    if (item.managerOnly) return role.canAccessAll;
    return role.canAccessTeam(item.team ?? null);
  };

  const visibleGroups = role.loading
    ? []
    : NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
        (g) => g.items.length > 0,
      );

  const paletteRoutes = visibleGroups.flatMap((g) =>
    g.items.map((i) => ({ to: i.to, label: i.label, group: g.label })),
  );

  const currentTeam = teamForPath(currentPath) as AppTeam | null;
  const blocked = !role.loading && !role.canAccessTeam(currentTeam);


  return (
    <div className="min-h-screen flex bg-surface">
      <aside
        className={`${collapsed ? "w-[52px]" : "w-[228px]"} shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col transition-[width] duration-150`}
      >
        <div
          className={`h-12 shrink-0 flex items-center justify-between gap-2 border-b border-sidebar-border ${collapsed ? "px-2" : "px-3"}`}
        >
          <span className="flex min-w-0 items-center rounded bg-foreground px-1.5 py-1 dark:bg-transparent dark:px-0 dark:py-0">
            <img src={lidiLogo} alt="Lidi" className={collapsed ? "h-5 w-auto" : "h-6 w-auto"} />
          </span>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Recolher menu"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir menu"
            className="mx-auto mt-2 rounded p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {visibleGroups.map((group) => {
            const groupActive = group.items.some(
              (n) => currentPath === n.to || currentPath.startsWith(`${n.to}/`),
            );
            const open = collapsed ? true : (openGroups[group.label] ?? groupActive);
            return (
              <div key={group.label} className="mb-2 last:mb-0">
                {!collapsed && (
                  <button
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [group.label]: !open }))
                    }
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60"
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                      strokeWidth={2}
                    />
                    <span className="section-label flex-1 truncate">{group.label}</span>
                    {!open && (
                      <span className="rounded bg-sidebar-accent px-1 text-[10px] text-muted-foreground">
                        {group.items.length}
                      </span>
                    )}
                  </button>
                )}
                {open && (
                  <div className={`space-y-0.5 ${collapsed ? "" : "pl-2"}`}>
                    {group.items.map((n) => {
                      const Icon = n.icon;
                      const active = currentPath === n.to || currentPath.startsWith(`${n.to}/`);
                      return (
                        <Link
                          key={n.to}
                          to={n.to}
                          title={collapsed ? n.label : undefined}
                          data-active={active || undefined}
                          className={`group flex h-8 items-center gap-2 rounded-md text-[13px] transition-colors ${
                            collapsed ? "justify-center px-0" : "px-2"
                          } ${
                            active
                              ? "bg-sidebar-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`}
                            strokeWidth={1.75}
                          />
                          {!collapsed && <span className="truncate">{n.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>


        <div className={`border-t border-sidebar-border py-2 ${collapsed ? "px-1.5" : "px-2"}`}>
          <div className={`flex items-center gap-2 rounded-md px-1 py-1.5 ${collapsed ? "justify-center" : ""}`}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{user.email}</span>
            )}
          </div>
          <div className={`mt-1 flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
            <ThemeToggle showLabel={false} className="px-1.5" />
            <button
              onClick={signOut}
              title="Sair"
              className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground ${
                collapsed ? "" : "flex-1"
              }`}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              {!collapsed && "Sair"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
          <button
            onClick={() => palette.setOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Buscar leads, empresas, páginas…</span>
            <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <InboxNotifier />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          {blocked ? (
            <div className="grid min-h-full place-items-center p-8">
              <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center">
                <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                  <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold text-foreground">Módulo restrito</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Este módulo pertence ao time{" "}
                  <strong className="text-foreground">
                    {currentTeam ? TEAM_LABEL[currentTeam] : "restrito"}
                  </strong>
                  . Você não faz parte dele — peça a um super admin para incluir seu usuário em
                  Configurações → Usuários.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  {paletteRoutes[0] && (
                    <Link
                      to={paletteRoutes[0].to}
                      className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Ir para {paletteRoutes[0].label}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} routes={paletteRoutes} />
    </div>
  );
}