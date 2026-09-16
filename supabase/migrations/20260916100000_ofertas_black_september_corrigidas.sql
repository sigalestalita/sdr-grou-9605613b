-- Black September: as condições exatas da página, só as de quem ainda não é cliente.
--
-- Substitui a primeira versão, que eu montei a partir do resumo e saiu
-- diferente da página oficial em três pontos: a de empresa não tem "sem
-- mínimo", é a PRIMEIRA licença; a de consultoria pequena é "até 250" e não
-- "abaixo de 250"; e os 30% incluem o Programa Master Líder, não a capacitação
-- Analista PDA.
--
-- Fora isso, a decisão da gestão: a IA atende só quem AINDA NÃO é cliente.
-- As condições de cliente (renovação, recarga, R$ 99 por crédito) existem na
-- página, mas não entram aqui — quem cuida de cliente é o CS e o executivo de
-- carteira, e a IA oferecendo renovação atropelaria esse atendimento.
--
-- Fonte: https://biogrou.grougp.com.br/black-september

UPDATE public.app_settings
   SET value = jsonb_set(
         value,
         '{ofertas}',
         '[
           {
             "titulo": "20% OFF na abertura de novas licenças PDA a partir de 250 créditos",
             "detalhe": "Para consultorias que ainda não são clientes Grou.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "Abra sua licença PDA e ganhe uma Capacitação Analista PDA ao vivo",
             "detalhe": "Para licenças de até 250 créditos, de consultorias que ainda não são clientes Grou.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "20% OFF na abertura da sua primeira licença PDA",
             "detalhe": "Para empresas que ainda não são clientes Grou. A Black da Grou chegou dois meses antes.",
             "validoAte": "2026-09-30",
             "publico": "empresa"
           },
           {
             "titulo": "30% OFF em treinamentos, workshops e capacitações",
             "detalhe": "Todos os serviços Grou, incluindo o Programa Master Líder.",
             "validoAte": "2026-09-30",
             "publico": "todos"
           },
           {
             "titulo": "30/09 é o último dia da Black September",
             "detalhe": "Depois disso, voltamos à tabela cheia, inclusive em novembro. Use o prazo para criar urgência, sem inventar prorrogação.",
             "validoAte": "2026-09-30",
             "publico": "todos"
           }
         ]'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';
