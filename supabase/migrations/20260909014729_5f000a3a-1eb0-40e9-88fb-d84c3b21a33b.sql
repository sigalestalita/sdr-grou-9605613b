-- Onda 1 · CS — novos valores de enum.
-- Fica em migration própria: ALTER TYPE ... ADD VALUE não pode ser usado
-- na mesma transação em que o valor novo é referenciado.

-- Quarta cor da sinaleira: licença vencida / conta inativa. Sai do cálculo de
-- saúde e da cadência de sinaleira; entra na fila de reativação.
ALTER TYPE public.cs_signal ADD VALUE IF NOT EXISTS 'preto';

-- Compra por CPF (Grow Academy, certificação avulsa): a pessoa vira a
-- "empresa" do registro, com o mesmo contato associado.
ALTER TYPE public.cs_client_type ADD VALUE IF NOT EXISTS 'pessoa_fisica';