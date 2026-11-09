/*
 * Campos que a segmentação de e-mail pode filtrar (lead, contato e empresa).
 * Os ids batem com o CASE de public.email_segmento_leads e
 * public.email_valores_campo (migração 20261109050000).
 */
export type CampoSegmento = {
  id: string;
  rotulo: string;
  grupo: "Lead" | "Contato" | "Empresa";
  numero?: boolean;
};

export const CAMPOS_SEGMENTO: CampoSegmento[] = [
  { id: "nome", rotulo: "Nome", grupo: "Lead" },
  { id: "email", rotulo: "E-mail", grupo: "Lead" },
  { id: "telefone", rotulo: "Telefone", grupo: "Lead" },
  { id: "cargo", rotulo: "Cargo", grupo: "Lead" },
  { id: "empresa_lead", rotulo: "Empresa (no lead)", grupo: "Lead" },
  { id: "segmento", rotulo: "Segmento", grupo: "Lead" },
  { id: "porte", rotulo: "Porte", grupo: "Lead" },
  { id: "localizacao", rotulo: "Localização", grupo: "Lead" },
  { id: "site", rotulo: "Site", grupo: "Lead" },
  { id: "origem", rotulo: "Origem", grupo: "Lead" },
  { id: "canal", rotulo: "Canal", grupo: "Lead" },
  { id: "campanha", rotulo: "Campanha", grupo: "Lead" },
  { id: "anuncio", rotulo: "Anúncio", grupo: "Lead" },
  { id: "formulario", rotulo: "Formulário", grupo: "Lead" },
  { id: "tipo", rotulo: "Tipo de lead", grupo: "Lead" },
  { id: "prioridade", rotulo: "Prioridade", grupo: "Lead" },
  { id: "score", rotulo: "Score", grupo: "Lead", numero: true },
  { id: "motivo_perda", rotulo: "Motivo de perda", grupo: "Lead" },
  { id: "demo_free", rotulo: "Demo Free", grupo: "Lead" },
  { id: "dono_rd", rotulo: "Dono no RD", grupo: "Lead" },
  { id: "contato_cargo", rotulo: "Cargo (contato)", grupo: "Contato" },
  { id: "departamento", rotulo: "Departamento", grupo: "Contato" },
  { id: "contato_cidade", rotulo: "Cidade (contato)", grupo: "Contato" },
  { id: "contato_estado", rotulo: "Estado (contato)", grupo: "Contato" },
  { id: "ciclo_vida", rotulo: "Ciclo de vida (contato)", grupo: "Contato" },
  { id: "interesse", rotulo: "Interesse", grupo: "Contato" },
  { id: "dor", rotulo: "Dor / interesse declarado", grupo: "Contato" },
  { id: "analista_pda", rotulo: "Analista PDA", grupo: "Contato" },
  { id: "empresa_nome", rotulo: "Nome da empresa", grupo: "Empresa" },
  { id: "empresa_segmento", rotulo: "Segmento da empresa", grupo: "Empresa" },
  { id: "empresa_porte", rotulo: "Porte da empresa", grupo: "Empresa" },
  { id: "empresa_cidade", rotulo: "Cidade da empresa", grupo: "Empresa" },
  { id: "empresa_estado", rotulo: "Estado da empresa", grupo: "Empresa" },
  { id: "empresa_funcionarios", rotulo: "Nº de funcionários", grupo: "Empresa", numero: true },
  { id: "empresa_dominio", rotulo: "Domínio da empresa", grupo: "Empresa" },
  { id: "empresa_ciclo", rotulo: "Ciclo de vida da empresa", grupo: "Empresa" },
];

export const IDS_CAMPOS = CAMPOS_SEGMENTO.map((c) => c.id) as [string, ...string[]];

export const OPERADORES = [
  { id: "contem", rotulo: "contém", valor: true },
  { id: "igual", rotulo: "é", valor: true },
  { id: "diferente", rotulo: "não é", valor: true },
  { id: "nao_contem", rotulo: "não contém", valor: true },
  { id: "comeca", rotulo: "começa com", valor: true },
  { id: "preenchido", rotulo: "está preenchido", valor: false },
  { id: "vazio", rotulo: "está vazio", valor: false },
  { id: "maior_igual", rotulo: "≥", valor: true, numero: true },
  { id: "menor_igual", rotulo: "≤", valor: true, numero: true },
] as const;
export type OperadorId = (typeof OPERADORES)[number]["id"];
export const IDS_OPERADORES = OPERADORES.map((o) => o.id) as [OperadorId, ...OperadorId[]];
