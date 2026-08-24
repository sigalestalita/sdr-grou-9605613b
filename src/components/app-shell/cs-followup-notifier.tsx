import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { getCsFollowUpAgenda } from "@/lib/cs-follow-ups.functions";

const SOUND_KEY = "cs-fup:sound";

function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    gain.connect(ctx.destination);
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.18);
    });
    window.setTimeout(() => void ctx.close(), 1400);
  } catch {
    /* som é best-effort */
  }
}

/** Aviso na topbar quando chega a hora de um follow-up de CS do usuário logado. */
export function CsFollowUpNotifier() {
  const { user } = useAuth();
  const fn = useServerFn(getCsFollowUpAgenda);
  const navigate = useNavigate();
  const alerted = useRef<Set<string>>(new Set());
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setSound(window.localStorage.getItem(SOUND_KEY) !== "0");
  }, []);

  const { data } = useQuery({
    queryKey: ["cs-fup-pulse", user?.id],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setDate(to.getDate() + 1);
      return fn({ data: { from: from.toISOString(), to: to.toISOString() } });
    },
    enabled: !!user,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const mine = (data ? [...data.overdue, ...data.scheduled] : []).filter(
    (i) => !i.done && i.ownerId === data?.currentUserId,
  );
  const nowIso = new Date().toISOString();
  const due = mine.filter((i) => i.dueAt <= nowIso);

  useEffect(() => {
    const fresh = due.filter((i) => !alerted.current.has(i.key));
    if (fresh.length === 0) return;
    for (const i of fresh) alerted.current.add(i.key);
    if (sound) playChime();
    for (const i of fresh.slice(0, 3)) {
      toast(`⏰ Follow-up de CS: ${i.clientName}`, {
        description: i.title,
        duration: 20000,
        action: {
          label: "Abrir agenda",
          onClick: () => navigate({ to: "/cs-follow-ups" }),
        },
      });
    }
  }, [due, sound, navigate]);

  const count = due.length;

  return (
    <button
      onClick={() => navigate({ to: "/cs-follow-ups" })}
      title={
        count > 0
          ? `${count} follow-up(s) de CS na hora ou atrasado(s)`
          : "Follow-ups de CS em dia"
      }
      className={`relative flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
        count > 0
          ? "animate-pulse border-amber-500/50 bg-amber-500/10 text-amber-500"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
      {count > 0 && <span className="font-semibold">{count}</span>}
    </button>
  );
}
