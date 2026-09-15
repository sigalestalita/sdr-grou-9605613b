import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { concluirEmbeddedSignup, getEmbeddedSignupConfig } from "@/lib/whatsapp-accounts.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
 * Conectar um número que já roda no app WhatsApp Business do celular do SDR.
 *
 * O número não pode ser cadastrado à mão como os outros: ele já existe no
 * aparelho de alguém, e o aperto de mão passa por uma confirmação no próprio
 * celular. Quem conduz isso é o pop-up da Meta; o que volta para nós são duas
 * metades que chegam por caminhos diferentes e precisam ser juntadas:
 *
 *   * o `code`, pelo callback do FB.login;
 *   * o phone_number_id e o waba_id, por postMessage da janela da Meta.
 *
 * Nenhuma das duas serve sozinha, e a ordem de chegada não é garantida — daí
 * as duas metades ficarem em ref até completarem o par.
 */

// O fluxo de coexistência: sem isto a Meta abre o cadastro de número novo,
// que não serve — ele criaria outro número em vez de adotar o do celular.
const FEATURE_COEXISTENCIA = "whatsapp_business_app_onboarding";

type SessionInfo = { phoneNumberId: string; wabaId: string };

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: FbLoginResponse) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type FbLoginResponse = { authResponse?: { code?: string } | null; status?: string };

function carregarSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Não foi possível carregar o SDK da Meta"));
    document.body.appendChild(s);
  });
}

export function EmbeddedSignupButton() {
  const configFn = useServerFn(getEmbeddedSignupConfig);
  const concluirFn = useServerFn(concluirEmbeddedSignup);
  const qc = useQueryClient();

  const [dono, setDono] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);
  const sessao = useRef<SessionInfo | null>(null);
  const codigo = useRef<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["wa-embedded-signup-config"],
    queryFn: () => configFn(),
    staleTime: 5 * 60_000,
  });

  const concluir = useMutation({
    mutationFn: (p: { code: string; phoneNumberId: string; wabaId: string }) =>
      concluirFn({ data: { ...p, ownerUserId: dono || null } }),
    onSuccess: (r) => {
      toast.success(
        r.criada
          ? `Número ${r.numero ?? ""} conectado. O app do celular continua funcionando.`
          : `Número ${r.numero ?? ""} reconectado.`,
      );
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      setOcupado(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Falha ao concluir a conexão");
      setOcupado(false);
    },
  });

  // As duas metades chegaram: fecha o par e conclui, uma vez só.
  function tentarConcluir() {
    if (!codigo.current || !sessao.current || concluir.isPending) return;
    const p = { code: codigo.current, ...sessao.current };
    codigo.current = null;
    sessao.current = null;
    concluir.mutate(p);
  }

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!ev.origin.endsWith("facebook.com")) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d?.event === "CANCEL" || d?.event === "ERROR") {
          setOcupado(false);
          toast.error(d?.data?.error_message ?? "Conexão cancelada antes de terminar no celular.");
          return;
        }
        const info = d?.data ?? {};
        if (info.phone_number_id && info.waba_id) {
          sessao.current = { phoneNumberId: info.phone_number_id, wabaId: info.waba_id };
          tentarConcluir();
        }
      } catch {
        /* mensagem de outra origem do Facebook; ignora */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrir() {
    if (!cfg?.appId || !cfg?.configId) return;
    setOcupado(true);
    try {
      await carregarSdk(cfg.appId);
    } catch (e) {
      setOcupado(false);
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o SDK");
      return;
    }
    window.FB?.login(
      (r) => {
        const code = r?.authResponse?.code;
        if (!code) {
          setOcupado(false);
          return;
        }
        codigo.current = code;
        tentarConcluir();
      },
      {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: FEATURE_COEXISTENCIA,
          sessionInfoVersion: "3",
        },
      },
    );
  }

  if (!cfg) return null;

  if (!cfg.pronto) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-white/15 p-4">
        <p className="text-sm font-medium">Conectar os WhatsApp Business do time</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Falta configurar no ambiente:{" "}
          <code className="text-[11px]">{cfg.faltando.join(", ")}</code>. O App ID e o segredo estão
          em Configurações do app → Básico, no Meta for Developers; o config_id é criado em Login do
          Facebook para Empresas → Configurações.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-card/50 p-4">
      <p className="text-sm font-medium">Conectar os WhatsApp Business do time</p>
      <p className="mt-1 text-xs text-muted-foreground">
        O número continua funcionando no celular: as conversas passam a aparecer aqui também, e o
        disparo sai pelo número da própria pessoa. Tenha o aparelho em mãos — a Meta pede uma
        confirmação por leitura de QR code.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={dono} onValueChange={setDono}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="De quem é este número" />
          </SelectTrigger>
          <SelectContent>
            {cfg.pessoas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={abrir} disabled={ocupado || concluir.isPending}>
          <Smartphone className="mr-1 h-4 w-4" />
          {concluir.isPending ? "Concluindo…" : ocupado ? "Aguardando a Meta…" : "Conectar número"}
        </Button>
      </div>
    </div>
  );
}
