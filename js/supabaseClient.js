// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// Troque os valores abaixo pelos do seu projeto em
// supabase.com -> Project Settings -> API
// A "anon key" é pública por natureza (fica exposta no navegador);
// a segurança real vem das políticas de RLS criadas no SQL,
// não do sigilo dessa chave. Veja README.md.
// ============================================================
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "SUA-ANON-KEY-AQUI";

// Carrega o SDK do Supabase via CDN (import dinâmico, sem build step)
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
