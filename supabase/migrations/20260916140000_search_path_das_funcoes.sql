-- Fecha o alerta de segurança: função sem search_path fixo.
--
-- Uma função sem search_path resolve os nomes que usa pelo caminho de busca de
-- quem a chama. Quem conseguir criar um schema à frente de "public" nesse
-- caminho pode fazer a função usar uma tabela ou função dele no lugar da
-- nossa — e como parte destas roda em gatilho, no contexto de quem grava, é
-- por aí que um privilégio vira outro.
--
-- Não é hipótese exótica: é o aviso "Function Search Path Mutable" que o
-- Supabase levanta, e estas cinco são minhas. As que já tinham sido corrigidas
-- em migrations posteriores (phone_key, lead_is_rd_import,
-- leads_stamp_meeting_booked) ficam de fora ou repetem sem efeito colateral —
-- ALTER FUNCTION é idempotente.
--
-- A assinatura precisa bater: função de gatilho não tem argumento, as outras
-- levam o tipo da tabela.

ALTER FUNCTION public.deal_data_ganho(public.deals) SET search_path = public;
ALTER FUNCTION public.deals_sync_esteira() SET search_path = public;
ALTER FUNCTION public.lead_is_rd_import(public.leads) SET search_path = public;
ALTER FUNCTION public.leads_hide_rd_import() SET search_path = public;
ALTER FUNCTION public.leads_stamp_meeting_booked() SET search_path = public;
