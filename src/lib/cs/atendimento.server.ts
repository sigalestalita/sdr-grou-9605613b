/*
 * A conversa que muda de caixa.
 *
 * Quando quem escreve no WhatsApp já é cliente, não há lead para qualificar nem
 * venda para fazer: há um pedido, e quem responde é o CS responsável pela
 * conta. Até aqui essa conversa caía na caixa do SDR e ficava lá, esperando
 * alguém perceber que estava no lugar errado.
 *
 * A troca é de área, não de conversa: o histórico continua o mesmo, com as
 * mesmas mensagens. Só muda em qual caixa ela aparece e de quem ela é.
 */

export type ClienteDoTelefone = {
  clientUid: string;
  nomeEmpresa: string;
  csResponsavelId: string | null;
};

/**
 * Acha o cliente dono daquele telefone.
 *
 * Duas portas, porque o cliente escreve de onde quiser: o contato cadastrado no
 * CS, e a empresa ligada ao lead. A segunda pega o caso comum de alguém novo da
 * mesma empresa escrever pela primeira vez.
 */
export async function clienteDoTelefone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  telefone: string,
  companyId?: string | null,
): Promise<ClienteDoTelefone | null> {
  const { phoneKey } = await import("@/lib/whatsapp/phone");
  const chave = phoneKey(telefone);

  if (chave) {
    const { data: contato } = await admin
      .from("cs_contacts")
      .select("client_uid")
      .eq("phone_key", chave)
      .eq("ativo_no_cliente", true)
      .limit(1)
      .maybeSingle();
    const uid = (contato as { client_uid?: string } | null)?.client_uid;
    if (uid) return carregar(admin, uid);
  }

  if (companyId) {
    const { data: porEmpresa } = await admin
      .from("cs_clients")
      .select("client_uid")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    const uid = (porEmpresa as { client_uid?: string } | null)?.client_uid;
    if (uid) return carregar(admin, uid);
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carregar(admin: any, clientUid: string): Promise<ClienteDoTelefone | null> {
  const { data } = await admin
    .from("cs_clients")
    .select("client_uid, nome_empresa, cs_responsavel_id, ativo")
    .eq("client_uid", clientUid)
    .maybeSingle();
  const c = data as {
    client_uid: string;
    nome_empresa: string;
    cs_responsavel_id: string | null;
    ativo: boolean;
  } | null;
  if (!c || !c.ativo) return null;
  return {
    clientUid: c.client_uid,
    nomeEmpresa: c.nome_empresa,
    csResponsavelId: c.cs_responsavel_id,
  };
}

/**
 * Move a conversa para a caixa do CS, no nome de quem cuida da conta.
 *
 * Idempotente: conversa que já está no CS não é mexida de novo, senão cada
 * mensagem do cliente reescreveria o responsável e desfaria transferência
 * feita à mão.
 */
export async function transferirParaCs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  conversa: { id: string; area?: string | null },
  cliente: ClienteDoTelefone,
  motivo: string,
): Promise<boolean> {
  if ((conversa.area ?? "sdr") === "cs") return false;

  const agora = new Date().toISOString();
  await admin
    .from("whatsapp_conversations")
    .update({
      area: "cs",
      client_uid: cliente.clientUid,
      area_alterada_em: agora,
      area_motivo: motivo,
      // Sem responsável na conta, fica na fila do CS em vez de com ninguém.
      assigned_user_id: cliente.csResponsavelId ?? null,
      status: "open",
      updated_at: agora,
    } as never)
    .eq("id", conversa.id);

  // Fica na linha do tempo do cliente: é atendimento, e o CS mede por lá.
  await admin.from("cs_timeline_events").insert({
    client_uid: cliente.clientUid,
    author_id: cliente.csResponsavelId ?? null,
    event_type: "nota",
    channel: "whatsapp",
    title: "Conversa de WhatsApp recebida no CS",
    description: motivo,
    occurred_at: agora,
  } as never);

  return true;
}
