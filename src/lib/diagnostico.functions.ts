import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Diagnóstico do Pipeline (só gestão): executa cada consulta que a tela do
 * kanban faz, com a sessão do usuário (como a tela) e com o serviço (para
 * contar o que a RLS esconde), e devolve contagens e tempos. Serve para
 * descobrir onde o carregamento está gastando tempo, sem adivinhar.
 */
type Step = { etapa: string; ms: number; resultado: string };

export const runPipelineDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const steps: Step[] = [];
    const time = async (etapa: string, fn: () => Promise<string>) => {
      const t = Date.now();
      try {
        const r = await fn();
        steps.push({ etapa, ms: Date.now() - t, resultado: r });
      } catch (e) {
        steps.push({
          etapa,
          ms: Date.now() - t,
          resultado: `ERRO: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    };
    const filter = "source.is.null,source.neq.campaign_upload";

    await time("Migration leads.oculto_sdr aplicada?", async () => {
      const { error } = await supabaseAdmin.from("leads").select("oculto_sdr").limit(1);
      return error ? `NÃO — ${error.message}` : "sim";
    });
    await time("Total de leads na tabela (serviço, ignora RLS)", async () => {
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true });
      return String(count ?? 0);
    });
    await time("Leads vindos do RD (rd_deal_id preenchido)", async () => {
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("rd_deal_id", "is", null);
      return String(count ?? 0);
    });
    await time("Leads ocultos do SDR (oculto_sdr = true)", async () => {
      const { count, error } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("oculto_sdr", true);
      return error ? `— (${error.message})` : String(count ?? 0);
    });
    await time("Leads que o Pipeline enxerga (sessão + filtro da tela)", async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or(filter);
      return error ? `ERRO ${error.message}` : String(count ?? 0);
    });
    let visible = 0;
    await time("Buscar 1ª página (1000) com as colunas do kanban — sessão", async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, company_name, stage_id, priority, score, source, created_at, form_payload",
        )
        .or(filter)
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (error) throw new Error(error.message);
      visible = data?.length ?? 0;
      const bytes = JSON.stringify(data ?? []).length;
      return `${visible} linhas · ${(bytes / 1024).toFixed(0)} KB`;
    });
    await time("Buscar 1ª página com TODAS as colunas (como era antes)", async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .or(filter)
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (error) throw new Error(error.message);
      return `${data?.length ?? 0} linhas · ${(JSON.stringify(data ?? []).length / 1024).toFixed(0)} KB`;
    });
    await time("Etapas do kanban (stages)", async () => {
      const { data, error } = await supabase.from("stages").select("*").order("position");
      if (error) throw new Error(error.message);
      return `${data?.length ?? 0}`;
    });
    await time("Perfis (profiles)", async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw new Error(error.message);
      return `${data?.length ?? 0}`;
    });
    await time("Regras de touch (app_settings)", async () => {
      const { error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "touch_rules")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return "ok";
    });
    await time("Leads com enriquecimento pendente (a tela tenta enriquecer ao abrir)", async () => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or(filter)
        .eq("enrichment_status", "pending");
      return String(count ?? 0);
    });
    await time("Interações de lead (tamanho da tabela)", async () => {
      const { count } = await supabaseAdmin
        .from("lead_interactions")
        .select("id", { count: "exact", head: true });
      return String(count ?? 0);
    });
    await time("Conversas de WhatsApp", async () => {
      const { count } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id", { count: "exact", head: true });
      return String(count ?? 0);
    });
    // Composição da base: de onde vieram os leads e quando entraram
    await time("Leads por origem (source) — top 15", async () => {
      const { data } = await supabaseAdmin.from("leads").select("source").limit(50000);
      const c = new Map<string, number>();
      for (const r of data ?? [])
        c.set(r.source ?? "(vazio)", (c.get(r.source ?? "(vazio)") ?? 0) + 1);
      return [...c.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    });
    await time("Leads por dia de entrada (created_at) — últimos 12 dias", async () => {
      const since = new Date(Date.now() - 12 * 86400000).toISOString();
      const { data } = await supabaseAdmin
        .from("leads")
        .select("created_at")
        .gte("created_at", since)
        .limit(50000);
      const c = new Map<string, number>();
      for (const r of data ?? []) {
        const d = String(r.created_at).slice(0, 10);
        c.set(d, (c.get(d) ?? 0) + 1);
      }
      const before = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .lt("created_at", since);
      return (
        `antes: ${before.count ?? 0} · ` +
        [...c.entries()]
          .sort()
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")
      );
    });
    await time("Leads com formulário × sem, e com RD × sem", async () => {
      const q = (fn: (q: any) => any) =>
        fn(supabaseAdmin.from("leads").select("id", { count: "exact", head: true }));
      const [comForm, comRd, comRdSemForm, semNada] = await Promise.all([
        q((x) => x.not("form_payload", "is", null)),
        q((x) => x.not("rd_deal_id", "is", null)),
        q((x) => x.not("rd_deal_id", "is", null).is("form_payload", null)),
        q((x) => x.is("rd_deal_id", null).is("form_payload", null)),
      ]);
      return `com formulário: ${comForm.count ?? 0} · com RD: ${comRd.count ?? 0} · com RD e sem formulário: ${comRdSemForm.count ?? 0} · sem RD e sem formulário: ${semNada.count ?? 0}`;
    });
    await time("Leads por aba da planilha (form_payload.sheet_tab) — top 10", async () => {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("form_payload")
        .not("form_payload", "is", null)
        .limit(50000);
      const c = new Map<string, number>();
      for (const r of data ?? []) {
        const tab = String(
          (r.form_payload as { sheet_tab?: string } | null)?.sheet_tab ?? "(sem aba)",
        );
        c.set(tab, (c.get(tab) ?? 0) + 1);
      }
      return [...c.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    });
    await time("Leads por etapa (stage) — visíveis na sessão", async () => {
      const [{ data: stages }, { data: leads }] = await Promise.all([
        supabase.from("stages").select("id, name"),
        supabase.from("leads").select("stage_id").limit(50000),
      ]);
      const name = new Map((stages ?? []).map((x) => [x.id, x.name]));
      const c = new Map<string, number>();
      for (const r of leads ?? []) {
        const k = name.get(r.stage_id as string) ?? "(sem etapa)";
        c.set(k, (c.get(k) ?? 0) + 1);
      }
      return [...c.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    });
    const total = steps.reduce((a, s) => a + s.ms, 0);
    return { steps, totalMs: total, at: new Date().toISOString() };
  });
