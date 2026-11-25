import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookUser, Mail, Phone, StickyNote } from "lucide-react";
import { getCadastroContaAzul } from "@/lib/contaazul.functions";

const dataBr = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const cnpj = (c: string | null) =>
  c && c.length === 14
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : c;

/**
 * O que o financeiro anotou no cadastro do cliente na Conta Azul:
 * observações gerais, contatos e e-mails de cobrança. Só leitura — quem
 * muda é o financeiro, na Conta Azul. Some quando não há nada para mostrar
 * (sem cadastro ligado ou sem permissão).
 */
export function CadastroContaAzulCard({
  companyId,
  uid,
  semMoldura,
}: {
  companyId?: string | null;
  uid?: string | null;
  semMoldura?: boolean;
}) {
  const fn = useServerFn(getCadastroContaAzul);
  const { data } = useQuery({
    queryKey: ["conta-azul", "cadastro", companyId ?? null, uid ?? null],
    queryFn: () => fn({ data: { companyId: companyId ?? undefined, uid: uid ?? undefined } }),
    enabled: !!(companyId || uid),
    staleTime: 5 * 60_000,
  });
  const clientes = data?.clientes ?? [];
  if (!clientes.length) return null;
  const varios = clientes.length > 1;

  return (
    <section className={semMoldura ? "space-y-2 border-t pt-2" : "surface-panel space-y-3 p-4"}>
      <h2 className="section-label flex items-center gap-1">
        <BookUser className="h-3.5 w-3.5" /> Cadastro na Conta Azul
      </h2>
      {clientes.map((c) => (
        <div key={c.clienteId} className="space-y-2 text-[12px]">
          {varios && (
            <p className="font-medium">
              {c.nome ?? "Cliente"} {c.documento ? `· ${cnpj(c.documento)}` : ""}
            </p>
          )}
          {c.ativo === false && <p className="text-amber-600">Cadastro inativo na Conta Azul</p>}
          {c.observacoes ? (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="whitespace-pre-wrap break-words">{c.observacoes}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">Sem observações no cadastro.</p>
          )}
          {c.emailsCobranca.length > 0 && (
            <p className="flex items-start gap-1.5">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-muted-foreground">Cobrança e nota: </span>
                {c.emailsCobranca.join(", ")}
              </span>
            </p>
          )}
          {(c.email || c.telefone) && (
            <p className="flex items-start gap-1.5">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="break-all">{[c.email, c.telefone].filter(Boolean).join(" · ")}</span>
            </p>
          )}
          {c.outrosContatos.length > 0 && (
            <div>
              <p className="text-muted-foreground">Outros contatos</p>
              <ul className="mt-0.5 space-y-0.5">
                {c.outrosContatos.map((o, i) => (
                  <li key={i} className="break-words">
                    <span className="font-medium">{o.nome ?? "—"}</span>
                    {o.cargo ? ` (${o.cargo})` : ""}
                    {[o.email, o.telefone].filter(Boolean).length
                      ? ` · ${[o.email, o.telefone].filter(Boolean).join(" · ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(c.inscricaoEstadual || c.inscricaoMunicipal || c.endereco) && (
            <p className="text-muted-foreground">
              {[
                c.inscricaoEstadual && `IE ${c.inscricaoEstadual}`,
                c.inscricaoMunicipal && `IM ${c.inscricaoMunicipal}`,
                c.endereco,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Lido da Conta Azul em {dataBr(c.atualizadoEm)}. Para mudar, edite o cliente lá.
          </p>
        </div>
      ))}
    </section>
  );
}
