import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FC = "https://api.firecrawl.dev/v2";

type Info = {
  site_url?: string;
  setor?: string;
  porte?: string;
  num_funcionarios?: number;
  linkedin_url?: string;
  cnpj?: string;
};

async function fc(path: string, body: unknown, key: string) {
  const r = await fetch(`${FC}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Firecrawl [${r.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Lê o site da empresa e preenche só os campos vazios (nunca sobrescreve). */
export const enriquecerEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("Chave do Firecrawl não configurada");
    const { supabase } = context;
    const { data: c, error } = await supabase
      .from("cs_clients")
      .select("client_uid,nome_empresa,site_url,setor,porte,num_funcionarios,linkedin_url,cnpj")
      .eq("client_uid", data.clientUid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Empresa não encontrada");

    let site = c.site_url?.trim() || "";
    if (!site) {
      const s = await fc("/search", { query: `${c.nome_empresa} site oficial`, limit: 3, country: "BR", lang: "pt" }, key);
      const results = s?.data?.web ?? s?.data ?? [];
      site = results.find((x: { url?: string }) => x.url && !/linkedin|facebook|instagram|wikipedia|glassdoor/.test(x.url))?.url ?? "";
      if (!site) throw new Error("Não achei o site da empresa. Preencha o site e tente de novo.");
    }
    if (!/^https?:\/\//.test(site)) site = `https://${site}`;

    const res = await fc(
      "/scrape",
      {
        url: site,
        onlyMainContent: false,
        formats: [
          {
            type: "json",
            prompt:
              "Extraia da empresa: setor de atuação (curto, em português), porte (Micro, Pequena, Média ou Grande), número aproximado de funcionários (inteiro), URL do LinkedIn da empresa e CNPJ se aparecer. Deixe vazio o que não souber.",
            schema: {
              type: "object",
              properties: {
                setor: { type: "string" },
                porte: { type: "string" },
                num_funcionarios: { type: "integer" },
                linkedin_url: { type: "string" },
                cnpj: { type: "string" },
              },
            },
          },
        ],
      },
      key,
    );
    const j: Info = res?.data?.json ?? res?.json ?? {};
    const upd: Record<string, unknown> = {};
    if (!c.site_url) upd.site_url = site;
    if (!c.setor && j.setor) upd.setor = j.setor;
    if (!c.porte && j.porte) upd.porte = j.porte;
    if (c.num_funcionarios == null && j.num_funcionarios && j.num_funcionarios > 0) upd.num_funcionarios = j.num_funcionarios;
    if (!c.linkedin_url && j.linkedin_url?.includes("linkedin.com")) upd.linkedin_url = j.linkedin_url;
    if (!c.cnpj && j.cnpj && j.cnpj.replace(/\D/g, "").length === 14) upd.cnpj = j.cnpj;

    if (Object.keys(upd).length) {
      const { error: e2 } = await supabase.from("cs_clients").update(upd).eq("client_uid", c.client_uid);
      if (e2) throw new Error(e2.message);
    }
    return { preenchidos: Object.keys(upd) };
  });
