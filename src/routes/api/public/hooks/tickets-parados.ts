import { createFileRoute } from "@tanstack/react-router";

/**
 * Avisa no sino o responsável por cada ticket do CS parado há 72 horas ou
 * mais (sem responsável, o CS da conta). Um aviso por parada. Chamado todo dia
 * pelo agendamento no banco, com o mesmo token do sync da sinaleira.
 */
export const Route = createFileRoute("/api/public/hooks/tickets-parados")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deveAvisar, diasParado, STATUS_EM_ABERTO } =
          await import("@/lib/cs/tickets-parados");
        // cs_tickets ainda não está nos tipos gerados
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const agora = new Date();

        const { data: tickets, error } = await db
          .from("cs_tickets")
          .select(
            "id, numero, titulo, status, updated_at, parado_avisado_em, responsavel_id, client_uid, cs_clients:client_uid(nome_empresa, cs_responsavel_id)",
          )
          .in("status", [...STATUS_EM_ABERTO]);
        if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });

        let avisados = 0;
        for (const t of (tickets ?? []) as Array<Record<string, unknown>>) {
          const base = {
            status: t.status as string,
            updatedAt: t.updated_at as string,
            paradoAvisadoEm: (t.parado_avisado_em as string | null) ?? null,
          };
          if (!deveAvisar(base, agora)) continue;
          const cliente = t.cs_clients as {
            nome_empresa?: string;
            cs_responsavel_id?: string | null;
          } | null;
          const para = (t.responsavel_id as string | null) ?? cliente?.cs_responsavel_id ?? null;
          if (!para) continue;
          const dias = diasParado(base, agora) ?? 3;
          const { error: nErr } = await db.from("notificacoes").insert({
            user_id: para,
            tipo: "ticket",
            titulo: `Ticket #${t.numero} parado há ${dias} dias`.slice(0, 200),
            corpo: `${cliente?.nome_empresa ?? t.client_uid} · ${t.titulo}`.slice(0, 2000),
            link: "/cs-tickets",
          });
          if (nErr) continue;
          // sem mexer em updated_at: o aviso não conta como movimento
          await db
            .from("cs_tickets")
            .update({ parado_avisado_em: agora.toISOString() })
            .eq("id", t.id);
          avisados++;
        }

        await supabaseAdmin.from("integration_logs").insert({
          provider: "cs_tickets",
          action: "tickets_parados",
          status: "success",
          detail: { em_aberto: (tickets ?? []).length, avisados } as never,
        });
        return Response.json({ ok: true, emAberto: (tickets ?? []).length, avisados });
      },
    },
  },
});
