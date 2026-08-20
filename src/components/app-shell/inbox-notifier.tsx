import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { getInboxPulse } from "@/lib/inbox-alerts.functions";

const SOUND_KEY = "inbox:sound";
const DESKTOP_KEY = "inbox:desktop";
const BASE_TITLE = "Lidi · CRM Grou";

/** Bip curto (WebAudio) — não depende de arquivo de áudio. */
function playBeep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    gain.connect(ctx.destination);
    [880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.16);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* som é best-effort */
  }
}

export function InboxNotifier() {
  const fn = useServerFn(getInboxPulse);
  const navigate = useNavigate();
  const [sound, setSound] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const seen = useRef<Map<string, string> | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setSound(window.localStorage.getItem(SOUND_KEY) !== "0");
    setDesktop(window.localStorage.getItem(DESKTOP_KEY) === "1");
  }, []);

  const { data } = useQuery({
    queryKey: ["inbox-pulse"],
    queryFn: () => fn(),
    refetchInterval: 12000,
    refetchIntervalInBackground: true,
  });

  const conversations = useMemo(() => data?.conversations ?? [], [data]);
  const totalUnread = data?.totalUnread ?? 0;

  // título da aba pisca com o número de não lidas
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (flashTimer.current) window.clearInterval(flashTimer.current);
    if (totalUnread <= 0) {
      document.title = BASE_TITLE;
      return;
    }
    let on = true;
    document.title = `(${totalUnread}) 💬 Respostas no inbox`;
    flashTimer.current = window.setInterval(() => {
      on = !on;
      document.title = on ? `(${totalUnread}) 💬 Respostas no inbox` : BASE_TITLE;
    }, 2000);
    return () => {
      if (flashTimer.current) window.clearInterval(flashTimer.current);
    };
  }, [totalUnread]);

  // detecta novidades e avisa (toast + som + notificação do sistema)
  useEffect(() => {
    if (!data) return;
    const current = new Map(conversations.map((c) => [c.id, `${c.lastMessageAt ?? ""}:${c.unread}`]));
    if (seen.current === null) {
      seen.current = current; // primeira carga: só sincroniza, não alerta
      return;
    }
    const fresh = conversations.filter((c) => seen.current!.get(c.id) !== current.get(c.id));
    seen.current = current;
    if (fresh.length === 0) return;

    if (sound) playBeep();

    for (const c of fresh.slice(0, 3)) {
      const who = c.company ? `${c.leadName} · ${c.company}` : c.leadName;
      toast(`💬 ${who} respondeu`, {
        description: c.preview ?? "Nova mensagem no WhatsApp",
        duration: 15000,
        action: {
          label: "Responder",
          onClick: () => navigate({ to: "/whatsapp", search: { c: c.id } as never }),
        },
      });
      if (desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(`${who} respondeu`, {
            body: c.preview ?? "Nova mensagem no WhatsApp",
            tag: c.id,
          });
          n.onclick = () => {
            window.focus();
            navigate({ to: "/whatsapp", search: { c: c.id } as never });
          };
        } catch {
          /* ignore */
        }
      }
    }
  }, [data, conversations, sound, desktop, navigate]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    if (next) playBeep();
  }

  async function toggleDesktop() {
    if (desktop) {
      setDesktop(false);
      window.localStorage.setItem(DESKTOP_KEY, "0");
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error("Este navegador não suporta notificações de sistema.");
      return;
    }
    const perm =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") {
      toast.error("Permissão de notificação negada pelo navegador.");
      return;
    }
    setDesktop(true);
    window.localStorage.setItem(DESKTOP_KEY, "1");
    toast.success("Notificações do sistema ativadas.");
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate({ to: "/whatsapp" })}
        title={totalUnread > 0 ? `${totalUnread} mensagem(ns) sem resposta` : "Inbox em dia"}
        className={`relative flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
          totalUnread > 0
            ? "border-primary/50 bg-primary/10 text-primary animate-pulse"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
        {totalUnread > 0 && <span className="font-semibold">{totalUnread}</span>}
      </button>
      <button
        onClick={toggleSound}
        title={sound ? "Som ligado — clique para desligar" : "Som desligado — clique para ligar"}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={toggleDesktop}
        title={
          desktop
            ? "Notificações do sistema ativas — clique para desativar"
            : "Ativar notificações do sistema (mesmo com a aba em segundo plano)"
        }
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        {desktop ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
