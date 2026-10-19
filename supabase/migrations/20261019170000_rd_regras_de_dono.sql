-- Migração do RD: para onde vão os cards de quem tem cards no RD e não tem
-- (ou não terá) usuário no CRM — gente que saiu, contas genéricas ("Time
-- Adm"). A gestão define por nome do RD: um usuário do CRM que herda os
-- cards, ou "sem dono" (o card guarda só o nome original). Também serve para
-- corrigir uma ligação automática errada. Vale para dono, SDR e executivo
-- dos cards e para o autor do histórico; tem prioridade sobre o casamento
-- automático por nome/e-mail.
CREATE TABLE IF NOT EXISTS public.rd_regras_de_dono (
  nome_rd text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sem_dono boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR sem_dono)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rd_regras_de_dono TO authenticated;
GRANT ALL ON public.rd_regras_de_dono TO service_role;
ALTER TABLE public.rd_regras_de_dono ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rd_regras_de_dono_gestao" ON public.rd_regras_de_dono;
CREATE POLICY "rd_regras_de_dono_gestao" ON public.rd_regras_de_dono FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));
