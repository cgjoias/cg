-- ============================================================
-- VALORES POR TIPO DE VENDA (Par / Unidade / Trio) — alianças
-- Rode UMA vez no Supabase: SQL Editor > New query > cole tudo > Run
-- (pode rodar de novo sem problema)
--
-- O que faz: cria a coluna "precos" na tabela produtos. Ela guarda, por peça,
-- algo como:  [{"rotulo":"Par","valor":60},{"rotulo":"Unidade","valor":45},{"rotulo":"Trio","valor":85}]
-- Peça sem essa coluna preenchida continua com preço único, como sempre.
--
-- DEPOIS DE RODAR: na Gestão > Produtos > "Importar planilha", envie a planilha
-- de Controle de Estoque e Vendas. Os valores da aba CATALOGO entram sozinhos
-- (você vê a prévia antes de aplicar).
-- ============================================================

alter table public.produtos add column if not exists precos jsonb;

-- Faz o Supabase reconhecer a coluna nova imediatamente.
notify pgrst, 'reload schema';
