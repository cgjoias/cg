-- ============================================================
-- SCHEMA + RLS DA TABELA "pedidos"
-- Rode isto uma vez no Supabase: Project > SQL Editor > New query > Run
--
-- Regra de LGPD aplicada aqui:
--   - Qualquer visitante (chave anon, sem login) SÓ PODE CRIAR pedido.
--   - Ninguém sem login consegue LER, ALTERAR ou EXCLUIR pedidos.
--   - Só quem faz login (você, dono da loja) enxerga os dados dos clientes.
-- Isso fecha o buraco de qualquer pessoa conseguir ler nome/whatsapp/
-- endereço de todo mundo só por saber a URL do Supabase.
-- ============================================================

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  whatsapp text not null,
  endereco text,
  produto_id text not null,
  produto_nome text not null,
  categoria text not null,
  preco numeric not null,
  detalhes text,
  observacoes text,
  status text not null default 'Pendente'
);

alter table public.pedidos enable row level security;

-- limpa policies antigas (se você já tinha criado alguma) para não duplicar
drop policy if exists "publico pode criar pedido" on public.pedidos;
drop policy if exists "logado pode ler pedidos" on public.pedidos;
drop policy if exists "logado pode atualizar pedidos" on public.pedidos;
drop policy if exists "logado pode excluir pedidos" on public.pedidos;

-- 1) Qualquer visitante do site pode ENVIAR um pedido (é o formulário público)
create policy "publico pode criar pedido"
  on public.pedidos for insert
  to anon
  with check (true);

-- 2) Só usuário logado (você, no painel) pode LER os pedidos
create policy "logado pode ler pedidos"
  on public.pedidos for select
  to authenticated
  using (true);

-- 3) Só usuário logado pode ATUALIZAR (ex.: confirmar pedido)
create policy "logado pode atualizar pedidos"
  on public.pedidos for update
  to authenticated
  using (true)
  with check (true);

-- 4) Só usuário logado pode EXCLUIR
create policy "logado pode excluir pedidos"
  on public.pedidos for delete
  to authenticated
  using (true);

-- ============================================================
-- PRÓXIMO PASSO (fazer manualmente no painel do Supabase):
-- Authentication > Users > Add user
--   Email: seu e-mail
--   Password: uma senha forte, só sua
-- Esse é o login que você vai usar em gestao.html.
-- NÃO deixe "Enable email signups" ligado para o público
-- (Authentication > Providers > Email) — assim ninguém cria conta sozinho.
-- ============================================================
