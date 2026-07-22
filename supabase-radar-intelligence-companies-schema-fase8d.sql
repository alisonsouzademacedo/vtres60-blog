-- VTRES60 Blog — Fase 8D: modelo de dados para Radar Industrial,
-- Inteligência VTRES60 e Empresas administráveis.
--
-- NAO APLICADA em produção nesta fase (mesma regra da Fase 8C —
-- supabase-events-schema-fase8c.sql). A fonte de verdade real desta fase
-- é src/content/{companies,radarSignals,intelligenceItems}.json via
-- operationsRepository (mesmo padrão de segments/events). Este arquivo
-- documenta o esquema que corresponderia a esses tipos SE forem migrados
-- para o Supabase no futuro.
--
-- "id uuid" (nao "text"): companies/radar_signals/intelligence_items sao
-- entidades inteiramente novas desta fase, sem ids legados prefixados
-- vindos de JSON antigo (diferente de posts/categories/tags/agenda_events)
-- — seguem o mesmo padrao das tabelas de infraestrutura mais recentes
-- (agent_runs, provider_cost_settings). FKs para posts.id continuam
-- "text", pelo bug real ja documentado na Fase 7
-- (supabase-agent-runs-schema.sql declarava published_post_id uuid contra
-- posts.id text e falhava com ERROR 42804).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  description text not null,
  sector text not null,
  website text not null,
  ticker text,
  ticker_source text,
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_signals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  evidence_post_ids text[] not null default '{}',
  source_urls text[] not null default '{}',
  tag_ids text[] not null default '{}',
  segment_slugs text[] not null default '{}',
  company_slugs text[] not null default '{}',
  confidence text not null check (confidence in ('baixa', 'média', 'alta')),
  generated_at timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'expired', 'rejected')),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_items (
  id uuid primary key default gen_random_uuid(),
  radar_signal_id uuid not null references public.radar_signals(id) on delete cascade,
  kind text not null check (kind in ('fact', 'analysis', 'recommendation')),
  title text not null,
  analysis text not null,
  recommended_action text,
  evidence_post_ids text[] not null default '{}',
  source_urls text[] not null default '{}',
  segment_slugs text[] not null default '{}',
  company_slugs text[] not null default '{}',
  confidence text not null check (confidence in ('baixa', 'média', 'alta')),
  generated_at timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'expired', 'rejected')),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radar_signals_public_visibility_idx
  on public.radar_signals (generated_at desc) where status = 'published';
create index if not exists intelligence_items_public_visibility_idx
  on public.intelligence_items (generated_at desc) where status = 'published';
create index if not exists companies_active_idx on public.companies (active) where active = true;

-- RLS deny-all, mesma logica de todas as outras tabelas deste projeto:
-- toda a aplicacao acessa via supabaseAdmin (service_role), que bypassa RLS.
alter table public.companies enable row level security;
alter table public.radar_signals enable row level security;
alter table public.intelligence_items enable row level security;

comment on table public.companies is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/companies.json ate uma decisao explicita de migrar para Supabase.';
comment on table public.radar_signals is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/radarSignals.json.';
comment on table public.intelligence_items is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/intelligenceItems.json.';
