-- VTRES60 Blog — telemetria estruturada de execucoes do Agente Autonomo.
-- Fase 6. Executar no SQL Editor do Supabase apos supabase-queue-schema.sql.
--
-- Por que esta tabela existe: agent_queue.status ('pending'|'processed')
-- so diz se uma URL foi reivindicada, nunca POR QUE uma execucao terminou
-- sem publicar nem QUANTO tempo levou. A unica trilha de decisao hoje e
-- src/content/logs.json (texto livre, sem run_id, nao filtravel por
-- estado, fora do Supabase, sem RLS). agent_runs registra UMA linha por
-- execucao do grafo (cron, manual ou dry-run), com o motivo terminal e o
-- resultado de cada gate, para alimentar o painel
-- Admin -> Operacao do Agente sem depender de grep em arquivo de log.

create extension if not exists pgcrypto;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('cron', 'manual', 'dry_run')),
  -- scheduled_for: so preenchido para trigger_type='cron' (05:00/17:00
  -- America/Sao_Paulo esperados). Nulo para 'manual' e 'dry_run'.
  scheduled_for timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  -- status: estado grosso da execucao. terminal_reason carrega o motivo
  -- fino (ver check abaixo) — permite ao painel diferenciar rejeicao
  -- editorial esperada de falha operacional real sem parsear texto.
  -- 'draft': Publisher criou o post mas NAO como publicado (fluxo manual
  -- aguardando revisao humana, OU auditor esgotou tentativas e o post foi
  -- salvo como rascunho de emergencia) — ver publisher.ts.
  status text not null default 'running' check (status in ('running', 'published', 'draft', 'rejected', 'failed')),
  terminal_reason text check (
    terminal_reason is null or terminal_reason in (
      'published',
      'draft_pending_review',
      'auditor_rejected_saved_as_draft',
      'exact_duplicate',
      'not_newsworthy',
      'same_event_no_material_update',
      'classification_failed',
      'image_pipeline_failed',
      'no_candidate',
      'candidates_exhausted',
      'provider_unavailable',
      'operational_error'
    )
  ),
  -- candidate_title/candidate_url: da ULTIMA candidata tentada nesta
  -- execucao (a que determinou o resultado terminal) — com o fallback de
  -- proxima-candidata (Fase 6, nodes/next-candidate.ts) uma execucao pode
  -- tentar varias URLs; candidates_tried conta quantas.
  candidate_title text,
  candidate_url text,
  candidates_tried integer not null default 0,
  -- candidates_found: total retornado pelo GNews nesta execucao (antes de
  -- qualquer rejeicao) — distinto de candidates_tried (quantas foram
  -- processadas ate o motivo terminal). 0 para URL explicita via
  -- admin/fila (Fase 7, Secao 18).
  candidates_found integer not null default 0,
  source_name text,
  exact_dedupe_status text,
  newsworthiness_status text,
  draft_attempts integer,
  audit_status text,
  semantic_dedupe_status text,
  material_update_reason text,
  image_tier text,
  image_status text,
  published_post_id text references public.posts(id) on delete set null,
  -- provider_errors: jsonb, NUNCA prompt completo nem corpo da fonte (ver
  -- Secao 28/38 do prompt da Fase 6) — so mensagem/codigo de erro por
  -- provider quando houver falha.
  provider_errors jsonb,
  -- error_code/error_summary (Fase 7, Secao 18): erro NORMALIZADO e
  -- SANITIZADO do nivel da EXECUCAO (quando terminal_reason='operational_error'
  -- ou status='failed') — distinto de provider_errors (granular, por
  -- provider). Nunca stack trace completo, nunca corpo de resposta bruto.
  error_code text,
  error_summary text,
  -- candidate_history (Fase 7, Secao 18/20): array jsonb [{url,title,reason}]
  -- com o motivo de rejeicao de CADA candidata tentada nesta execucao (nao
  -- so a ultima) — permite o painel Operacao do Agente mostrar "motivo de
  -- rejeição de cada candidata" sem uma tabela filha separada.
  candidate_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_created_at_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs (status);
create index if not exists agent_runs_published_post_id_idx on public.agent_runs (published_post_id);

-- RLS deny-all, mesma logica de agent_queue/tabelas editoriais: toda a
-- aplicacao acessa via supabaseAdmin (service_role), que bypassa RLS. O
-- admin nunca deve ler esta tabela com a anon key.
alter table public.agent_runs enable row level security;
