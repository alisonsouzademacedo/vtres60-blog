-- VTRES60 Blog — schema de migracao de src/content/*.json para Supabase (Postgres)
-- Gerado a partir de src/types/editorial.ts. Executar no SQL Editor do Supabase
-- (ou via `psql "$DATABASE_URL" -f supabase-schema.sql`) antes de rodar
-- scripts/migrate-to-supabase.ts.
--
-- Decisoes de design:
-- * `id` e TEXT (nao UUID) porque os registros legados usam ids prefixados
--   (ex: "post-slug", "cat-slug") e os novos usam crypto.randomUUID(). Ambos
--   os formatos precisam caber na mesma coluna sem conversao.
-- * category_id / author_id / tag_ids permanecem como referencias "soft"
--   (sem FOREIGN KEY) porque o codigo atual (resolveCategory/resolveAuthor em
--   local-content-repository.ts) tolera referencias ausentes com fallback
--   em vez de falhar. Uma FK rigida mudaria esse comportamento.
-- * published_at / scheduled_at / created_at / updated_at sao TEXT (ISO 8601),
--   nao TIMESTAMPTZ, porque `scheduledAt` usa "" (string vazia) como sentinela
--   de "sem agendamento" — isso quebraria uma coluna TIMESTAMPTZ.
-- * RLS habilitado em todas as tabelas, sem policies (deny-all). Toda a leitura
--   e escrita hoje passa pelo servidor Next.js usando a service_role key
--   (bypassa RLS), entao a anon key exposta no browser nao consegue acessar
--   estas tabelas diretamente.

create extension if not exists pgcrypto;

-- ============================================================
-- authors
-- ============================================================
create table if not exists public.authors (
  id text primary key,
  name text not null,
  role text not null default '',
  photo text not null default '',
  bio text not null default '',
  linkedin text not null default '',
  email text not null default '',
  slug text not null unique,
  created_at text not null,
  updated_at text not null
);

-- ============================================================
-- categories
-- ============================================================
create table if not exists public.categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  image text not null default '',
  icon text not null default '',
  color text not null default '',
  menu_order integer not null default 0,
  show_in_menu boolean not null default true,
  show_on_home boolean not null default false,
  meta_title text not null default '',
  meta_description text not null default '',
  keywords text[] not null default '{}',
  seo_introduction text not null default '',
  related_article_ids text[] not null default '{}',
  related_pillar_slugs text[] not null default '{}',
  page jsonb,
  created_at text not null,
  updated_at text not null
);

-- ============================================================
-- tags
-- ============================================================
create table if not exists public.tags (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  meta_title text not null default '',
  meta_description text not null default '',
  created_at text not null,
  updated_at text not null
);

-- ============================================================
-- posts (ManagedPost — noticias, analises, cases)
-- ============================================================
create table if not exists public.posts (
  id text primary key,
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  featured_image text not null default '',
  image_caption text not null default '',
  image_alt text not null default '',
  category_id text not null default '',
  segment_slugs text[] not null default '{}',
  tag_ids text[] not null default '{}',
  author_id text not null default '',
  published_at text not null default '',
  scheduled_at text not null default '',
  reading_time integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled')),
  featured boolean not null default false,
  main_story boolean not null default false,
  display_order integer not null default 0,
  source_name text not null default '',
  source_url text not null default '',
  content_type text not null default 'noticia' check (content_type in ('noticia', 'analise', 'guia', 'case')),
  impact text not null default '',
  companies text[] not null default '{}',
  cta jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  created_at text not null,
  updated_at text not null
);

create index if not exists posts_status_idx on public.posts (status);
create index if not exists posts_category_id_idx on public.posts (category_id);

-- ============================================================
-- educational_articles (EducationalArticle — guias evergreen)
-- ============================================================
create table if not exists public.educational_articles (
  id text primary key,
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  featured_image text not null default '',
  image_alt text not null default '',
  category_id text not null default '',
  tag_ids text[] not null default '{}',
  primary_keyword text not null default '',
  secondary_keywords text[] not null default '{}',
  author_id text not null default '',
  reading_time integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled')),
  published_at text not null default '',
  scheduled_at text not null default '',
  related_article_ids text[] not null default '{}',
  related_pillar_slugs text[] not null default '{}',
  cta jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  created_at text not null,
  updated_at text not null
);

create index if not exists educational_articles_status_idx on public.educational_articles (status);
create index if not exists educational_articles_category_id_idx on public.educational_articles (category_id);

-- ============================================================
-- Row Level Security — deny-all por padrao.
-- Toda a aplicacao acessa estas tabelas via supabaseAdmin (service_role),
-- que sempre bypassa RLS. Isso impede que a anon key (publica, exposta no
-- bundle do browser) leia ou escreva aqui diretamente.
-- ============================================================
alter table public.authors enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.posts enable row level security;
alter table public.educational_articles enable row level security;
