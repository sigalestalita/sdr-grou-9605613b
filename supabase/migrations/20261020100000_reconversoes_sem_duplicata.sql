-- Dados: a sincronização da planilha registrava a mesma reconversão a cada
-- rodada (a cada ~90 s), e o histórico de reconversões dos leads cresceu com
-- cópias repetidas. Fica uma entrada por linha da planilha (lead_id), a
-- primeira registrada. O código já não duplica mais.
UPDATE public.leads l
   SET form_payload = jsonb_set(l.form_payload, '{reconversoes}', u.lista)
  FROM (
    SELECT id,
           jsonb_agg(item ORDER BY ord) AS lista
      FROM (
        SELECT l2.id, e.item, e.ord,
               row_number() OVER (
                 PARTITION BY l2.id, COALESCE(e.item->>'lead_id', e.ord::text)
                 ORDER BY e.ord
               ) AS n
          FROM public.leads l2,
               jsonb_array_elements(l2.form_payload->'reconversoes') WITH ORDINALITY AS e(item, ord)
         WHERE jsonb_typeof(l2.form_payload->'reconversoes') = 'array'
      ) x
     WHERE n = 1
     GROUP BY id
  ) u
 WHERE l.id = u.id
   AND jsonb_array_length(l.form_payload->'reconversoes') <> jsonb_array_length(u.lista);
