import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmarDescadastro, verDescadastro } from "@/lib/email-descadastro.functions";

export const Route = createFileRoute("/descadastro")({
  validateSearch: (s: Record<string, unknown>): { t?: string } =>
    typeof s.t === "string" ? { t: s.t } : {},
  head: () => ({
    meta: [{ title: "Descadastro · Grou" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Descadastro,
});

const MOTIVOS = [
  "Recebo e-mails demais",
  "O conteúdo não é relevante para mim",
  "Não me lembro de ter me cadastrado",
  "Outro motivo",
];

function Descadastro() {
  const { t } = Route.useSearch();
  const verFn = useServerFn(verDescadastro);
  const confirmarFn = useServerFn(confirmarDescadastro);
  const [estado, setEstado] = useState<
    | { fase: "carregando" }
    | { fase: "invalido" }
    | { fase: "confirmar"; email: string }
    | { fase: "feito" }
  >({ fase: "carregando" });
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!t || !/^[a-f0-9]{32}$/.test(t)) {
      setEstado({ fase: "invalido" });
      return;
    }
    verFn({ data: { t } })
      .then((r) =>
        setEstado(
          !r.valido
            ? { fase: "invalido" }
            : r.jaDescadastrado
              ? { fase: "feito" }
              : { fase: "confirmar", email: r.email },
        ),
      )
      .catch(() => setEstado({ fase: "invalido" }));
  }, [t, verFn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f9] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-[#0b1f3a] px-6 py-4 text-xl font-bold text-white">grou</div>
        <div className="space-y-4 p-6 text-[15px] text-[#1f2937]">
          {estado.fase === "carregando" && (
            <p className="flex items-center gap-2 text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          )}
          {estado.fase === "invalido" && (
            <p>
              Este link de descadastro não é válido. Se quiser parar de receber nossos e-mails,
              responda a qualquer um deles pedindo o descadastro.
            </p>
          )}
          {estado.fase === "feito" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> Pronto, você foi descadastrado.
              </p>
              <p className="text-[#6b7280]">
                Você não vai mais receber nossos e-mails de campanha.
              </p>
            </div>
          )}
          {estado.fase === "confirmar" && (
            <>
              <h1 className="text-lg font-semibold">Não quer mais receber nossos e-mails?</h1>
              <p className="text-[#6b7280]">
                O endereço <strong>{estado.email}</strong> deixará de receber as campanhas da Grou.
              </p>
              <div className="space-y-1.5">
                <p className="text-[13px] text-[#6b7280]">Se quiser, conte o motivo (opcional):</p>
                {MOTIVOS.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-[14px]">
                    <input
                      type="radio"
                      name="motivo"
                      checked={motivo === m}
                      onChange={() => setMotivo(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  try {
                    await confirmarFn({ data: { t: t!, motivo } });
                    setEstado({ fase: "feito" });
                  } finally {
                    setEnviando(false);
                  }
                }}
                className="w-full rounded-lg bg-[#1e4f9c] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {enviando ? "Descadastrando…" : "Confirmar descadastro"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
