// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// Troque os valores abaixo pelos do seu projeto em
// supabase.com -> Project Settings -> API
// A "anon key" é pública por natureza (fica exposta no navegador);
// a segurança real vem das políticas de RLS criadas no SQL,
// não do sigilo dessa chave. Veja README.md.
// ============================================================
const SUPABASE_URL = "https://zzlyqxhchmxccoxgqsxz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bHlxeGhjaG14Y2NveGdxc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNzAyODAsImV4cCI6MjA5OTc0NjI4MH0.HI-aew_p6udyfiSLjJPJmxd33G2pKcJsQhKorCd0Nmo";

// Carrega o SDK do Supabase via CDN (import dinâmico, sem build step)
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
