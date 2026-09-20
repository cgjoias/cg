-- ============================================================
-- PRODUTOS + FOTOS (painel "Produtos" da página Gestão)
-- Rode UMA vez no Supabase: SQL Editor > New query > cole tudo > Run
-- (pode rodar de novo sem problema, não duplica nada)
--
-- Regras:
--   - Qualquer visitante LÊ os produtos (é o catálogo público).
--   - Só quem faz login (você, em gestao.html) cria, altera e exclui
--     produtos e envia/remove fotos.
-- ============================================================

create table if not exists public.produtos (
  id text primary key,
  ordem integer not null default 0,
  ativo boolean not null default true,
  categoria text not null,
  nome text not null,
  material text,
  preco numeric not null default 0,
  descricao text,
  codigo text,
  largura text,
  cor text,
  formato text,
  acabamento text,
  pedra text,
  detalhes text,
  tamanhos jsonb,
  tamanhos_feminino jsonb,
  tamanhos_masculino jsonb,
  variacoes jsonb,
  imagens jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.produtos enable row level security;

drop policy if exists "publico le produtos" on public.produtos;
drop policy if exists "logado cria produtos" on public.produtos;
drop policy if exists "logado altera produtos" on public.produtos;
drop policy if exists "logado exclui produtos" on public.produtos;

create policy "publico le produtos"
  on public.produtos for select
  to anon, authenticated
  using (true);

create policy "logado cria produtos"
  on public.produtos for insert
  to authenticated
  with check (true);

create policy "logado altera produtos"
  on public.produtos for update
  to authenticated
  using (true)
  with check (true);

create policy "logado exclui produtos"
  on public.produtos for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- FOTOS: pasta pública "produtos" (Storage)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "fotos: logado ve" on storage.objects;
drop policy if exists "fotos: logado envia" on storage.objects;
drop policy if exists "fotos: logado altera" on storage.objects;
drop policy if exists "fotos: logado exclui" on storage.objects;

create policy "fotos: logado ve"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'produtos');

create policy "fotos: logado envia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'produtos');

create policy "fotos: logado altera"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'produtos')
  with check (bucket_id = 'produtos');

create policy "fotos: logado exclui"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'produtos');

-- ============================================================
-- DEPOIS DE RODAR:
-- 1) Abra gestao.html > entre > aba "Produtos".
-- 2) Clique em "Importar produtos atuais do site" (uma vez só).
--    Isso copia os produtos do data/produtos.json para o Supabase.
-- ============================================================
