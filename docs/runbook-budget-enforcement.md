# Runbook — Circuit Breaker de Orçamento (Fase 9B.0)

Guia operacional para o dia a dia do controle de orçamento. Ver `docs/implementacao-fase9b0-controle-orcamento.md` para o racional arquitetural completo.

## Onde ver o estado atual

`/admin/custos` → seção "Controle de orçamento (circuit breaker)". Mostra, por provider: modo ativo, gasto hoje/mês, teto diário/mensal aprovado, reservas abertas, e os últimos bloqueios reais.

Se a seção mostrar "tabelas ainda não disponíveis": a migration `supabase-budget-enforcement-schema-fase9b0.sql` ainda não foi aplicada em produção — isso é esperado até uma fase de deploy dedicada autorizar a aplicação.

## Como ativar um provider em modo AUDIT (calibrar antes de bloquear)

1. Confirmar que a migration está aplicada (`select * from budget_mode;` deve existir).
2. `update budget_mode set mode = 'AUDIT' where provider = '<provider>';`
3. Deixar rodar por um período (recomendado: pelo menos algumas semanas de execução real, dado que a telemetria hoje só tem 5 amostras — ver Fase 9A) observando `dailySpent`/`monthlySpent` no painel, sem nenhum bloqueio real acontecer.
4. Comparar o gasto real observado contra um teto candidato antes de aprovar qualquer valor.

## Como aprovar um teto e ativar ENFORCE

**Nunca aprovar um valor sem que Pedro o defina explicitamente — não inventar teto.**

1. `insert into budget_thresholds (provider, scope, limit_type, approved_threshold, currency, note) values ('<provider>', 'daily', 'MONETARY_BUDGET', <valor>, 'USD', 'Aprovado por Pedro em <data>');` (repetir para `monthly` se aplicável).
2. `update budget_mode set mode = 'ENFORCE' where provider = '<provider>';`
3. Confirmar no painel `/admin/custos` que o teto aparece corretamente antes de considerar a ativação concluída.
4. Monitorar os "Últimos bloqueios" nos primeiros dias após ativar ENFORCE — um bloqueio inesperado no caminho de publicação ao vivo (`openai`) é um sinal de teto mal calibrado, não necessariamente de abuso real.

## Como desativar rapidamente (emergência)

Se ENFORCE estiver bloqueando incorretamente uma execução real (ex: teto calibrado errado, pico legítimo de atividade):

```sql
update budget_mode set mode = 'AUDIT' where provider = '<provider>';
-- ou, para desligar completamente:
update budget_mode set mode = 'DISABLED' where provider = '<provider>';
```

Isso é uma mudança de dado (não de código/deploy) — efeito imediato na próxima chamada, sem precisar de restart do PM2 nem novo build.

## O que significa cada modo

- **DISABLED**: nunca bloqueia. Reservas ainda são gravadas (para auditoria/histórico), mas nenhum teto é checado.
- **AUDIT**: nunca bloqueia de verdade, mas o gasto é calculado e fica visível no painel exatamente como ENFORCE calcularia — use para calibrar um teto antes de ativá-lo de fato.
- **ENFORCE**: bloqueia quando `gasto_atual + estimativa_da_chamada > teto_aprovado`. Sem teto aprovado para um escopo (diário ou mensal), esse escopo específico nunca bloqueia, mesmo em ENFORCE.

## O que acontece quando uma chamada é bloqueada

- **OpenAI** (Drafter, InternalAuditor, SemanticDedupe, Newsworthiness, NewsFetcher/news_pick): a execução do agente para com um erro real (`BudgetExceededError`), capturado pelo catch-all já existente nas rotas de disparo. No `agent_runs`, aparece como `status=failed`, `terminal_reason=operational_error`, com a mensagem real em `providerErrors.agent` (ex: `"Orçamento excedido para openai: daily_budget_exceeded"`). Visível em `/admin/agente`.
- **GNews**: degrada como se a busca não tivesse retornado nenhum artigo — a execução termina graciosamente sem publicar, sem erro visível além do log de bloqueio em `/admin/custos`.
- **Replicate/Pexels**: degrada como se o provider tivesse falhado — a cascata de imagem cai para o próximo tier (Replicate bloqueado → tenta Pexels → tenta placeholder).

## Se o guard em si estiver indisponível (Supabase fora do ar)

Política atual: **DEGRADED_MODE** — a chamada é liberada mesmo assim (nunca bloqueia por uma falha do próprio guard), e o evento fica logado (`console.error`, prefixo `[budget-guard]`) e marcado internamente como `degraded:true`. Isso significa que uma indisponibilidade do Supabase não impede a publicação de notícias reais, mas também significa que, durante essa janela, nenhum teto está sendo de fato aplicado — reavaliar essa política se/quando o volume de gasto justificar um comportamento mais restritivo.

## Reservas "penduradas" (processo morreu no meio)

Não é preciso limpar manualmente. Uma reserva em `status='reserved'` que passou de 5 minutos sem reconciliar/liberar automaticamente para de contar para o gasto (calculado na hora da soma, não por job de limpeza) — o próximo `select` já ignora essa linha para efeito de teto. A linha em si continua existindo na tabela `budget_reservations` como registro histórico (nunca excluída automaticamente).

## Consultas úteis (SQL Editor do Supabase)

Gasto do dia por provider:
```sql
select provider, sum(coalesce(actual_cost, estimated_cost)) as gasto_hoje
from budget_reservations
where reserved_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
  and (status = 'confirmed' or (status = 'reserved' and reserved_at >= now() - interval '5 minutes'))
group by provider;
```

Últimos bloqueios reais:
```sql
select provider, operation, created_at, error_message
from agent_provider_usage
where error_code = 'BudgetExceededError'
order by created_at desc
limit 20;
```

## Antes de ativar monitoramento de empresas (Fase 9B.7)

Per o plano mestre, a Fase 9B.7 exige `BUDGET_ENFORCEMENT_DEPLOYED=true` **e** `GNEWS_QUOTA_CONFIRMED=true` antes de começar. Este runbook cobre o primeiro; o segundo depende de Pedro confirmar o número real de cota do plano GNews contratado (não descobrível via código — ver Fase 9A, Seção 7).
