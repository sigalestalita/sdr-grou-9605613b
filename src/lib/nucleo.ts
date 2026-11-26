import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * O contexto de quem pede, como o middleware de autenticação entrega. Os
 * núcleos das ações recebem isto, para a tela e a assistente rodarem a mesma
 * regra com o mesmo acesso (RLS) da pessoa.
 */
export type CtxNucleo = { supabase: SupabaseClient<Database>; userId: string };
