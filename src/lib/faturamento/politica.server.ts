import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizarPolitica,
  resolverPolitica,
  type Politica,
  type PoliticaEfetiva,
} from "./politica";

/*
 * Leitura da política de faturamento no servidor — usada pelo módulo do ADM
 * e pelo registro de venda (fecharNegocio), que barra o ganho que já nasce
 * errado (cliente exige OC e veio sem, parcelado para quem só paga à vista).
 */

// company_faturamento e as funções novas ainda não estão nos tipos gerados.
export type Db = SupabaseClient;

export const POLITICA_COLS =
  "company_id, codigo_webmais, exige_oc, janela_emissao_inicio, janela_emissao_fim, prazo_tipo, prazo_valor, aceita_parcelamento, forma_pagamento, retencao_iss, retencao_irrf, retencao_pis, retencao_cofins, retencao_csll, retencao_inss, regime_tributario, inscricao_estadual, inscricao_municipal, emails_nf, ficha_url, ficha_recebida_em, observacoes, updated_at, updated_by";

export async function podeFaturar(db: Db, userId: string): Promise<boolean> {
  const { data } = await db.rpc("pode_faturar", { _user_id: userId });
  return !!data;
}

export type EmpresaFat = {
  id: string;
  uid: string | null;
  nome: string;
  cnpj: string | null;
  parent_company_id: string | null;
};

/** Política efetiva de uma empresa: a dela, completada pela da matriz. */
export async function carregarPolitica(
  db: Db,
  companyId: string,
): Promise<{
  empresa: EmpresaFat | null;
  matriz: { id: string; nome: string } | null;
  propria: Politica | null;
  efetiva: PoliticaEfetiva;
}> {
  const { data: empresaRow } = await db
    .from("companies")
    .select("id, uid, nome, cnpj, parent_company_id")
    .eq("id", companyId)
    .maybeSingle();
  const empresa = (empresaRow as EmpresaFat | null) ?? null;
  const parentId = empresa?.parent_company_id ?? null;

  const [{ data: politicas }, { data: matriz }] = await Promise.all([
    db
      .from("company_faturamento")
      .select(POLITICA_COLS)
      .in("company_id", parentId ? [companyId, parentId] : [companyId]),
    parentId
      ? db.from("companies").select("id, nome").eq("id", parentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rows = (politicas ?? []) as Array<Record<string, unknown>>;
  const propria = rows.find((r) => r.company_id === companyId) ?? null;
  const daMatriz = rows.find((r) => r.company_id === parentId) ?? null;

  return {
    empresa,
    matriz: (matriz as { id: string; nome: string } | null) ?? null,
    propria: propria ? normalizarPolitica(propria) : null,
    efetiva: resolverPolitica(propria, daMatriz),
  };
}
