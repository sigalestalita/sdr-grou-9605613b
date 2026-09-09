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
  Inbox,
  Home,
  SlidersHorizontal,
  Building2,
  Handshake,
  ListChecks,
  LineChart,
  Bot,
  Activity,
  CalendarDays,
  Search,
  Users,
  Mail,
  Link2,
  BookOpen,
  ShieldAlert,
  ChevronRight,
  Wand2,
} from "lucide-react";
import lidiLogo from "@/assets/lidi-logo-white.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, useCommandPalette } from "@/components/app-shell/command-palette";
import { InboxNotifier } from "@/components/app-shell/inbox-notifier";
import { CsFollowUpNotifier } from "@/components/app-shell/cs-followup-notifier";
import { useCurrentRole } from "@/lib/use-role";
import { TEAM_LABEL, teamForPath, type AppTeam } from "@/lib/teams";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof KanbanIcon;
  team?: AppTeam;
  managerOnly?: boolean;
  /** Outros prefixos de rota que mantêm o item ativo (ex.: página de registro). */
  also?: string[];
};

/*
 * Navegação no padrão HubSpot: os objetos compartilhados ficam no topo, sem
 * grupo, e cada área só lista o que é exclusivo dela. Enquanto Empresas e
 * Negócios ainda vivem em tabelas separadas (cs_clients / leads), cada item
 * aponta para a tela que hoje representa aquele objeto.
 */
const NAV_OBJECTS: NavItem[] = [
  { to: "/inicio", label: "Início", icon: Home },
  { to: "/cs", label: "Empresas", icon: Building2, team: "cs", also: ["/empresas"] },
  { to: "/kanban", label: "Negócios", icon: Handshake, team: "comercial", also: ["/lead"] },
  { to: "/cs-follow-ups", label: "Tarefas", icon: ListChecks, team: "cs" },
];

/*
 * Grupos por intenção, poucos itens em cada um. Só o grupo da página atual
 * abre por padrão; o que a pessoa abrir/fechar fica lembrado no navegador.
 * Canais = onde a conversa acontece · CS/Comercial = o trabalho de cada time ·
 * Referência = leitura · Administração = o sistema como um todo (usuários, geral).
 * O que é do CS — inclusive suas configurações e integrações — fica no grupo do CS.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Canais",
    items: [
      { to: "/whatsapp", label: "Caixa de entrada", icon: Inbox },
      { to: "/cs-emails", label: "E-mails", icon: Mail, team: "cs" },
      { to: "/cs-agenda", label: "Agenda", icon: CalendarDays, team: "cs" },
    ],
  },
  {
    label: "Customer Success",
    items: [
      { to: "/cs-kanban", label: "Kanban semanal", icon: KanbanIcon, team: "cs" },
      { to: "/cs-cadencia", label: "Cadência e sinaleira", icon: Activity, team: "cs" },
      {
        to: "/cs-dashboard",
        label: "Dashboard CS",
        icon: BarChart3,
        team: "cs",
        managerOnly: true,
      },
      { to: "/cs-integracoes", label: "Integrações", icon: Link2, team: "cs" },
      {
        to: "/cs-configuracoes",
        label: "Configurações CS",
        icon: SlidersHorizontal,
        team: "cs",
        managerOnly: true,
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      { to: "/dashboard", label: "Visão geral", icon: BarChart3, team: "comercial" },
      { to: "/agenda", label: "Agenda de FUPs", icon: CalendarDays, team: "comercial" },
      { to: "/cadencia", label: "Cadência", icon: Activity, team: "comercial" },
      { to: "/leads-analytics", label: "Performance", icon: LineChart, team: "comercial" },
      { to: "/analytics-chat", label: "Chat Analytics", icon: Bot, team: "comercial" },
    ],
  },
  {
    label: "Referência",
    items: [
      { to: "/cs-playbook", label: "Playbook CS", icon: BookOpen, team: "cs" },
      { to: "/playbook", label: "Playbook SDR", icon: BookOpen, team: "comercial" },
      { to: "/novidades", label: "Novidades", icon: Sparkles },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/usuarios", label: "Usuários", icon: Users, managerOnly: true },
      { to: "/configuracoes", label: "Configurações", icon: SettingsIcon, managerOnly: true },
    ],
  },
];

type NavStyle = "classico" | "flutuante";

function isActive(item: NavItem, currentPath: string) {
  const prefixes = [item.to, ...(item.also ?? [])];
  return prefixes.some((p) => currentPath === p || currentPath.startsWith(`${p}/`));
}

function AppShell() {
  const { user, loading } = useAuth();
  const role = useCurrentRole();
  const navigate = useNavigate();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const palette = useCommandPalette();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("sidebar:groups") ?? "{}") as Record<
        string,
        boolean
      >;
    } catch {
      return {};
    }
  });
  const toggleGroup = (label: string, open: boolean) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !open };
      try {
        window.localStorage.setItem("sidebar:groups", JSON.stringify(next));
      } catch {
        /* sem storage */
      }
      return next;
    });
  // Estilo do menu: clássico (colado na borda) ou flutuante "liquid glass".
  const [navStyle, setNavStyle] = useState<NavStyle>(() => {
    if (typeof window === "undefined") return "flutuante";
    return (window.localStorage.getItem("sidebar:style") as NavStyle | null) ?? "flutuante";
  });
  const glass = navStyle === "flutuante";
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("sidebar:style", navStyle);
  }, [navStyle]);

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

  const visibleObjects = role.loading ? [] : NAV_OBJECTS.filter(canSee);
  const visibleGroups = role.loading
    ? []
    : NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
        (g) => g.items.length > 0,
      );

  const paletteRoutes = [
    ...visibleObjects.map((i) => ({ to: i.to, label: i.label, group: "Objetos" })),
    ...visibleGroups.flatMap((g) =>
      g.items.map((i) => ({ to: i.to, label: i.label, group: g.label })),
    ),
  ];

  const currentTeam = teamForPath(currentPath) as AppTeam | null;
  const blocked = !role.loading && !role.canAccessTeam(currentTeam);

  const renderItem = (n: NavItem) => {
    const Icon = n.icon;
    const active = isActive(n, currentPath);
    return (
      <Link
        key={n.to}
        to={n.to}
        title={collapsed ? n.label : undefined}
        data-active={active || undefined}
        className={`group flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors ${
          collapsed ? "justify-center px-0" : "px-2.5"
        } ${
          active
            ? `font-medium text-sidebar-foreground ${glass ? "glass-item-active rounded-lg" : "bg-sidebar-accent"}`
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{n.label}</span>}
      </Link>
    );
  };

  return (
    <div className={`min-h-screen flex bg-surface ${glass ? "glass-bg" : ""}`}>
      <aside
        className={`${collapsed ? "w-[52px]" : "w-[228px]"} shrink-0 text-sidebar-foreground flex flex-col transition-[width] duration-150 ${
          glass
            ? "glass-nav sticky top-3 m-3 mr-0 h-[calc(100vh-1.5rem)] self-start rounded-2xl"
            : "border-r border-sidebar-border bg-sidebar"
        }`}
      >
        <div
          className={`h-12 shrink-0 flex items-center justify-between gap-2 border-b border-sidebar-border ${collapsed ? "px-2" : "px-3"}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <img src={lidiLogo} alt="Grou" className={collapsed ? "h-5 w-auto" : "h-6 w-auto"} />
            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                compass
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Recolher menu"
              className="rounded p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir menu"
            className="mx-auto mt-2 rounded p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {/* Objetos compartilhados */}
          {visibleObjects.length > 0 && (
            <div className="mb-3 space-y-0.5 border-b border-sidebar-border pb-3">
              {visibleObjects.map(renderItem)}
            </div>
          )}

          {/* Áreas */}
          {visibleGroups.map((group) => {
            const groupActive = group.items.some((n) => isActive(n, currentPath));
            const open = collapsed ? true : (openGroups[group.label] ?? groupActive);
            return (
              <div key={group.label} className="mb-2 last:mb-0">
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(group.label, open)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60"
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform ${open ? "rotate-90" : ""}`}
                      strokeWidth={2}
                    />
                    <span className="section-label flex-1 truncate text-sidebar-foreground/50">
                      {group.label}
                    </span>
                    {!open && (
                      <span className="rounded bg-sidebar-accent px-1 text-[10px] text-sidebar-foreground/60">
                        {group.items.length}
                      </span>
                    )}
                  </button>
                )}
                {open && (
                  <div className={`space-y-0.5 ${collapsed ? "" : "pl-1"}`}>
                    {group.items.map(renderItem)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-sidebar-border py-2 ${collapsed ? "px-1.5" : "px-2"}`}>
          <div
            className={`flex items-center gap-2 rounded-md px-1 py-1.5 ${collapsed ? "justify-center" : ""}`}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-foreground">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-sidebar-foreground/60">
                {user.email}
              </span>
            )}
          </div>
          <div className={`mt-1 flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
            <button
              onClick={() => setNavStyle(glass ? "classico" : "flutuante")}
              title={glass ? "Usar menu clássico" : "Usar menu flutuante (liquid glass)"}
              className="rounded-md px-1.5 py-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              {glass ? (
                <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Wand2 className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            <ThemeToggle
              showLabel={false}
              className="px-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            />
            <button
              onClick={signOut}
              title="Sair"
              className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${
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
        <header
          className={`flex h-12 shrink-0 items-center gap-3 px-4 ${
            glass
              ? "glass-bar sticky top-3 z-10 mx-3 mt-3 rounded-full"
              : "border-b border-border bg-background"
          }`}
        >
          <button
            onClick={() => palette.setOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Encontrar ou perguntar</span>
            <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <InboxNotifier />
            {role.canAccessTeam("cs") && <CsFollowUpNotifier />}
          </div>
        </header>
        <main className={`min-h-0 flex-1 overflow-auto ${glass ? "px-3 pb-3 pt-3" : ""}`}>
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
