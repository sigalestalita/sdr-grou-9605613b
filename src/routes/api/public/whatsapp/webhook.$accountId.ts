import { createFileRoute } from "@tanstack/react-router";
import { LISIANE_USER_ID } from "@/lib/whatsapp-ai.functions";
import type { WaMirroredMessage } from "@/lib/whatsapp/provider-types";

// Mariana Borges cuida de consultoria; é o padrão quando a configuração está vazia.
const MARIANA_BORGES_USER_ID = "81068193-826f-42e8-8670-df87fcdfecf5";

// Webhook público de WhatsApp. URL estável:
//   https://<host>/api/public/whatsapp/webhook/<accountId>
// Cada conta tem seu próprio webhook_secret; provider.verifySignature valida.
// Salva mensagens recebidas e atualizações de status.

export const Route = createFileRoute("/api/public/whatsapp/webhook/$accountId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Verificação inicial do webhook Meta Cloud:
        //   GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || !challenge) {
          return new Response("bad request", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: account } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("metadata")
          .eq("id", params.accountId)
          .maybeSingle();
        const expected = (account?.metadata as { verify_token?: string } | null)?.verify_token;
        if (!expected || token !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request, params }) => {
        const accountId = params.accountId;
        const rawBody = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          headers[k] = v;
        });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");

        const { data: account } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("*")
          .eq("id", accountId)
          .maybeSingle();
        if (!account) return new Response("account not found", { status: 404 });

        const provider = getProvider(account.provider);
        if (
          provider.verifySignature &&
          !provider.verifySignature(rawBody, headers, account.webhook_secret)
        ) {
          return new Response("invalid signature", { status: 401 });
        }

        const accountConfig = {
          id: account.id,
          phone_number: account.phone_number,
          provider: account.provider,
          provider_instance_id: account.provider_instance_id,
          provider_base_url: account.provider_base_url,
          access_token: account.access_token,
          webhook_secret: account.webhook_secret,
          // Número pessoal de trabalho: espelha a conversa, não cria lead.
          espelhada: (account as { espelhada?: boolean }).espelhada === true,
          owner_user_id: account.owner_user_id ?? null,
        };

        let events;
        try {
          events = provider.parseWebhook(rawBody, headers, accountConfig);
        } catch (e) {
          console.error("[wa webhook] parse error", e);
          return new Response("parse error", { status: 400 });
        }

        /*
         * A Meta entrega tudo numa URL só.
         *
         * O webhook é configurado no APP, não em cada conta: todas as contas
         * assinadas naquele app mandam os eventos para o mesmo endereço. Com
         * um número por SDR, isso significa que a URL cadastrada na Meta é a
         * de uma conta qualquer e os eventos das outras chegam junto.
         *
         * Então quem manda é o phone_number_id do payload, não o id da URL. A
         * URL vira só o padrão, para o que não trouxer essa informação.
         */
        const contaPorNumero = new Map<string, typeof accountConfig>();
        async function contaDoEvento(phoneNumberId?: string) {
          if (!phoneNumberId || phoneNumberId === accountConfig.provider_instance_id) {
            return accountConfig;
          }
          const cache = contaPorNumero.get(phoneNumberId);
          if (cache) return cache;
          const { data: outra } = await supabaseAdmin
            .from("whatsapp_accounts")
            .select("*")
            .eq("provider_instance_id", phoneNumberId)
            .maybeSingle();
          if (!outra) return accountConfig;
          const cfg = {
            id: outra.id,
            phone_number: outra.phone_number,
            provider: outra.provider,
            provider_instance_id: outra.provider_instance_id,
            provider_base_url: outra.provider_base_url,
            access_token: outra.access_token,
            webhook_secret: outra.webhook_secret,
            espelhada: (outra as { espelhada?: boolean }).espelhada === true,
            owner_user_id: outra.owner_user_id ?? null,
          };
          contaPorNumero.set(phoneNumberId, cfg);
          return cfg;
        }

        /*
         * Eco e histórico da coexistência: juntados por número e gravados de
         * uma vez — o histórico chega em lotes de centenas de mensagens, e uma
         * por uma estouraria o tempo que a Meta espera pela resposta.
         */
        const espelhos = new Map<string, WaMirroredMessage[]>();

        for (const ev of events) {
          if (ev.kind === "message") {
            const alvo = await contaDoEvento(ev.data.toPhoneNumberId);
            await handleInbound(supabaseAdmin, alvo.id, alvo, ev.data, alvo.espelhada === true);
          } else if (ev.kind === "status") {
            await handleStatus(supabaseAdmin, ev.data);
          } else if (ev.kind === "mirror") {
            const chave = ev.data.toPhoneNumberId ?? "";
            espelhos.set(chave, [...(espelhos.get(chave) ?? []), ev.data]);
          } else if (ev.kind === "contact_sync") {
            const { sincronizarContato } = await import("@/lib/whatsapp/espelho.server");
            await sincronizarContato(supabaseAdmin, ev.data).catch((e) =>
              console.warn("[wa webhook] contato da agenda", e),
            );
          } else {
            /*
             * Campo novo (coexistência, entre outros): registra em vez de
             * descartar, para dar para ver o formato real antes de tratar.
             *
             * Nunca pode derrubar o webhook: se a tabela ainda não existe, a
             * Meta não tem culpa e a mensagem legítima do mesmo lote precisa
             * seguir. Por isso o try, e por isso o cast — os tipos gerados só
             * conhecem a tabela depois que a migration roda.
             */
            try {
              const db = supabaseAdmin as unknown as {
                from: (t: string) => {
                  insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
                };
              };
              await db.from("whatsapp_webhook_events").insert({
                account_id: account.id,
                field: ev.field,
                payload: ev.value ?? {},
              });
            } catch (e) {
              console.warn("[wa webhook] campo não tratado:", ev.field, e);
            }
          }
        }
        if (espelhos.size) {
          const { registrarEspelhos } = await import("@/lib/whatsapp/espelho.server");
          for (const [phoneNumberId, msgs] of espelhos) {
            const alvo = await contaDoEvento(phoneNumberId || undefined);
            await registrarEspelhos(supabaseAdmin, alvo, msgs);
          }
        }
        return Response.json({ ok: true, processed: events.length });
      },
    },
  },
});

async function handleInbound(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  accountId: string,
  accountConfig: {
    id: string;
    phone_number: string;
    provider: string;
    provider_instance_id: string | null;
    provider_base_url: string | null;
    access_token: string | null;
    webhook_secret: string;
  },
  msg: {
    providerMessageId: string;
    from: string;
    type: string;
    body?: string;
    mediaUrl?: string;
    mediaId?: string;
    mediaMime?: string;
    timestamp: number;
    senderName?: string;
  },
  espelhada = false,
) {
  /*
   * A Meta reentrega o webhook quando não recebe 200 rápido, e às vezes repete
   * mesmo sem erro. Sem esta porteira, cada reentrega criava outro balão do
   * lead e disparava a IA de novo — o que aparecia como duas respostas quase
   * iguais na mesma conversa.
   */
  if (msg.providerMessageId) {
    const { data: jaEntrou } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("provider_message_id", msg.providerMessageId)
      .limit(1)
      .maybeSingle();
    if (jaEntrou) return;
  }

  const phone = msg.from.replace(/\D+/g, "");

  /*
   * 1) acha contato → lead
   *
   * Aqui nascia o lead fantasma. A busca antiga comparava os dígitos do
   * webhook contra o telefone do lead como texto — e o lead que veio do
   * formulário está gravado "+55 (11) 95667-2656". Os oito dígitos finais
   * ficam partidos pelo hífen, o ilike não casava, e o webhook criava outro
   * lead com o nome do perfil do WhatsApp e sem e-mail.
   */
  const { acharLeadPorTelefone, acharContatoPorTelefone } =
    await import("@/lib/whatsapp/lead-match.server");

  let contact = await acharContatoPorTelefone(admin, phone);

  let leadId = (contact?.lead_id as string | null) ?? null;
  if (!leadId) {
    const leadMatch = await acharLeadPorTelefone(admin, phone, "id, phone");
    leadId = leadMatch?.id ?? null;
  }

  /*
   * Número espelhado: se o contato ainda não é lead, ele não vira lead.
   *
   * Nesse número escreve fornecedor, colega, família. Criar um card para cada
   * um suja o pipeline, e deixar a IA responder é pior ainda — ela se
   * apresentaria como a SDR para quem não é lead. Quando a SDR reconhecer que
   * o contato é lead de verdade, ela promove pela conversa.
   *
   * Se o número JÁ é de um lead conhecido, a conversa segue ligada a ele: é a
   * mesma pessoa, independente de por qual número escreveu.
   */
  const semLead = espelhada && !leadId;

  if (!contact) {
    const ins = await admin
      .from("whatsapp_contacts")
      .insert({ phone, name: msg.senderName ?? null, lead_id: leadId })
      .select("*")
      .single();
    contact = ins.data;
  }

  if (!leadId && !semLead) {
    // cria lead "incoming" automático pra não perder a mensagem
    const ins = await admin
      .from("leads")
      .insert({
        name: msg.senderName ?? `WhatsApp ${phone.slice(-4)}`,
        phone,
        source: "whatsapp_inbound",
      })
      .select("id")
      .single();
    leadId = ins.data?.id ?? null;
    if (!leadId) {
      console.warn("[wa webhook] falha ao criar lead, phone=", phone, ins.error);
      return;
    }
    if (contact) {
      await admin.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", contact.id);
    }
  }

  if (leadId) {
    const { ensureLeadRouted } = await import("@/lib/lead-routing.server");
    await ensureLeadRouted({ supabase: admin, leadId, actorUserId: null });
  }

  // 2) acha/cria conversa
  // Sem lead, quem identifica a conversa é o par conta + contato.
  let conv = leadId
    ? (await admin.from("whatsapp_conversations").select("*").eq("lead_id", leadId).maybeSingle())
        .data
    : contact
      ? (
          await admin
            .from("whatsapp_conversations")
            .select("*")
            .is("lead_id", null)
            .eq("account_id", accountId)
            .eq("contact_id", contact.id)
            .maybeSingle()
        ).data
      : null;
  if (!conv) {
    const { data: lead } = leadId
      ? await admin.from("leads").select("assigned_to").eq("id", leadId).maybeSingle()
      : { data: null };
    // Conversa espelhada nasce com o dono do número, que é quem atende ali.
    const { data: dono } = semLead
      ? await admin
          .from("whatsapp_accounts")
          .select("owner_user_id")
          .eq("id", accountId)
          .maybeSingle()
      : { data: null };
    const ins = await admin
      .from("whatsapp_conversations")
      .insert({
        lead_id: leadId,
        contact_id: contact?.id ?? null,
        account_id: accountId,
        assigned_user_id:
          lead?.assigned_to ??
          (dono as { owner_user_id?: string | null } | null)?.owner_user_id ??
          null,
        status: "open",
        // as never: a coluna passa a aceitar nulo na migration das conversas
        // espelhadas; os tipos gerados só sabem disso depois que ela roda.
      } as never)
      .select("*")
      .single();
    conv = ins.data;
  }
  if (!conv) return;

  // 3) baixa mídia recebida (áudio/imagem/vídeo/documento) para o storage privado
  const ts = new Date(msg.timestamp).toISOString();
  const { baixarMidia } = await import("@/lib/whatsapp/baixar-midia.server");
  const {
    mediaUrl,
    mediaMime,
    metadata: mediaMetadata,
  } = await baixarMidia(admin, accountConfig, {
    accountId,
    phone,
    providerMessageId: msg.providerMessageId,
    type: msg.type,
    mediaId: msg.mediaId,
    mediaUrl: msg.mediaUrl,
    mediaMime: msg.mediaMime,
  });

  // 4) grava mensagem
  const { error: erroInsercao } = await admin.from("whatsapp_messages").insert({
    conversation_id: conv.id,
    lead_id: leadId as string,
    sender_type: "lead",
    message_type: msg.type,
    body: msg.body ?? null,
    media_url: mediaUrl,
    media_mime: mediaMime,
    metadata: mediaMetadata,
    provider_message_id: msg.providerMessageId,
    status: "delivered",
    sent_at: ts,
    delivered_at: ts,
  });
  // Duas entregas simultâneas passam pela checagem do topo; o índice único
  // barra a segunda aqui. Nesse caso a mensagem já foi tratada, então para.
  if (erroInsercao) {
    if (erroInsercao.code === "23505") return;
    throw new Error(erroInsercao.message);
  }

  /*
   * Mensagem nova do lead não desfaz o bastão.
   *
   * Isto aqui abria "open" sempre, então bastava o lead responder para a
   * conversa que estava esperando uma pessoa voltar ao estado em que a IA
   * atende — e ela respondia por cima da SDR. Quem estava pendente continua
   * pendente; só conversa encerrada reabre.
   */
  let conversationStatus: "open" | "pending" =
    (conv as { status?: string | null }).status === "pending" ? "pending" : "open";
  let conversationAssignee = conv.assigned_user_id ?? null;

  // 4a) resposta a uma campanha de WhatsApp → avisa a SDR responsável e tira a IA da conversa
  /*
   * Número espelhado não gera aviso: a mensagem já tocou no celular da SDR,
   * que é a dona do número. O aviso sairia do número da Grou para o celular
   * dela — e voltaria aqui como mensagem recebida no número dela.
   */
  let isCampaignReply = false;
  if (leadId && !espelhada)
    try {
      const { maybeAlertCampaignReply } =
        await import("@/lib/whatsapp/campaign-reply-alert.server");
      const res = await maybeAlertCampaignReply({
        admin,
        leadId,
        conversationId: conv.id,
        replyText: msg.body ?? null,
      });
      isCampaignReply = res.isCampaignReply;
      if (isCampaignReply) {
        conversationStatus = "pending";
        conversationAssignee = conv.assigned_user_id ?? null;
      }
    } catch (e) {
      console.error("[wa webhook] campaign reply alert error", e);
    }

  // 4b) qualquer outra resposta do lead → avisa a SDR responsável no WhatsApp dela
  if (leadId && !isCampaignReply && !espelhada) {
    try {
      const { maybeAlertInboundReply } = await import("@/lib/whatsapp/inbound-reply-alert.server");
      await maybeAlertInboundReply({
        admin,
        leadId,
        conversationId: conv.id,
        assignedUserId: conv.assigned_user_id ?? null,
        replyText: msg.body ?? null,
        messageType: msg.type,
      });
    } catch (e) {
      console.error("[wa webhook] inbound reply alert error", e);
    }
  }

  await admin.from("whatsapp_contacts").update({ last_message_at: ts }).eq("id", contact!.id);

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message_at: ts,
      last_preview: msg.body?.slice(0, 200) ?? `[${msg.type}]`,
      unread_count: (conv.unread_count ?? 0) + 1,
      status: conversationStatus,
      assigned_user_id: conversationAssignee,
    })
    .eq("id", conv.id);

  /*
   * Daqui para baixo é a IA, e ela pressupõe lead.
   *
   * Numa conversa espelhada sem lead não há atendimento a conduzir: é a caixa
   * pessoal de trabalho da SDR. A IA se apresentando como ela para um
   * fornecedor seria pior do que não responder nada.
   */
  if (!leadId) return;

  /*
   * No número da SDR quem responde é ela, pelo celular.
   *
   * Mesmo para lead: a IA falando por um número pessoal se apresentaria como
   * a SDR, e responderia por cima do que ela já está digitando no aparelho.
   * O Compass só registra a conversa no card.
   */
  if (espelhada) return;

  // 4) resposta automática da IA quando habilitada
  try {
    const { data: aiCfg } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_ai_agent")
      .maybeSingle();
    const cfg = (aiCfg?.value ?? {}) as Record<string, unknown>;
    const autoReplyEnabled = cfg.enabled === true && cfg.autoReplyEnabled === true;
    const stopOnLeadReply = cfg.stopOnLeadReply !== false;
    const responseMaxPerConversation =
      typeof cfg.responseMaxPerConversation === "number" ? cfg.responseMaxPerConversation : 12;

    if (!autoReplyEnabled || !conv?.id || !leadId) return;

    // Respostas de campanha vão direto para a SDR humana (IA fica fora).
    if (isCampaignReply) return;

    if (conv.assumed_at && conv.assumed_by_user_id) return;

    const { data: recentMsgs } = await admin
      .from("whatsapp_messages")
      .select("sender_type")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const hasHumanTakeover = (recentMsgs ?? []).some((m) =>
      ["sdr", "agent", "human"].includes(m.sender_type),
    );
    if (hasHumanTakeover) return;

    if (stopOnLeadReply) {
      const agentReplies = (recentMsgs ?? []).filter((m) =>
        ["bot", "automation"].includes(m.sender_type),
      ).length;
      if (agentReplies >= responseMaxPerConversation) return;
    }

    /*
     * Quem a IA atende. Empresa só abaixo do corte de porte; consultoria
     * sempre. Fora disso o atendimento é humano desde o início, então a
     * conversa vai direto para o responsável sem a IA responder.
     */
    const { decidirAtendimento } = await import("@/lib/whatsapp/ai-elegibilidade");
    /*
     * Antes de decidir, tenta descobrir o que falta.
     *
     * Lead de campanha de WhatsApp chega sem tipo e sem porte — clique no
     * anúncio, telefone e às vezes um nome. Essas duas informações decidem a
     * condição que vale para ele e quem assume a conversa depois, e aparecem
     * na própria conversa. Só preenche o que está vazio: dado de formulário
     * vale mais do que dedução.
     */
    try {
      const { descobrirPerfilDoLead } = await import("@/lib/whatsapp-ai.functions");
      const { data: recentes } = await admin
        .from("whatsapp_messages")
        .select("sender_type, body")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(20);
      const perfil = await descobrirPerfilDoLead(admin, leadId, recentes ?? []);
      /*
       * Descobrir que é consultoria muda de dona.
       *
       * O lead que chega sem tipo cai na roleta entre as SDRs antes de alguém
       * saber o que ele é. Quando a conversa revela consultoria — ou corrige a
       * resposta errada do formulário — o lead precisa ir para a dona de
       * consultoria, mesmo já tendo responsável.
       */
      if (perfil?.leadType) {
        const { ensureLeadRouted, reavaliarDonoPorTipo } =
          await import("@/lib/lead-routing.server");
        if (perfil.leadType === "consultoria") {
          // Consultoria tem dona: corrige a rota mesmo se a roleta já entregou
          // o lead a outra pessoa antes de o tipo ser conhecido.
          await reavaliarDonoPorTipo({ supabase: admin, leadId });
        } else {
          // Empresa e pessoa física entram na roleta entre as SDRs. Sem isso o
          // lead do WhatsApp ficava na fila geral até alguém pegar na mão.
          await ensureLeadRouted({ supabase: admin, leadId });
        }
      }
    } catch (e) {
      console.warn("[wa webhook] falha ao descobrir perfil do lead", e);
    }

    const { data: leadRegra } = await admin
      .from("leads")
      .select("name, lead_type, company_size, linkedin_company_size, assigned_to, company_id")
      .eq("id", leadId)
      .maybeSingle();

    /*
     * Já é cliente?
     *
     * As condições que a IA conhece são de quem ainda não é cliente. Cliente
     * tem renovação, recarga e preço por crédito, e quem cuida disso é o CS e
     * o executivo de carteira — a IA oferecendo renovação atropelaria esse
     * atendimento e daria desconto que não é dela para dar.
     */
    const { clienteDoTelefone, transferirParaCs } = await import("@/lib/cs/atendimento.server");
    const cliente = await clienteDoTelefone(admin, phone, leadRegra?.company_id ?? null);
    const jaECliente = !!cliente;

    /*
     * Cliente escrevendo não é lead: é atendimento.
     *
     * A conversa muda de caixa na hora, para o CS responsável pela conta. Não
     * há lead para qualificar nem venda para fazer, e deixar isso na fila do
     * SDR só atrasa quem precisa de resposta. O histórico vai junto — é a
     * mesma conversa, em outra caixa.
     */
    if (cliente) {
      await transferirParaCs(
        admin,
        { id: conv.id, area: (conv as { area?: string | null }).area ?? "sdr" },
        cliente,
        `Mensagem recebida de ${cliente.nomeEmpresa}, que já é cliente.`,
      );
      /*
       * Daqui em diante quem responde é a IA do CS, não a do SDR.
       *
       * São configurações separadas: a do SDR qualifica e vende, a do CS
       * resolve e abre ticket. Deixar a do SDR falar com cliente faria ela
       * oferecer condição comercial para quem já comprou.
       */
      try {
        const { responderComoCs } = await import("@/lib/cs-ai.functions");
        const r = await responderComoCs(admin, conv.id);
        if (r?.resposta) {
          const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
          const provider = getProvider(accountConfig.provider);
          const registro = await admin
            .from("whatsapp_messages")
            .insert({
              conversation_id: conv.id,
              lead_id: leadId,
              sender_type: "bot",
              message_type: "text",
              body: r.resposta,
              metadata: { source: "cs_ai", ticket: r.ticket },
              status: "sending",
            })
            .select("id")
            .single();

          const envio = await provider.sendMessage({
            account: accountConfig,
            to: phone,
            type: "text",
            body: r.resposta,
          });

          await admin
            .from("whatsapp_messages")
            .update({
              provider_message_id: envio.providerMessageId || null,
              status: envio.status === "failed" ? "failed" : "sent",
              error: envio.error ?? null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", registro.data?.id ?? "00000000-0000-0000-0000-000000000000");

          await admin
            .from("whatsapp_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_preview: r.resposta.slice(0, 200),
            })
            .eq("id", conv.id);
        }
      } catch (e) {
        console.error("[wa webhook] IA do CS", e);
      }
      return;
    }

    const decisao = decidirAtendimento(
      {
        lead_type: leadRegra?.lead_type ?? null,
        company_size: leadRegra?.company_size ?? null,
        linkedin_company_size: leadRegra?.linkedin_company_size ?? null,
        assigned_to: leadRegra?.assigned_to ?? null,
        ja_e_cliente: jaECliente,
      },
      {
        empresaMaxFuncionarios:
          typeof cfg.empresaMaxFuncionarios === "number" ? cfg.empresaMaxFuncionarios : 100,
        consultoriaAtendeTudo: cfg.consultoriaAtendeTudo !== false,
      },
    );

    // Para quem vai o bastão: consultoria tem dona própria.
    const donoDoBastao =
      decisao.handoff === "consultoria"
        ? ((cfg.consultoriaHandoffUserId as string | null) ?? MARIANA_BORGES_USER_ID)
        : (leadRegra?.assigned_to ?? LISIANE_USER_ID);

    if (!decisao.atende) {
      conversationStatus = "pending";
      conversationAssignee = donoDoBastao;
      await admin
        .from("whatsapp_conversations")
        .update({
          assigned_user_id: donoDoBastao,
          status: "pending",
          unread_count: (conv.unread_count ?? 0) + 1,
          last_message_at: ts,
          last_preview: msg.body?.slice(0, 200) ?? `[${msg.type}]`,
        })
        .eq("id", conv.id);
      return;
    }

    /*
     * Uma resposta por vez.
     *
     * Quem escreve no WhatsApp escreve em pedaços: "Olá, quero informações" e,
     * um minuto depois, "Oie". Cada pedaço acorda o webhook, e antes disso os
     * dois acordavam a IA — saíam duas respostas quase idênticas.
     */
    /*
     * Quem escreve procurando vaga não é lead.
     *
     * Chega pelo mesmo anúncio e pelo mesmo número. Responder com educação,
     * dizer para onde mandar o currículo e desqualificar na hora poupa o tempo
     * da SDR e o da pessoa, que só quer saber o endereço do RH.
     */
    const { procuraEmprego } = await import("@/lib/whatsapp/busca-emprego");
    if (procuraEmprego(msg.body)) {
      const { encerrarComoCandidato } = await import("@/lib/whatsapp/candidato.server");
      await encerrarComoCandidato({
        admin,
        accountConfig,
        conversaId: conv.id,
        leadId,
        telefone: phone,
        nomeDoLead: leadRegra?.name ?? null,
      });
      return;
    }

    const { podeResponderAgora } = await import("@/lib/whatsapp/resposta-unica.server");
    const antesDeGerar = await podeResponderAgora(admin, conv.id, msg.providerMessageId);
    if (!antesDeGerar.responder) {
      console.info("[wa webhook] IA não respondeu:", antesDeGerar.motivo);
      return;
    }

    const { evaluateAiHandoffInternal, generateAutoReplyInternal } =
      await import("@/lib/whatsapp-ai.functions");
    const handoff = await evaluateAiHandoffInternal(admin, conv.id);
    if (handoff.shouldHandoff) {
      conversationStatus = "pending";
      conversationAssignee = donoDoBastao;

      const { passarBastaoParaHumano } = await import("@/lib/whatsapp/passar-bastao.server");
      await passarBastaoParaHumano({
        admin,
        conversaId: conv.id,
        leadId,
        donoDoBastao,
        motivo: handoff.reason,
        preview: msg.body ?? `[${msg.type}]`,
        unreadCount: (conv.unread_count ?? 0) + 1,
        origem: "ai_handoff",
      });

      if (handoff.suggestedReply) {
        const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
        const provider = getProvider(accountConfig.provider);
        const botMsg = await admin
          .from("whatsapp_messages")
          .insert({
            conversation_id: conv.id,
            lead_id: leadId,
            sender_type: "bot",
            message_type: "text",
            body: handoff.suggestedReply,
            metadata: { source: "ai_handoff", handoff_reason: handoff.reason },
            status: "sending",
          })
          .select("id")
          .single();

        const sendResult = await provider.sendMessage({
          account: accountConfig,
          to: phone,
          type: "text",
          body: handoff.suggestedReply,
        });

        await admin
          .from("whatsapp_messages")
          .update({
            provider_message_id: sendResult.providerMessageId || null,
            status: sendResult.status === "failed" ? "failed" : "sent",
            error: sendResult.error ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", botMsg.data?.id ?? "00000000-0000-0000-0000-000000000000");

        await admin
          .from("whatsapp_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_preview: handoff.suggestedReply.slice(0, 200),
            assigned_user_id: LISIANE_USER_ID,
            status: "pending",
          })
          .eq("id", conv.id);
      }

      return;
    }

    const aiResult = await generateAutoReplyInternal(admin, conv.id);
    const reply = aiResult?.reply?.trim();
    if (!reply) return;

    /*
     * Espera antes de responder.
     *
     * Resposta que chega em dois segundos entrega que é robô. A conta é do
     * começo ao fim: gerar já consumiu alguns segundos e a espera só completa
     * o que falta para o tempo configurado. Nada é gravado antes — se a
     * execução morrer aqui, não sobra mensagem pela metade.
     *
     * A espera também aperta o cerco à resposta duplicada: mensagem que o lead
     * mandar enquanto esperamos derruba esta execução na conferência abaixo, e
     * quem responde é a mais nova.
     */
    const { readAiAgentSettings } = await import("@/lib/whatsapp-ai.functions");
    const cfgResposta = await readAiAgentSettings(admin);
    const alvoMs = (cfgResposta.respostaDelaySegundos ?? 0) * 1000;
    if (alvoMs > 0) {
      const desdeAMensagem = Date.now() - new Date(ts).getTime();
      const TETO_DE_ESPERA_MS = 20_000;
      const esperar = Math.min(Math.max(alvoMs - desdeAMensagem, 0), TETO_DE_ESPERA_MS);
      if (esperar > 0) await new Promise((r) => setTimeout(r, esperar));
    }

    /*
     * Gerar a resposta leva alguns segundos, e é justamente nesses segundos
     * que a segunda mensagem do lead costuma chegar. Conferir de novo aqui é o
     * que evita a resposta duplicada de verdade.
     */
    const antesDeEnviar = await podeResponderAgora(admin, conv.id, msg.providerMessageId);
    if (!antesDeEnviar.responder) {
      console.info("[wa webhook] resposta descartada antes do envio:", antesDeEnviar.motivo);
      return;
    }
    const prometeuBastao = aiResult?.prometeuBastao === true;

    const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
    const provider = getProvider(accountConfig.provider);
    const botMsg = await admin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conv.id,
        lead_id: leadId,
        sender_type: "bot",
        message_type: "text",
        body: reply,
        metadata: { source: "ai_auto_reply" },
        status: "sending",
      })
      .select("id")
      .single();

    const sendResult = await provider.sendMessage({
      account: accountConfig,
      to: phone,
      type: "text",
      body: reply,
    });

    await admin
      .from("whatsapp_messages")
      .update({
        provider_message_id: sendResult.providerMessageId || null,
        status: sendResult.status === "failed" ? "failed" : "sent",
        error: sendResult.error ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", botMsg.data?.id ?? "00000000-0000-0000-0000-000000000000");

    await admin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: reply.slice(0, 200),
        status: prometeuBastao ? "pending" : "open",
      })
      .eq("id", conv.id);

    /*
     * A IA acabou de dizer que alguém vai assumir. Promessa feita, promessa
     * cumprida: transfere agora, em vez de esperar a próxima mensagem e avisar
     * de novo — que era exatamente o loop de combinar o mesmo combinado.
     */
    if (prometeuBastao) {
      const { passarBastaoParaHumano } = await import("@/lib/whatsapp/passar-bastao.server");
      await passarBastaoParaHumano({
        admin,
        conversaId: conv.id,
        leadId,
        donoDoBastao,
        motivo: "A IA avisou o lead de que uma pessoa assumiria a conversa.",
        preview: reply,
        unreadCount: conv.unread_count ?? 0,
        origem: "ai_promise",
      });
    }
  } catch (e) {
    console.error("[wa webhook] ai auto-reply error", e);
  }
}

async function handleStatus(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  st: { providerMessageId: string; status: string; error?: string; timestamp: number },
) {
  const ts = new Date(st.timestamp).toISOString();
  const patch: {
    status: string;
    delivered_at?: string;
    read_at?: string;
    error?: string | null;
  } = { status: st.status };
  if (st.status === "delivered") patch.delivered_at = ts;
  if (st.status === "read") patch.read_at = ts;
  if (st.status === "failed") patch.error = st.error ?? null;
  await admin
    .from("whatsapp_messages")
    .update(patch)
    .eq("provider_message_id", st.providerMessageId);
}

// helper só pro tipo
async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}
