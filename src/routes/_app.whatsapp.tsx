import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, FileText, Megaphone, Zap, Settings2, BarChart3, Repeat, Bot, Bell } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsappLayout,
});

function WhatsappLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/whatsapp", label: "Inbox", icon: MessageCircle, exact: true },
    { to: "/whatsapp/metricas", label: "Métricas", icon: BarChart3, exact: false },
    { to: "/whatsapp/templates", label: "Templates", icon: FileText, exact: false },
    { to: "/whatsapp/campanhas", label: "Campanhas", icon: Megaphone, exact: false },
    { to: "/whatsapp/ia", label: "IA", icon: Bot, exact: false },
    { to: "/whatsapp/automacoes", label: "Automações", icon: Zap, exact: false },
    { to: "/whatsapp/fups", label: "FUPs", icon: Repeat, exact: false },
    { to: "/whatsapp/alertas", label: "Alertas SDR", icon: Bell, exact: false },
    { to: "/whatsapp/contas", label: "Contas", icon: Settings2, exact: false },
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-2 border-b border-border bg-background flex items-center gap-4 flex-wrap">
        <h1 className="page-title flex items-center gap-2 shrink-0">
          <MessageCircle className="h-4 w-4 text-primary" strokeWidth={1.75} /> Inbox
        </h1>
        <nav className="flex items-center gap-0.5 flex-wrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex h-7 items-center gap-1.5 px-2.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}