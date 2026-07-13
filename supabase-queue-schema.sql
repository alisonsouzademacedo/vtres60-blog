-- VTRES60 Blog — fila de links para o Agente Autonomo (LangGraph).
-- Executar no SQL Editor do Supabase apos supabase-schema.sql.
--
-- Diferente das tabelas editoriais (supabase-schema.sql), esta e uma
-- tabela nova sem dados legados para migrar, entao usa tipos nativos do
-- Postgres (uuid, timestamptz) em vez do padrao TEXT usado la por
-- compatibilidade com ids/datas vindos do JSON antigo.

create extension if not exists pgcrypto;

create table if not exists public.agent_queue (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'processed')),
  created_at timestamptz not null default now()
);

create index if not exists agent_queue_status_created_at_idx on public.agent_queue (status, created_at);

-- RLS deny-all, mesma logica das tabelas editoriais: toda a aplicacao
-- acessa via supabaseAdmin (service_role), que bypassa RLS.
alter table public.agent_queue enable row level security;
