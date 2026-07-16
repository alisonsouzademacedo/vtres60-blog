-- VTRES60 Blog — configuracoes financeiras administraveis (Fase 7, Secao 14/15/16).
-- LOCAL apenas nesta fase — NAO aplicar em producao ate a Fase 7 de deploy
-- concluir toda a validacao (mesmo padrao de supabase-agent-runs-schema.sql
-- e supabase-provider-usage-schema.sql na Fase 6).
-- Executar apos supabase-provider-usage-schema.sql.
--
-- Nao existe tabela generica de "settings" em Supabase neste projeto —
-- toda configuracao administrativa hoje vive em arquivos JSON versionados
-- (src/content/*.json via configRepository), nao no banco. Verificado
-- antes de criar estas tabelas (Secao 17): nenhuma reutilizavel com
-- seguranca, porque essa configuracao especifica precisa ser cruzada em
-- SQL com agent_provider_usage (soma de custo desde uma data) para o
-- saldo estimado — um JSON local nao participa de agregacao no banco.

create extension if not exists pgcrypto;

-- provider_cost_settings: preco MANUAL, cadastrado pelo admin, para
-- provider/model sem preco verificavel automaticamente (Secao 14). Nunca
-- confundido com os precos OFFICIAL_VERIFIED de pricing.ts (esses
-- continuam sendo codigo versionado, nao dado de banco) — esta tabela so
-- existe para o caso em que a verificacao automatica falhou ou nunca vai
-- existir (ex: Supabase Storage, que e custo de plano, nao por chamada).
create table if not exists public.provider_cost_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  model text not null,
  unit text not null,
  input_cost numeric,
  output_cost numeric,
  image_compute_cost numeric,
  currency text not null default 'USD',
  effective_from date,
  note text,
  source text,
  -- source_type: SEMPRE 'MANUAL' nesta tabela — coluna existe para o
  -- painel poder rotular claramente a origem do valor ao lado dos
  -- OFFICIAL_VERIFIED/ESTIMATED/UNAVAILABLE que vem de pricing.ts/codigo,
  -- nunca misturando os quatro estados (Secao 14).
  source_type text not null default 'MANUAL' check (source_type = 'MANUAL'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_cost_settings_provider_model_idx on public.provider_cost_settings (provider, model);
create unique index if not exists provider_cost_settings_active_unique_idx
  on public.provider_cost_settings (provider, model, unit)
  where active;

-- provider_budget_settings: saldo ESTIMADO (Secao 15) = valor inicial
-- configurado manualmente, numa data de referencia, menos o consumo
-- calculado (agent_provider_usage.estimated_cost) desde essa data. Nunca
-- exibido como "saldo oficial" — sempre rotulado "saldo estimado" no
-- painel.
create table if not exists public.provider_budget_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  currency text not null default 'USD',
  initial_value numeric not null,
  initial_date date not null,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_budget_settings_provider_idx on public.provider_budget_settings (provider);

-- currency_rates: taxa de cambio MANUAL (Secao 16) — nenhuma cotacao
-- automatica/provider externo. Sem taxa configurada, o painel mostra
-- apenas o valor original (nunca inventa uma conversao).
create table if not exists public.currency_rates (
  id uuid primary key default gen_random_uuid(),
  currency_from text not null,
  currency_to text not null default 'BRL',
  rate numeric not null check (rate > 0),
  rate_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists currency_rates_pair_date_idx on public.currency_rates (currency_from, currency_to, rate_date desc);

alter table public.provider_cost_settings enable row level security;
alter table public.provider_budget_settings enable row level security;
alter table public.currency_rates enable row level security;
-- RLS deny-all, mesma logica das demais tabelas do agente: acesso
-- exclusivo via supabaseAdmin (service_role) server-side, nunca a anon
-- key nem policies publicas.
