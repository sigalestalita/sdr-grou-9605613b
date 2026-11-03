-- Propostas comerciais pelo Compass: modelos editáveis, proposta gerada a
-- partir dos itens do negócio, link público para o cliente ver e dar ciência.
--
-- Antes: PPT feito à mão ou o "Modelo padrão" do RD (um texto com 5 tags), e
-- nem todos seguiam. Agora a proposta nasce do negócio, guarda uma cópia do
-- texto do modelo com que foi enviada (mudar o modelo não mexe nas já
-- enviadas) e registra quem abriu e quem aceitou.
--
-- Texto dos modelos em markdown simples: parágrafos, "- " para lista,
-- **negrito** e "## " para subtítulo. Variáveis entre chaves duplas, como
-- {{contato.nome}} e {{empresa.nome}} (lista em src/lib/propostas/render.ts).

-- ---------------------------------------------------------------------------
-- Itens do negócio: desconto e recorrência, como no RD
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS desconto_tipo text NOT NULL DEFAULT 'pct'
  CHECK (desconto_tipo IN ('pct', 'valor'));
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS desconto numeric(14,2) NOT NULL DEFAULT 0
  CHECK (desconto >= 0);
ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS recorrencia text NOT NULL DEFAULT 'unico'
  CHECK (recorrencia IN ('unico', 'mensal', 'anual'));

-- ---------------------------------------------------------------------------
-- Modelos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposta_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 120),
  descricao text,
  cor text NOT NULL DEFAULT '#f08a24',
  titulo text NOT NULL DEFAULT 'Proposta Comercial',
  introducao text NOT NULL DEFAULT '',
  condicoes text NOT NULL DEFAULT '',
  secoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rodape text NOT NULL DEFAULT '',
  codigo_nfse text,
  validade_dias smallint NOT NULL DEFAULT 10 CHECK (validade_dias BETWEEN 1 AND 365),
  padrao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'duplicado', 'importado', 'sistema')),
  ordem integer NOT NULL DEFAULT 100,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.proposta_modelos.secoes IS
  'Lista de {titulo, corpo} em ordem. Corpo em markdown simples com variáveis {{...}}.';

-- Histórico: cada salvar guarda a versão anterior.
CREATE TABLE IF NOT EXISTS public.proposta_modelo_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.proposta_modelos(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  conteudo jsonb NOT NULL,
  salvo_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modelo_id, versao)
);

CREATE OR REPLACE FUNCTION public.pode_propor(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_manager(_user_id)
      OR public.has_team(_user_id, 'comercial')
      OR public.has_team(_user_id, 'cs')
      OR public.pode_faturar(_user_id)
$$;

ALTER TABLE public.proposta_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposta_modelos_read ON public.proposta_modelos;
CREATE POLICY proposta_modelos_read ON public.proposta_modelos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS proposta_modelos_insert ON public.proposta_modelos;
CREATE POLICY proposta_modelos_insert ON public.proposta_modelos FOR INSERT TO authenticated
  WITH CHECK (public.pode_propor(auth.uid()));
DROP POLICY IF EXISTS proposta_modelos_update ON public.proposta_modelos;
CREATE POLICY proposta_modelos_update ON public.proposta_modelos FOR UPDATE TO authenticated
  USING (public.pode_propor(auth.uid())) WITH CHECK (public.pode_propor(auth.uid()));

ALTER TABLE public.proposta_modelo_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposta_modelo_versoes_read ON public.proposta_modelo_versoes;
CREATE POLICY proposta_modelo_versoes_read ON public.proposta_modelo_versoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS proposta_modelo_versoes_insert ON public.proposta_modelo_versoes;
CREATE POLICY proposta_modelo_versoes_insert ON public.proposta_modelo_versoes FOR INSERT TO authenticated
  WITH CHECK (public.pode_propor(auth.uid()));

-- Cada item do catálogo pode apontar o modelo que o descreve; uma proposta
-- com itens de modelos diferentes junta as seções dos dois.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS proposta_modelo_id uuid
  REFERENCES public.proposta_modelos(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Propostas
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.propostas_numero_seq START 1001;

CREATE TABLE IF NOT EXISTS public.propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.propostas_numero_seq') UNIQUE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid,
  modelo_id uuid REFERENCES public.proposta_modelos(id) ON DELETE SET NULL,
  modelo_versao integer,
  versao integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviada', 'visualizada', 'aceita', 'recusada', 'substituida', 'cancelada')),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- Tudo o que o cliente vê, congelado na hora de gerar.
  conteudo jsonb NOT NULL,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  valor_desconto numeric(14,2) NOT NULL DEFAULT 0,
  valor_impostos numeric(14,2) NOT NULL DEFAULT 0,
  valor_final numeric(14,2) NOT NULL DEFAULT 0,
  validade_ate date,
  enviada_em timestamptz,
  enviada_por uuid,
  enviada_para text,
  visualizada_em timestamptz,
  visualizacoes integer NOT NULL DEFAULT 0,
  aceita_em timestamptz,
  aceite jsonb,
  recusada_em timestamptz,
  recusa_motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, versao)
);
COMMENT ON COLUMN public.propostas.aceite IS
  '{nome, email, cargo, ip, user_agent, texto_ciencia} de quem aceitou pelo link.';
CREATE INDEX IF NOT EXISTS propostas_deal_idx ON public.propostas (deal_id);
CREATE INDEX IF NOT EXISTS propostas_status_idx ON public.propostas (status);

ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS propostas_read ON public.propostas;
CREATE POLICY propostas_read ON public.propostas FOR SELECT TO authenticated
  USING (public.pode_propor(auth.uid()));
DROP POLICY IF EXISTS propostas_insert ON public.propostas;
CREATE POLICY propostas_insert ON public.propostas FOR INSERT TO authenticated
  WITH CHECK (public.pode_propor(auth.uid()));
DROP POLICY IF EXISTS propostas_update ON public.propostas;
CREATE POLICY propostas_update ON public.propostas FOR UPDATE TO authenticated
  USING (public.pode_propor(auth.uid())) WITH CHECK (public.pode_propor(auth.uid()));
-- O cliente (sem login) só passa pelo servidor, com o token.

-- Aviso ao executivo quando o cliente abre ou aceita.
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta'
));

-- ---------------------------------------------------------------------------
-- Modelos iniciais (texto do RD, sem os "XX": pagamento e validade saem da
-- proposta)
-- ---------------------------------------------------------------------------
INSERT INTO public.proposta_modelos (nome, descricao, cor, titulo, introducao, condicoes, secoes, rodape, codigo_nfse, padrao, origem, ordem)
SELECT 'Modelo Padrão', 'Proposta simples, sem texto de produto.', '#21b5a8', 'Proposta Comercial',
  E'A/C: {{contato.nome}} | {{empresa.nome}}\nSeguem abaixo as condições da proposta comercial detalhada para sua avaliação:',
  E'**CONDIÇÕES GERAIS**\nForma de pagamento: {{pagamento}}\nValidade da proposta: {{validade}}',
  '[]'::jsonb,
  'Ficamos à disposição para qualquer dúvida em relação à proposta. Assim que for aprovada, avançaremos de imediato com as próximas etapas.',
  NULL, true, 'sistema', 10
WHERE NOT EXISTS (SELECT 1 FROM public.proposta_modelos WHERE nome = 'Modelo Padrão');

INSERT INTO public.proposta_modelos (nome, descricao, cor, titulo, introducao, condicoes, secoes, rodape, codigo_nfse, padrao, origem, ordem)
SELECT 'Licença PDA', 'Licenciamento do PDA Assessment (plataforma PDA Profile).', '#f08a24', 'Proposta Comercial',
  E'A/C: {{contato.nome}} | {{empresa.nome}}\nSeguem abaixo as condições da proposta comercial detalhada para sua avaliação:',
  E'**CONDIÇÕES GERAIS**\nForma de pagamento: {{pagamento}}\nValidade da proposta: {{validade}}',
  jsonb_build_array(
    jsonb_build_object('titulo', 'Objeto e Recursos', 'corpo', E'Trata-se da contratação de prestação de serviço de licenciamento do software PDA Assessment (Relatório de Análise de Perfil Comportamental) através da plataforma PDA Profile, denominada ("Licença PDA"). A Licença PDA terá seu consumo através de créditos adquiridos a partir desta proposta comercial.\nVigência da Licença = A Licença PDA tem validade de 12 (doze) meses para utilização da plataforma PDA Profile, a contar da data dessa compra.\n\n**PDA Assessment**\n- Painel exclusivo para administrar as aplicações e resultados, através de usuário e senha individual, 100% on-line – PDA Profile (https://pdaprofile.com/Paginas/Login/frmLogin.aspx);\n- Criação de divisão da plataforma em grupo (sub-bases/pastas) – usuários e senha individuais;\n- O consumo do crédito acontece no momento da emissão do 1º relatório para cada profissional. Não se consome crédito por preencher a avaliação;\n- Armazenamento de todas as informações de perfis comportamentais (base de dados/histórico) sigiloso e seguro, conforme LGPD;\n- Exportação dos resultados em formato PDF, Word e Excel;\n- Indicador de Consistência – Validade da análise através de controle de fidedignidade das informações preenchidas pelo profissional;\n- Criação de perfis de cargo comportamentais para compatibilizar com o perfil do profissional;\n- Recurso de Áudio Feedback – Explicação/interpretação dos indicadores do PDA Assessment através de áudio automático;\n- Plataforma PDA Profile está disponível em mais de 14 idiomas, tanto para gestão da plataforma, quanto para aplicação dos testes e geração de relatórios;\n- Está incluso nesta aplicação: Relatório de Análise de Perfil Comportamental, Relatório de compatibilidade com perfil de cargo comportamental (individual e grupal), Relatório de compatibilidade com competências comportamentais (individual e grupal), Relatório de Tendências grupais (comparação de grupo) e relatório de compatibilidade do perfil do Líder e Liderado;\n- O crédito pode ser utilizado para os produtos: Feedback 360 PDA e TOV (Teste de Orientação Vocacional). Para disponibilizar Feedback 360 ou TOV na plataforma a CONTRATANTE deverá solicitar para a CONTRATADA.\n\nFeedback 360 PDA: consome 1 (um) crédito por feedback. É opcional compatibilizar com o PDA Assessment, nessa opção consomem 2 (dois) créditos (PDA Assessment + Feedback 360 PDA).\nTeste de Orientação Vocacional (TOV): consome 1 (um) crédito. É obrigatório responder a avaliação PDA. É opcional gerar o relatório PDA Assessment, nessa opção consome mais 01 (um) créditos (Relatório TOV e Relatório de PDA Assessment).'),
    jsonb_build_object('titulo', 'Termos de compra', 'corpo', E'- Vigência da Licença = A Licença PDA tem validade de 12 (doze) meses para utilização da plataforma PDA Profile, a contar da data dessa compra. Em caso de não utilização dos créditos adquiridos no plano inicial contratado, após o período de 12 (doze) meses, os créditos expiram.\n- Recarga de Créditos = Durante a vigência da Licença poderão ser adquiridos créditos adicionais, através de pacotes com 10 créditos. O valor de cada pacote adicional com 10 créditos será conforme tabela de preço vigente. Em caso de compra de recargas à vigência da licença PDA não terá alteração, mantendo o prazo de validade inicial.\n- Renovação da Licença = Ao finalizar o período de 12 (doze) meses da Licença PDA poderá ter a renovação do plano, por mais 12 (doze) meses, conforme tabela de Licença PDA vigente no período. O saldo de créditos da Licença vigente expira na renovação. Em caso de NÃO renovação do plano, a plataforma PDA Profile ficará inativa e não terá mais acesso a consulta de relatórios já baixados e/ou relatórios adicionais que não consomem créditos.\n- A renovação não é automática, e será necessário o de acordo entre as partes através de uma nova proposta/aditivo de contrato firmado entre as partes.\n- Reajuste de Preço = Os índices de reajustes de preços são conforme o índice IPCA – Índice Nacional de Preços ao Consumidor Amplo, devidamente atualizado e informado pelo IBGE, no período, e indicador de ajuste de variação cambial do período.\n- Impostos = Os tributos e contribuições que forem devidos em decorrência dessa Proposta Comercial, existentes ou que venham a ser criados, bem como as respectivas majorações, mudanças de base de cálculo ou do período de apuração, reajustes e encargos moratórios, constituem ônus de responsabilidade do respectivo contribuinte, conforme definido na legislação tributária. Quando aplicável ou determinado pela legislação, a Contratante irá deduzir, reter e recolher os tributos devidos referente a esse Contrato, conforme alíquota estipulada para a localidade, descontando-se o valor recolhido do faturamento a ser pago pela Contratante à Contratada. Deve-se considerar os seguintes impostos, quando aplicáveis: 1,50% – IN SRF 23/86 e o artigo 714 do RIR/2018, 4,65% – IN SRF 459/2004, Artigo 1º, § 2º e 1% a 5% – ISSQN – Decreto 15.416/2006, Art 39º.\n- Rescisão: O presente Contrato poderá, a critério da Parte inocente, ser considerado rescindido de pleno direito, com efeitos imediatos, nas seguintes hipóteses: a) se, verificada a inadimplência total ou parcial de qualquer das disposições deste Contrato, a Parte inadimplente deixar de sanar/remediar referida violação dentro do prazo de 02 (dois) dias, contados da data de recebimento de notificação escrita emitida pela outra Parte; ou, b) na hipótese de falência ou recuperação judicial ou extrajudicial de qualquer uma das Partes; ou, c) o não cumprimento de qualquer das cláusulas de sigilo e confidencialidade. Na hipótese de rescisão ou extinção antecipada deste Contrato, sem justa causa, a contratante deverá quitar o valor integral desta proposta. As Partes acordam que na hipótese de rescisão ou extinção antecipada deste Contrato, a contratada não devolverá os valores pagos ou adiantados pela contratante. Na hipótese de rescisão ou não renovação deste Contrato, a contratante NÃO continuará com os dados e acessos a plataforma PDA Profile. Desta forma, não continuará detentora dos direitos de utilização do Software.')
  ),
  E'**DADOS GROU:**\nGROU INOVAÇÃO PARA GESTÃO DE PESSOAS LTDA, pessoa jurídica de direito privado, regularmente inscrita no CNPJ sob o nº 06.934.208/0001-64, com sede na Avenida Sen. Tarso Dutra, nº 605, sala 1501, Bairro Petrópolis, Porto Alegre/RS, CEP 90690-140.\n**Código de serviço para NFS-e:** 1.05 – Licenciamento ou cessão de direito de uso de programas de computação.',
  '1.05', false, 'sistema', 20
WHERE NOT EXISTS (SELECT 1 FROM public.proposta_modelos WHERE nome = 'Licença PDA');

INSERT INTO public.proposta_modelos (nome, descricao, cor, titulo, introducao, condicoes, secoes, rodape, codigo_nfse, padrao, origem, ordem)
SELECT 'Capacitação PDA', 'Certificação/capacitação PDA (suporte técnico e capacitação operacional).', '#f08a24', 'Proposta Comercial',
  E'A/C: {{contato.nome}} | {{empresa.nome}}\nSeguem abaixo as condições da proposta comercial detalhada para sua avaliação:',
  E'**CONDIÇÕES GERAIS**\nForma de pagamento: {{pagamento}}\nValidade da proposta: {{validade}}',
  jsonb_build_array(
    jsonb_build_object('titulo', 'Objeto e Recursos', 'corpo', E'Trata-se da contratação de prestação de serviço de suporte técnico e capacitação operacional para o sistema PDA Assessment, compreendendo a parametrização de perfis, configurações, extração de relatórios técnicos e orientação para interpretação dos dados gerados pela plataforma (o "Serviço").\n\n**CERTIFICAÇÃO PDA**\n- Formato: Online (Plataforma de Videoconferência Zoom)\n- Turma: Turma da Grou\n- Carga Horária: 09 horas – (3 dias de 3 horas)\n- Datas: conforme calendário oficial da Grou\n- Horário: conforme calendário oficial da Grou\n- Capacitadora: Trainer Oficial PDA Brasil\n- Pré-requisito: Realizar a aplicação da análise de perfil comportamental PDA.'),
    jsonb_build_object('titulo', 'Termos de compra', 'corpo', E'- Reajuste de Preço = Os índices de reajustes de preços são conforme o índice IPCA – Índice Nacional de Preços ao Consumidor Amplo, devidamente atualizado e informado pelo IBGE, no período, e indicador de ajuste de variação cambial do período.\n- Impostos = Os tributos e contribuições que forem devidos em decorrência dessa Proposta Comercial, existentes ou que venham a ser criados, bem como as respectivas majorações, mudanças de base de cálculo ou do período de apuração, reajustes e encargos moratórios, constituem ônus de responsabilidade do respectivo contribuinte, conforme definido na legislação tributária. Quando aplicável ou determinado pela legislação, a Contratante irá deduzir, reter e recolher os tributos devidos referente a esse Contrato, conforme alíquota estipulada para a localidade, descontando-se o valor recolhido do faturamento a ser pago pela Contratante à Contratada. Deve-se considerar os seguintes impostos, quando aplicáveis: 1,50% – IN SRF 23/86 e o artigo 714 do RIR/2018, 4,65% – IN SRF 459/2004, Artigo 1º, § 2º e 1% a 5% – ISSQN – Decreto 15.416/2006, Art 39º.\n- Alteração de turma: Será permitido troca de turma com prazo de 05 (cinco) dias úteis de antecedência do primeiro dia da certificação. Em caso de não comparecimento (no show) ou comparecimento parcial, sem justificativa, não será permitido remarcação.\n- Rescisão de Contrato: Em caso de cancelamento do contrato pela Contratante, após realização dos serviços contratados, sem quitação do valor deste contrato, deverá ser realizado o pagamento dos serviços executados até o momento, além de multa equivalente a 25% sobre o valor total do contrato.')
  ),
  E'**DADOS GROU:**\nGROU INOVAÇÃO PARA GESTÃO DE PESSOAS LTDA, pessoa jurídica de direito privado, regularmente inscrita no CNPJ sob o nº 06.934.208/0001-64, com sede na Avenida Sen. Tarso Dutra, nº 605, sala 1501, Bairro Petrópolis, Porto Alegre/RS, CEP 90690-140.\n**Código de serviço para NFS-e:** 1.07 – Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados.',
  '1.07', false, 'sistema', 30
WHERE NOT EXISTS (SELECT 1 FROM public.proposta_modelos WHERE nome = 'Capacitação PDA');

-- Licenças, recargas e avulso apontam para o modelo Licença PDA; certificação
-- e capacitação PDA para o de Capacitação.
UPDATE public.products p SET proposta_modelo_id = m.id
FROM public.proposta_modelos m
WHERE m.nome = 'Licença PDA' AND p.proposta_modelo_id IS NULL AND p.marca = 'PDA'
  AND p.subcategoria IN ('Licença', 'Partner', 'Recarga (pacote 10)', 'Partner (pacote 10)', 'Avulso');
UPDATE public.products p SET proposta_modelo_id = m.id
FROM public.proposta_modelos m
WHERE m.nome = 'Capacitação PDA' AND p.proposta_modelo_id IS NULL AND p.marca = 'PDA'
  AND p.subcategoria IN ('Certificação aberta', 'Certificação in company', 'Capacitação');
