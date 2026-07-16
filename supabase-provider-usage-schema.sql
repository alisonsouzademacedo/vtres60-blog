-- VTRES60 Blog — telemetria de uso/custo por chamada de provider.
-- Fase 6. LOCAL apenas nesta fase — NAO aplicar em producao (ver Secao 59
-- do prompt da Fase 6: "crie migrations LOCAIS. Nao execute em producao").
-- Executar apos supabase-agent-runs-schema.sql.
--
-- Uma linha por CHAMADA real a um provider (nao por execucao do agente —
-- agent_runs ja cobre isso). Uma execucao pode gerar varias linhas aqui
-- (ex: Drafter chama o LLM ate MAX_DRAFT_ATTEMPTS vezes).

create extension if not exists pgcrypto;

create table if not exists public.agent_provider_usage (
  id uuid primary key default gen_random_uuid(),
  -- run_id: referencia agent_runs.id, mas SEM foreign key formal — a
  -- telemetria de uso e best-effort (pode ser escrita mesmo se, por
  -- algum motivo, o registro do run correspondente nao existir/falhar).
  run_id uuid,
  provider text not null check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  operation text not null check (
    operation in (
      'news_search',
      'news_pick',
      'draft_generation',
      'internal_audit',
      'semantic_dedupe',
      'newsworthiness',
      'image_generation',
      'pexels_search',
      'storage_upload'
    )
  ),
  -- model: model SOLICITADO na chamada (o que o codigo pediu).
  model text,
  -- model_returned: model REALMENTE usado pelo provider para responder —
  -- pode divergir do solicitado (ex: roteamento/alias interno do
  -- provider). Populado a partir de response_metadata.model_name quando o
  -- provider devolve essa informacao (Secao 7).
  model_returned text,
  -- request_id: ID da requisicao devolvido pelo PROVIDER (ex: AIMessage.id
  -- da OpenAI, prediction id do Replicate) — nunca gerado localmente.
  request_id text,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  -- usage: jsonb cru do provider (ex: {input_tokens, output_tokens,
  -- cached_input_tokens, total_tokens}) — nunca prompt completo nem corpo
  -- da fonte (Secao 28/38).
  usage jsonb,
  currency text,
  unit_cost numeric,
  estimated_cost numeric,
  -- cost_status: 'confirmed' (tokens reais do provider + preco marcado
  -- verified=true em pricing.ts), 'estimated' (tokens reais mas preco nao
  -- reverificado ao vivo, OU custo por unidade fixa como Replicate),
  -- 'unavailable' (sem preco cadastrado para o modelo).
  cost_status text not null check (cost_status in ('confirmed', 'estimated', 'unavailable')),
  -- finish_reason: motivo de termino devolvido pelo provider (ex: 'stop',
  -- 'length', 'content_filter') quando aplicavel (LLM apenas).
  finish_reason text,
  -- retry_count: tentativas HTTP internas do client (ex: ChatOpenAI
  -- maxRetries) REALMENTE observadas. LangChain nao expoe esse numero na
  -- resposta — fica null (nao inventamos um valor) ate algum provider
  -- expor essa contagem de forma confiavel. attempt_number, abaixo, e o
  -- dado real e observavel equivalente no nivel do grafo.
  retry_count integer,
  -- attempt_number: numero da tentativa NO NIVEL DO NO (ex: 1a, 2a...
  -- chamada do InternalAuditor dentro do mesmo run, refletindo o loop
  -- Drafter<->InternalAuditor) — sempre um numero real (contador de
  -- estado), nunca estimado.
  attempt_number integer,
  -- success: a chamada ao provider completou sem excecao. false + as
  -- colunas de erro abaixo cobrem timeouts/4xx/5xx/erros de rede —
  -- nenhuma chamada real ao provider deixa de gerar uma linha (Secao 8).
  success boolean not null default true,
  -- error_code/error_message: normalizados e SANITIZADOS (nunca corpo de
  -- resposta bruto, nunca header, nunca chave de API) — Secao 7/28.
  error_code text,
  error_message text,
  published_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agent_provider_usage_run_id_idx on public.agent_provider_usage (run_id);
create index if not exists agent_provider_usage_created_at_idx on public.agent_provider_usage (created_at desc);
create index if not exists agent_provider_usage_provider_idx on public.agent_provider_usage (provider);

-- RLS deny-all, mesma logica de agent_runs/agent_queue: acesso exclusivo
-- via supabaseAdmin (service_role) server-side.
alter table public.agent_provider_usage enable row level security;
