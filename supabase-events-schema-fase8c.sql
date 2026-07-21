-- VTRES60 Blog — Fase 8C: modelo hibrido de eventos da Agenda Industrial.
--
-- NAO APLICADA em produção nesta fase (spec Fase 8C, secao 26/31: "Não
-- aplicar migração remota"). Este arquivo documenta o esquema que
-- corresponderia ao modelo ManagedEvent atualizado
-- (src/types/operations.ts) SE a Agenda for migrada de src/content/events.json
-- para o Supabase no futuro — hoje a fonte de verdade continua sendo o
-- arquivo JSON (via operations-repository.ts), e nao existe nenhum
-- código nesta fase que leia ou escreva nesta tabela.
--
-- Por que "id text" e nao "uuid": todo o resto deste projeto usa ids
-- text vindos do JSON legado (ver o bug real encontrado na Fase 7 —
-- supabase-agent-runs-schema.sql declarava published_post_id uuid contra
-- posts.id text e teria falhado com ERROR 42804 no primeiro apply real).
-- Os eventos atuais já têm ids como "event-febrava-2026" — manter o
-- mesmo padrão evita esse mesmo erro se esta tabela for adotada depois.

create table if not exists public.agenda_events (
  id text primary key,
  name text not null,
  slug text not null unique,
  status text not null default 'candidate'
    check (status in ('candidate', 'verified', 'published', 'archived', 'cancelled')),
  data_status text not null default 'unverified'
    check (data_status in ('official_verified', 'manual_verified', 'unverified')),
  source_url text,
  official_url text,
  start_date date not null,
  end_date date not null,
  city text not null,
  state text not null,
  venue text,
  address text,
  segment text,
  segment_slugs text[] not null default '{}',
  expected_audience text,
  exhibitors text,
  description text,
  why_follow text[] not null default '{}',
  opportunities text[] not null default '{}',
  main_image text,
  image_alt text,
  additional_images text[] not null default '{}',
  cta_label text,
  show_on_home boolean not null default true,
  display_order integer not null default 0,
  related_event_ids text[] not null default '{}',
  verified_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- So eventos publicados, verificados e ainda nao expirados aparecem ao
-- publico — mesma regra de src/lib/agenda/event-lifecycle.ts
-- (isVisibleToPublic), reaplicada aqui como indice parcial para consulta
-- eficiente caso a leitura publica passe a usar Supabase diretamente.
create index if not exists agenda_events_public_visibility_idx
  on public.agenda_events (start_date)
  where status = 'published';

create index if not exists agenda_events_status_idx on public.agenda_events (status);

-- Idempotencia de arquivamento automatico (secao 17 da spec): o job so
-- precisa achar published + end_date < hoje, o indice acima ja cobre
-- essa consulta. Rodar o job mais de uma vez no mesmo dia e seguro —
-- so reafirma o mesmo estado (archived), nao ha efeito colateral de
-- rodar 2x.

-- RLS deny-all, mesma logica das outras tabelas deste projeto: toda a
-- aplicacao acessa via supabaseAdmin (service_role), que bypassa RLS.
alter table public.agenda_events enable row level security;

comment on table public.agenda_events is
  'Fase 8C — modelo hibrido nao aplicado. Fonte de verdade real continua sendo src/content/events.json ate uma decisao explicita de migrar para Supabase.';
