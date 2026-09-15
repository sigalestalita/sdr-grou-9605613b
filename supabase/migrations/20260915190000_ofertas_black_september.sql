-- Antecipação da Black September: as ofertas que a IA pode citar até 30/09.
--
-- Entram como item com data de fim, e não na base de conhecimento em texto
-- livre. A diferença importa: no dia 1º de outubro elas somem sozinhas do
-- prompt. Foi exatamente por ficar em texto livre que uma campanha encerrada
-- continuou sendo oferecida.
--
-- O público separa as duas trilhas. Consultoria compra por faixa de crédito e
-- ganha condição própria; empresa e pessoa física não têm mínimo. Citar a
-- condição do outro público queima a oferta e cria expectativa errada.

UPDATE public.app_settings
   SET value = jsonb_set(
         value,
         '{ofertas}',
         '[
           {
             "titulo": "Novas licenças PDA acima de 250 créditos",
             "detalhe": "20% de desconto na abertura da licença, para consultorias que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "Novas licenças PDA abaixo de 250 créditos",
             "detalhe": "Abre a licença e ganha uma capacitação Analista PDA ao vivo, para consultorias que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "Novas licenças PDA, sem mínimo de créditos",
             "detalhe": "20% de desconto na abertura da licença, para empresas e pessoa física que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "empresa"
           },
           {
             "titulo": "30% em todos os serviços da Grou",
             "detalhe": "Vale para todo o portfólio de workshops, treinamentos e capacitações, incluindo a capacitação Analista PDA ao vivo. Para quem fechar até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "todos"
           }
         ]'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';

INSERT INTO public.app_settings (key, value)
SELECT 'whatsapp_ai_agent', jsonb_build_object('ofertas', '[]'::jsonb)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'whatsapp_ai_agent');

-- Template de campanha também vence.
--
-- O corpo aprovado na Meta é fixo: um template que diz "até 30 de setembro"
-- continuaria sendo disparado em outubro, prometendo uma condição encerrada.
-- É a mesma armadilha da oferta em texto livre, só que do outro lado.
--
-- Com data, o disparo inicial ignora o template vencido e cai no neutro.
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS valido_ate date;

COMMENT ON COLUMN public.whatsapp_templates.valido_ate IS
  'Último dia em que o template pode ser disparado. Depois disso o envio automático cai no template sem campanha.';
