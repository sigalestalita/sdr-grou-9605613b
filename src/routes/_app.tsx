import { createFileRoute, Outlet, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  Kanban as KanbanIcon,
  Briefcase,
  BarChart3,
  Target,
  Route as RouteIcon,
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
  Menu,
  X,
  Upload,
  MessageCircle,
  Ticket,
  Receipt,
  Package,
  ClipboardList,
  BadgeDollarSign,
  GraduationCap,
} from "lucide-react";
import lidiLogo from "@/assets/lidi-logo-white.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, useCommandPalette } from "@/components/app-shell/command-palette";
import { InboxNotifier } from "@/components/app-shell/inbox-notifier";
import { NotificacoesBell } from "@/components/app-shell/notificacoes-bell";
import { CsFollowUpNotifier } from "@/components/app-shell/cs-followup-notifier";
import { useCurrentRole } from "@/lib/use-role";
import { useIsMobile } from "@/hooks/use-mobile";
import { TEAM_LABEL, teamForPath, type AppRole, type AppTeam } from "@/lib/teams";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof KanbanIcon;
  /** Time que vê o item (gestão vê tudo). */
  team?: AppTeam;
  /** Papéis que também veem o item, mesmo fora do time (ex.: executivo). */
  roles?: AppRole[];
  managerOnly?: boolean;
  /** Outros prefixos de rota que mantêm o item ativo (ex.: página de registro). */
  also?: string[];
};

/*
 * Menu por módulo. O que cada pessoa vê depende do time/papel:
 *  - SDR: grupos "SDR" e "Análise" — o menu original, com os mesmos nomes
 *    (Pipeline, Inbox, Agenda de FUPs, Cadência, Playbook SDR…).
 *  - Executivo (Comercial): além do SDR, os objetos Início, Empresas e Tarefas
 *    — a carteira que ele fechou e as tarefas que o CS aciona para ele.
 *  - CS: objetos + Canais + Customer Success.
 *  - Administrativo: fila de faturamento (conferir, faturar, receber) e relatório.
 *  - BI: as leituras analíticas de cada módulo (Performance SDR, Dashboard CS, Chat Analytics).
 *  - Administração: sistema (usuários, configurações) + referência de cada módulo (playbooks, novidades).
 *  - Gestão: tudo (itens repetidos entre módulos aparecem uma vez).
 */
const NAV_OBJECTS: NavItem[] = [
  { to: "/inicio", label: "Início", icon: Home },
  {
    to: "/cs",
    label: "Empresas",
    icon: Building2,
    team: "cs",
    roles: ["executivo"],
    also: ["/empresas"],
  },
  { to: "/cs-follow-ups", label: "Tarefas", icon: ListChecks, team: "cs", roles: ["executivo"] },
  {
    to: "/jornada",
    label: "Jornada do cliente",
    icon: RouteIcon,
    team: "cs",
    roles: ["executivo"],
  },
];

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "SDR",
    items: [
      { to: "/dashboard", label: "Visão geral", icon: BarChart3, team: "comercial" },
      { to: "/kanban", label: "Pipeline", icon: KanbanIcon, team: "comercial", also: ["/lead"] },
      { to: "/whatsapp", label: "WhatsApp", icon: Inbox, team: "comercial" },
      { to: "/agenda", label: "Agenda de FUPs", icon: CalendarDays, team: "comercial" },
      { to: "/cadencia", label: "Cadência", icon: Activity, team: "comercial" },
    ],
  },
  {
    label: "Canais",
    items: [
      { to: "/whatsapp", label: "Caixa de entrada", icon: Inbox, team: "cs" },
      { to: "/cs-emails", label: "E-mails", icon: Mail, team: "cs" },
      { to: "/cs-agenda", label: "Agenda", icon: CalendarDays, team: "cs" },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        to: "/comercial",
        label: "Visão geral",
        icon: BarChart3,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/comercial-pipeline",
        label: "Pipeline de negócios",
        icon: KanbanIcon,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/carteira-comercial",
        label: "Carteira comercial",
        icon: Briefcase,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/comercial-agenda",
        label: "Agenda",
        icon: CalendarDays,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/comercial-metas",
        label: "Metas",
        icon: Target,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/comissao",
        label: "Comissão",
        icon: BadgeDollarSign,
        team: "administrativo",
        roles: ["executivo"],
      },
    ],
  },
  {
    label: "Customer Success",
    items: [
      { to: "/cs-kanban", label: "Kanban semanal", icon: KanbanIcon, team: "cs" },
      { to: "/cs-cadencia", label: "Cadência e sinaleira", icon: Activity, team: "cs" },
      { to: "/cs-consultorias", label: "Consultorias", icon: Handshake, team: "cs" },
      { to: "/cs-whatsapp", label: "WhatsApp CS", icon: MessageCircle, team: "cs" },
      { to: "/cs-tickets", label: "Tickets", icon: Ticket, team: "cs" },
      {
        to: "/requerimentos",
        label: "Requerimentos",
        icon: ClipboardList,
        team: "cs",
        also: ["/requerimento"],
      },
      {
        to: "/cs-integracoes",
        label: "Integrações",
        icon: Link2,
        team: "cs",
        roles: ["executivo"],
      },
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
    // Faturamento: o ADM confere o ganho, emite a nota e acompanha o recebimento.
    label: "Administrativo",
    items: [
      { to: "/faturamento", label: "Faturamento", icon: Receipt, team: "administrativo" },
      {
        to: "/requerimentos",
        label: "Requerimentos",
        icon: ClipboardList,
        team: "administrativo",
        roles: ["trainer", "executivo"],
        also: ["/requerimento"],
      },
      {
        to: "/turmas",
        label: "Turmas",
        icon: GraduationCap,
        team: "administrativo",
        roles: ["trainer", "executivo"],
        also: ["/turma"],
      },
      {
        to: "/catalogo",
        label: "Catálogo",
        icon: Package,
        team: "administrativo",
        roles: ["executivo"],
      },
    ],
  },
  {
    // BI: leitura analítica de todos os módulos
    label: "BI",
    items: [
      { to: "/leads-analytics", label: "Performance SDR", icon: LineChart, team: "comercial" },
      {
        to: "/comercial-analise",
        label: "Análise comercial",
        icon: BarChart3,
        team: "comercial",
        roles: ["executivo"],
      },
      {
        to: "/cs-dashboard",
        label: "Dashboard CS",
        icon: BarChart3,
        team: "cs",
        managerOnly: true,
      },
      { to: "/analytics-chat", label: "Chat Analytics", icon: Bot, team: "comercial" },
    ],
  },
  {
    // Administração: sistema + referência de cada módulo (playbooks, novidades)
    label: "Administração",
    items: [
      { to: "/usuarios", label: "Usuários", icon: Users, managerOnly: true },
      { to: "/configuracoes", label: "Configurações", icon: SettingsIcon, managerOnly: true },
      { to: "/importar-rd", label: "Importar base do RD", icon: Upload, managerOnly: true },
      { to: "/playbook", label: "Playbook SDR", icon: BookOpen, team: "comercial" },
      { to: "/cs-playbook", label: "Playbook CS", icon: BookOpen, team: "cs" },
      { to: "/novidades", label: "Novidades", icon: Sparkles },
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
  // Visual do sistema: "flutuante" = vidro líquido no app inteiro (menu,
  // cabeçalho, cartões, campos, botões — via [data-ui="glass"] no <html>);
  // "classico" = o visual sólido de antes. Alternável na varinha do rodapé.
  const [navStyle, setNavStyle] = useState<NavStyle>(() => {
    if (typeof window === "undefined") return "flutuante";
    return (window.localStorage.getItem("sidebar:style") as NavStyle | null) ?? "flutuante";
  });
  const glass = navStyle === "flutuante";
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar:style", navStyle);
    document.documentElement.dataset.ui = glass ? "glass" : "classic";
    return () => {
      delete document.documentElement.dataset.ui;
    };
  }, [navStyle, glass]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  // No celular o menu vira gaveta sobre a tela; no desktop nada muda.
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  // Fecha a gaveta ao navegar: no celular o menu cobre a tela inteira, e
  // continuar aberto sobre a página recém-aberta não faz sentido.
  useEffect(() => {
    setDrawer(false);
  }, [router.state.location.pathname]);

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

  const canSee = (item: NavItem) => role.canSee(item);

  // Um item por rota: quem vê dois módulos (gestão) não vê "Inbox" e
  // "Caixa de entrada" apontando para o mesmo lugar.
  const seen = new Set<string>();
  const dedupe = (items: NavItem[]) =>
    items.filter((i) => {
      if (seen.has(i.to)) return false;
      seen.add(i.to);
      return true;
    });
  const visibleObjects = role.loading ? [] : dedupe(NAV_OBJECTS.filter(canSee));
  const visibleGroups = role.loading
    ? []
    : NAV_GROUPS.map((g) => ({ ...g, items: dedupe(g.items.filter(canSee)) })).filter(
        (g) => g.items.length > 0,
      );

  // No celular a gaveta abre sempre por extenso: recolher para 52px só faz
  // sentido quando o menu divide a tela com o conteúdo.
  const menuRecolhido = !isMobile && collapsed;

  // Barra inferior: os quatro primeiros destinos da pessoa + o menu completo.
  const atalhosMobile = [...visibleObjects, ...visibleGroups.flatMap((g) => g.items)].slice(0, 4);

  const paletteRoutes = [
    ...visibleObjects.map((i) => ({ to: i.to, label: i.label, group: "Objetos" })),
    ...visibleGroups.flatMap((g) =>
      g.items.map((i) => ({ to: i.to, label: i.label, group: g.label })),
    ),
  ];

  const currentTeam = teamForPath(currentPath) as AppTeam | null;
  const blocked = !role.loading && !role.canAccessPath(currentPath);

  const renderItem = (n: NavItem) => {
    const Icon = n.icon;
    const active = isActive(n, currentPath);
    return (
      <Link
        key={n.to}
        to={n.to}
        title={menuRecolhido ? n.label : undefined}
        data-active={active || undefined}
        className={`group flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors ${
          menuRecolhido ? "justify-center px-0" : "px-2.5"
        } ${
          active
            ? `font-medium text-sidebar-foreground ${glass ? "glass-item-active rounded-lg" : "bg-sidebar-accent"}`
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {!menuRecolhido && <span className="truncate">{n.label}</span>}
      </Link>
    );
  };

  return (
    // 100dvh + overflow-hidden: a rolagem fica dentro de <main>, e telas de
    // painéis (Inbox, Cadência, Visão geral) ganham altura definida para rolar
    // cada coluna por conta própria em vez de arrastar a página inteira. dvh e
    // não vh porque no iOS a barra do Safari some ao rolar e o vh pula junto.
    <div className={`flex h-[100dvh] overflow-hidden bg-surface ${glass ? "glass-bg" : ""}`}>
      {/* Fundo da gaveta: fecha ao tocar fora, como todo menu de celular. */}
      {drawer && (
        <button
          aria-label="Fechar menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}
      <aside
        className={`${collapsed ? "w-[228px] md:w-[52px]" : "w-[228px]"} shrink-0 text-sidebar-foreground flex flex-col fixed inset-y-0 left-0 z-50 border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:pt-0 md:pb-0 md:shadow-none md:transition-[width] md:duration-150 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        } ${
          glass
            ? "md:glass-nav md:m-3 md:mr-0 md:h-[calc(100dvh-1.5rem)] md:rounded-2xl md:border-0"
            : ""
        }`}
      >
        <div
          className={`h-12 shrink-0 flex items-center justify-between gap-2 border-b border-sidebar-border ${menuRecolhido ? "px-2" : "px-3"}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <img
              src={lidiLogo}
              alt="Grou"
              className={menuRecolhido ? "h-5 w-auto" : "h-6 w-auto"}
            />
            {!menuRecolhido && (
              <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                compass
              </span>
            )}
          </div>
          <button
            onClick={() => setDrawer(false)}
            title="Fechar menu"
            className="rounded p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Recolher menu"
              className="hidden rounded p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:block"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir menu"
            className="mx-auto mt-2 hidden rounded p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:block"
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
            const open = menuRecolhido ? true : (openGroups[group.label] ?? groupActive);
            return (
              <div key={group.label} className="mb-2 last:mb-0">
                {!menuRecolhido && (
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
                  <div className={`space-y-0.5 ${menuRecolhido ? "" : "pl-1"}`}>
                    {group.items.map(renderItem)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-sidebar-border py-2 ${menuRecolhido ? "px-1.5" : "px-2"}`}>
          <div
            className={`flex items-center gap-2 rounded-md px-1 py-1.5 ${menuRecolhido ? "justify-center" : ""}`}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-foreground">
              {initials}
            </span>
            {!menuRecolhido && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-sidebar-foreground/60">
                {user.email}
              </span>
            )}
          </div>
          <div className={`mt-1 flex items-center gap-1 ${menuRecolhido ? "flex-col" : ""}`}>
            <button
              onClick={() => setNavStyle(glass ? "classico" : "flutuante")}
              title={glass ? "Usar visual clássico" : "Usar visual de vidro (liquid glass)"}
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
                menuRecolhido ? "" : "flex-1"
              }`}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              {!menuRecolhido && "Sair"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] [height:calc(3rem+env(safe-area-inset-top))] md:pt-0 md:[height:3rem] ${
            glass ? "md:glass-bar md:z-10 md:mx-3 md:mt-3 md:rounded-full md:border-0" : ""
          }`}
        >
          <button
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => palette.setOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="truncate md:hidden">Buscar</span>
            <span className="hidden truncate md:inline">Encontrar ou perguntar</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:block">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <InboxNotifier />
            {role.canAccessTeam("cs") && <CsFollowUpNotifier />}
            <NotificacoesBell />
          </div>
        </header>
        <main
          className={`min-h-0 flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0 ${
            glass ? "md:px-3 md:pb-3 md:pt-3" : ""
          }`}
        >
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

        {/* Barra inferior: o que a pessoa mais usa fica a um toque, e o quinto
            botão abre o menu inteiro — nada fica inalcançável. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
          {atalhosMobile.map((n) => {
            const Icon = n.icon;
            const active = isActive(n, currentPath);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.75} />
                <span className="max-w-full truncate px-1">{n.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawer(true)}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
            <span>Menu</span>
          </button>
        </nav>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} routes={paletteRoutes} />
    </div>
  );
}
