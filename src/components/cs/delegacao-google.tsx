import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { statusDelegacaoGoogle } from "@/lib/google-agenda.functions";

/*
 * Agenda do time inteiro pelo Google Workspace (só a gestão vê). Mostra se a
 * chave da conta de serviço está no Compass e o ID do cliente + escopo que o
 * admin autoriza no Admin Console. Nada aqui é secreto.
 */
export function DelegacaoGoogle() {
  const fn = useServerFn(statusDelegacaoGoogle);
  const { data } = useQuery({ queryKey: ["delegacao-google"], queryFn: () => fn() });
  if (!data) return null;
  const copiar = (t: string) =>
    navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Google Workspace: agenda do time inteiro</h2>
        {data.configurada ? (
          <Badge variant="secondary">Chave no Compass</Badge>
        ) : (
          <Badge variant="outline">Não configurada</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Com a delegação em todo o domínio, o Compass lê a Google Agenda de cada pessoa do CS (só
        leitura), com título e convidados, sem ninguém precisar conectar.
      </p>
      {data.chaveInvalida && (
        <p className="text-xs text-destructive">
          O secret GOOGLE_SERVICE_ACCOUNT_JSON está preenchido, mas não é a chave JSON da conta de
          serviço. Cole o arquivo .json inteiro.
        </p>
      )}
      {!data.configurada ? (
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>
            Google Cloud Console → IAM e administrador → Contas de serviço → criar conta → Chaves →
            Adicionar chave → JSON. Ative a Google Calendar API no projeto.
          </li>
          <li>
            Lovable Cloud → Secrets: crie <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> com o conteúdo
            inteiro do arquivo .json (nunca cole a chave no chat).
          </li>
          <li>
            Admin Console → Segurança → Acesso e controle de dados → Controles de API → Delegação em
            todo o domínio → Adicionar: o ID do cliente (aparece aqui depois do passo 2) e o escopo
            abaixo.
          </li>
        </ol>
      ) : (
        <div className="space-y-1.5 text-xs">
          <p className="text-muted-foreground">
            No Admin Console → Segurança → Acesso e controle de dados → Controles de API → Delegação
            em todo o domínio → Adicionar:
          </p>
          {data.clientId && (
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">ID do cliente</span>
              <code className="truncate">{data.clientId}</code>
              <Button size="sm" variant="ghost" onClick={() => copiar(data.clientId!)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">Escopo</span>
            <code className="truncate">{data.escopo}</code>
            <Button size="sm" variant="ghost" onClick={() => copiar(data.escopo)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-muted-foreground">
            Depois, clique em Sincronizar na Agenda do CS. Se o Google recusar, o motivo aparece na
            agenda de cada pessoa.
          </p>
        </div>
      )}
    </Card>
  );
}
