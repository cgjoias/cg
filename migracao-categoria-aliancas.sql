-- ============================================================
-- CATEGORIA "ALIANÇAS"
-- Rode UMA vez no Supabase: SQL Editor > New query > cole tudo > Run
--
-- Passa para a categoria Alianças todas as peças cujo nome começa com "Aliança"
-- e que hoje estão como Anéis. (Se preferir, é o mesmo efeito de importar a
-- planilha de novo: ela também move as alianças para a nova categoria.)
-- ============================================================
update public.produtos
   set categoria = 'aliancas', updated_at = now()
 where categoria = 'aneis'
   and (nome ilike 'aliança%' or nome ilike 'alianca%');
