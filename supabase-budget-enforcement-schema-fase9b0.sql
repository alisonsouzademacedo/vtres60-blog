-- VTRES60 Blog — controle de orcamento e circuit breaker transversal.
-- Fase 9B.0. Executar no SQL Editor do Supabase apos
-- supabase-provider-usage-schema.sql.
--
-- NAO APLICADO EM PRODUCAO NESTA FASE (mesmo padrao de todo migration
-- deste projeto: escrito e documentado agora, aplicado numa fase de
-- deploy dedicada e autorizada separadamente).
--
-- Por que esta tabela existe: agent_provider_usage (Fase 7) registra o
-- custo de uma chamada DEPOIS que ela aconteceu — nao existe hoje nenhum
-- mecanismo que impeca a chamada de acontecer quando um teto de gasto ja
-- foi ultrapassado (confirmado por grep exaustivo na auditoria da
-- Fase 9A: zero ocorrencias de "daily_budget"/"circuit breaker"/
-- "max_runs" fora do dashboard de leitura em /admin/custos). O cron do
-- agente dispara 2x/dia incondicionalmente, e qualquer automacao nova
-- (Radar, Inteligencia, monitoramento de empresas) so agrava esse risco
-- se ligada antes de existir enforcement real.
--
-- Modelo de reserva (nao "SELECT SUM + IF em codigo de aplicacao", que
-- tem uma janela de corrida real entre a leitura e a chamada ao
-- provider): toda chamada paga passa primeiro por
-- reserve_provider_budget(), que verifica o teto e grava a reserva DENTRO
-- da mesma transacao de banco (Postgres garante atomicidade de uma unica
-- funcao). So depois da reserva aprovada o codigo chama o provider de
-- verdade. Ao final, reconcile_provider_budget() substitui o custo
-- estimado da reserva pelo custo real (quando conhecido) ou
-- release_provider_budget() libera a reserva sem custo (quando a chamada
-- nunca chegou a acontecer, ex: bloqueada por outro gate antes do
-- provider).

create extension if not exists pgcrypto;

-- Modo de operacao por provider. DISABLED = nunca bloqueia (so registra
-- reserva, sem checagem de teto). AUDIT = calcula e expoe se bloquearia,
-- mas nunca bloqueia de verdade (para calibrar tetos com dado real antes
-- de ativar). ENFORCE = bloqueia quando o teto aprovado seria excedido.
-- Default DISABLED: nenhum provider deve nascer bloqueando chamadas sem
-- decisao explicita.
create table if not exists public.budget_mode (
  provider text primary key check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  mode text not null default 'DISABLED' check (mode in ('DISABLED', 'AUDIT', 'ENFORCE')),
  updated_at timestamptz not null default now()
);

-- Tetos aprovados. approved_threshold NULO significa "nenhum valor
-- aprovado ainda" — nesse caso o modo ENFORCE nunca bloqueia por aquele
-- escopo (nao ha teto pra comparar), mesmo que o provider esteja em
-- ENFORCE por outro escopo (ex: diario aprovado, mensal ainda nao).
-- recommended_threshold e so uma sugestao informativa para o admin decidir
-- — nunca usado para bloquear sozinho.
create table if not exists public.budget_thresholds (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  scope text not null check (scope in ('daily', 'monthly')),
  limit_type text not null default 'MONETARY_BUDGET' check (limit_type in ('MONETARY_BUDGET', 'REQUEST_QUOTA')),
  approved_threshold numeric,
  recommended_threshold numeric,
  currency text not null default 'USD',
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, scope, limit_type)
);

-- Uma linha fixa por provider, usada exclusivamente como alvo de
-- `select ... for update` dentro de reserve_provider_budget() — serializa
-- reservas concorrentes do MESMO provider sem lockar a tabela inteira e
-- sem lockar providers diferentes entre si.
create table if not exists public.budget_provider_locks (
  provider text primary key check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase'))
);
insert into public.budget_provider_locks (provider)
  values ('openai'), ('gnews'), ('replicate'), ('pexels'), ('supabase')
  on conflict (provider) do nothing;

-- Uma linha por tentativa de chamada paga. status:
--   'reserved'  — reserva concedida, chamada ao provider ainda nao
--                 concluida (ou concluida mas ainda nao reconciliada).
--   'confirmed' — chamada concluiu, actual_cost e o custo real (ou a
--                 melhor estimativa pos-chamada disponivel).
--   'released'  — reserva liberada sem custo (chamada nunca aconteceu,
--                 ex: outro gate bloqueou antes do provider).
--   'expired'   — nunca setado por codigo de aplicacao; e um ESTADO
--                 CALCULADO na hora da soma (reserved ha mais de
--                 RESERVATION_TTL sem reconciliar/liberar = processo
--                 provavelmente morreu no meio) — nao conta para o gasto,
--                 evitando que um crash trave orcamento para sempre.
create table if not exists public.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'gnews', 'replicate', 'pexels', 'supabase')),
  operation text not null,
  run_id uuid references public.agent_runs (id),
  estimated_cost numeric not null default 0,
  actual_cost numeric,
  status text not null default 'reserved' check (status in ('reserved', 'confirmed', 'released')),
  reserved_at timestamptz not null default now(),
  reconciled_at timestamptz
);
create index if not exists budget_reservations_provider_reserved_at_idx on public.budget_reservations (provider, reserved_at);
create index if not exists budget_reservations_run_id_idx on public.budget_reservations (run_id);

-- Reserva atomica com verificacao de teto. p_estimated_cost=0 e valido e
-- esperado para providers sem custo monetario confirmado (GNews/Pexels) —
-- a reserva ainda serve para contagem de REQUEST_QUOTA quando esse tipo de
-- teto for aprovado no futuro.
create or replace function public.reserve_provider_budget(
  p_provider text,
  p_operation text,
  p_estimated_cost numeric,
  p_run_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_reservation_ttl interval := interval '5 minutes';
  v_daily_threshold numeric;
  v_monthly_threshold numeric;
  v_daily_spent numeric;
  v_monthly_spent numeric;
  v_reservation_id uuid;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  -- serializa reservas concorrentes do mesmo provider; libera automaticamente no fim da transacao.
  perform 1 from public.budget_provider_locks where provider = p_provider for update;

  select mode into v_mode from public.budget_mode where provider = p_provider;
  v_mode := coalesce(v_mode, 'DISABLED');

  if v_mode != 'DISABLED' then
    select approved_threshold into v_daily_threshold from public.budget_thresholds
      where provider = p_provider and scope = 'daily' and limit_type = 'MONETARY_BUDGET' and active;
    select approved_threshold into v_monthly_threshold from public.budget_thresholds
      where provider = p_provider and scope = 'monthly' and limit_type = 'MONETARY_BUDGET' and active;

    select coalesce(sum(coalesce(actual_cost, estimated_cost)), 0) into v_daily_spent
      from public.budget_reservations
      where provider = p_provider
        and reserved_at >= v_day_start
        and (status = 'confirmed' or (status = 'reserved' and reserved_at >= now() - v_reservation_ttl));

    select coalesce(sum(coalesce(actual_cost, estimated_cost)), 0) into v_monthly_spent
      from public.budget_reservations
      where provider = p_provider
        and reserved_at >= v_month_start
        and (status = 'confirmed' or (status = 'reserved' and reserved_at >= now() - v_reservation_ttl));

    if v_mode = 'ENFORCE' then
      if v_daily_threshold is not null and (v_daily_spent + p_estimated_cost) > v_daily_threshold then
        return jsonb_build_object('allowed', false, 'mode', v_mode, 'reason', 'daily_budget_exceeded',
          'daily_spent', v_daily_spent, 'daily_threshold', v_daily_threshold);
      end if;
      if v_monthly_threshold is not null and (v_monthly_spent + p_estimated_cost) > v_monthly_threshold then
        return jsonb_build_object('allowed', false, 'mode', v_mode, 'reason', 'monthly_budget_exceeded',
          'monthly_spent', v_monthly_spent, 'monthly_threshold', v_monthly_threshold);
      end if;
    end if;
  end if;

  insert into public.budget_reservations (provider, operation, run_id, estimated_cost, status)
    values (p_provider, p_operation, p_run_id, p_estimated_cost, 'reserved')
    returning id into v_reservation_id;

  return jsonb_build_object('allowed', true, 'mode', v_mode, 'reservation_id', v_reservation_id,
    'daily_spent', v_daily_spent, 'monthly_spent', v_monthly_spent);
end;
$$;

-- Fecha a reserva com o custo real (ou a melhor estimativa pos-chamada).
-- Idempotente: so atualiza se ainda estiver 'reserved' (chamar duas vezes
-- na mesma reserva nao duplica nem sobrescreve uma reconciliacao anterior).
create or replace function public.reconcile_provider_budget(
  p_reservation_id uuid,
  p_actual_cost numeric
) returns void
language sql
security definer
set search_path = public
as $$
  update public.budget_reservations
  set actual_cost = p_actual_cost, status = 'confirmed', reconciled_at = now()
  where id = p_reservation_id and status = 'reserved';
$$;

-- Libera uma reserva sem custo — usado quando a chamada ao provider nunca
-- chegou a acontecer (ex: outro gate do grafo bloqueou antes de gastar).
create or replace function public.release_provider_budget(
  p_reservation_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.budget_reservations
  set status = 'released', reconciled_at = now()
  where id = p_reservation_id and status = 'reserved';
$$;

-- RLS: mesmo padrao deny-all de todo o projeto — acesso real so via
-- supabaseAdmin (service_role) no servidor. As funcoes acima sao
-- security definer justamente para funcionar mesmo com RLS deny-all,
-- chamadas via supabaseAdmin.rpc(...).
alter table public.budget_mode enable row level security;
alter table public.budget_thresholds enable row level security;
alter table public.budget_provider_locks enable row level security;
alter table public.budget_reservations enable row level security;
