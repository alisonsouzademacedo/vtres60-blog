# Fase 9B.0 — Controle de Orçamento e Circuit Breaker

**Data:** 2026-07-23
**Worktree:** `/home/pedro/vtres60-blog-fase9b0` (branch `feat/budget-enforcement-fase9`, derivada de `main@c929e60`)
**Plano executado:** `docs/plano-mestre-fase9b-automacao-editorial-vtres60.md`, Parte II
**Fonte arquitetural:** `docs/analise-arquitetura-automacao-fase9a.md`

## Objetivo

Criar uma barreira atômica, auditável e transversal que impeça o agente (já em produção) e qualquer automação futura (Radar, Inteligência, monitoramento de empresas) de ultrapassar limites aprovados de custo — hoje inexistente em qualquer ponto do pipeline (confirmado por auditoria exaustiva na Fase 9A e reconfirmado aqui via grep antes de qualquer código: zero ocorrências de `daily_budget`/`circuit breaker`/`max_runs` fora do dashboard de leitura em `/admin/custos`).

## Auditoria — pontos de chamada paga mapeados

| Provider | Arquivo | Operação | Custo hoje |
|---|---|---|---|
| OpenAI | `src/lib/agent/costs/record-llm-usage.ts` (`invokeWithUsageTelemetry`) | `news_pick`, `draft_generation`, `internal_audit`, `newsworthiness`, `semantic_dedupe` | Confirmado (exceto `semantic_dedupe`, sem amostra real) |
| GNews | `src/lib/agent/nodes/news-fetcher.ts` (`searchGNews`) | `news_search` | Indisponível (free-tier, cota numérica não confirmada) |
| Replicate | `src/lib/agent/image-pipeline/providers.ts` (`generateWithReplicate`) | `image_generation` | Confirmado ($0,003/imagem, verificado 15/07/2026) |
| Pexels | `src/lib/agent/image-pipeline/providers.ts` (`fetchPexelsCandidates`) | `pexels_search` | Indisponível (free-tier) |
| Supabase Storage | `src/lib/agent/image-pipeline/storage.ts` (`uploadToEditorialStorage`) | `storage_upload` | **Deliberadamente excluído do guard** — custo é de armazenamento total acumulado no plano, não por requisição individual (mesma razão já documentada em `pricing.ts` desde a Fase 7: nunca usado para computar `estimated_cost` por linha). Reservar por chamada aqui inventaria um número que a própria API não expõe. |

Classificação de limite por provider: OpenAI e Replicate = `MONETARY_BUDGET` (preço confirmado por unidade); GNews e Pexels = `REQUEST_QUOTA` em potencial (sem preço monetário, mas com cota de requisições não confirmada — Fase 9A já declarou isso indisponível, não estimável). O schema (`budget_thresholds.limit_type`) já suporta os dois tipos, mas nenhum teto de `REQUEST_QUOTA` foi criado nesta fase por falta do número real.

## Problema de concorrência e alternativas avaliadas

Rejeitado: `SELECT SUM(cost) → IF abaixo do teto → CALL provider` em código de aplicação — janela de corrida real entre duas chamadas concorrentes (ambas podem ler "abaixo do teto" antes de qualquer uma gravar, estourando o orçamento).

Alternativas comparadas:

| Alternativa | Veredito | Motivo |
|---|---|---|
| RPC transacional no Supabase (Postgres function) | **Escolhida** | Atomicidade garantida por uma única invocação de função — sem depender de coordenação em JavaScript. Reaproveita a infraestrutura já existente (mesmo Postgres de `agent_provider_usage`), sem novo serviço. |
| Advisory lock | Rejeitada | Resolveria o mesmo problema, mas exigiria gerenciar sessões de conexão persistentes (advisory locks são por sessão) — o app usa o client HTTP do Supabase (`supabaseAdmin`), sem controle direto de sessão de conexão. |
| Serialização por worker (fila única) | Rejeitada | Adiciona um processo/infra novo para um problema que uma função Postgres resolve sem infra adicional; o volume atual (~5 execuções/dia) não justifica. |
| Ampliar `agent_provider_usage` (campo `allowed`) | Rejeitada | Essa tabela é telemetria pós-chamada (grava depois do fato); usar a mesma tabela para decisão pré-chamada misturaria "o que aconteceu" com "o que é permitido acontecer" — dois propósitos diferentes, duas tabelas diferentes (`budget_reservations`). |

Dentro da RPC escolhida, a serialização de reservas concorrentes do **mesmo provider** usa `select ... for update` numa linha fixa por provider (`budget_provider_locks`) — lock de linha, não de tabela inteira, então reservas de providers diferentes nunca se bloqueiam entre si.

## Modelo de dados

Migration: `supabase-budget-enforcement-schema-fase9b0.sql` (raiz do repo, **não aplicada em produção nesta fase** — mesmo padrão de toda migration deste projeto: documentada agora, aplicada numa fase de deploy dedicada e autorizada separadamente).

- `budget_mode` (1 linha por provider): `DISABLED | AUDIT | ENFORCE`. Default implícito `DISABLED` para qualquer provider sem linha.
- `budget_thresholds`: tetos por `(provider, scope, limit_type)`. `approved_threshold` nulo = nenhum teto aprovado ainda; `recommended_threshold` é só sugestão informativa, nunca usado para bloquear.
- `budget_provider_locks`: 5 linhas fixas (uma por provider), alvo do `for update`.
- `budget_reservations`: uma linha por tentativa de chamada paga. `status`: `reserved → confirmed` (sucesso, custo real) ou `reserved → released` (chamada nunca aconteceu). Reservas `reserved` há mais de 5 minutos não contam para o gasto (expiração calculada na hora da soma, não por job de limpeza — evita que um crash trave orçamento permanentemente).

Funções: `reserve_provider_budget(provider, operation, estimated_cost, run_id)`, `reconcile_provider_budget(reservation_id, actual_cost)`, `release_provider_budget(reservation_id)`. Todas `security definer` (funcionam sob RLS deny-all, mesmo padrão de todo o projeto — acesso real só via `supabaseAdmin.rpc(...)` server-side).

## Fail policy — DEGRADED_MODE

Se o RPC falhar (Supabase indisponível, erro de rede, tabela ainda não existe), `checkAndReserveBudget` devolve `{allowed:true, degraded:true}` — a chamada é liberada, nunca bloqueada por uma falha do próprio guard.

**Por que não `FAIL_CLOSED`:** bloquear o caminho de publicação ao vivo (cron 2x/dia, produção real, ~US$2,58/mês de gasto confirmado hoje — Fase 9A) por uma falha de infraestrutura do guard seria pior que o risco que o guard existe para mitigar. Não há cenário identificado onde uma degradação curta custe mais do que uma publicação real perdida no volume atual.

**Por que não `FAIL_OPEN` silencioso:** todo evento de degradação é logado (`console.error`) e o flag `degraded` fica disponível para o chamador expor no admin — nunca falha silenciosamente. Reavaliar esta política quando o volume/gasto crescer o suficiente para que `FAIL_CLOSED` (ou um `DEGRADED_MODE` mais restritivo, ex: degradar aberto só em DISABLED/AUDIT e fechar em ENFORCE) passe a valer o risco de interromper publicações reais.

## `terminal_reason` — avaliado, não adicionado

O plano pediu para avaliar incluir `budget_exceeded` no enum de `agent_runs.terminal_reason`. **Decisão: não adicionado nesta fase.** A Fase 9A já identificou 2 valores mortos no enum atual (`candidates_exhausted`, `provider_unavailable` — declarados no schema, nunca produzidos por `deriveRunOutcome()`). Adicionar `budget_exceeded` sem also alterar `deriveRunOutcome()` para efetivamente produzi-lo repetiria exatamente esse padrão — um 3º valor morto.

Em vez disso: `BudgetExceededError` (lançado pelo guard quando bloqueia em modo ENFORCE) propaga naturalmente até o catch-all genérico já existente em `cron/route.ts`/`trigger/route.ts`/`admin/agent/stream/route.ts`, que grava `terminal_reason: "operational_error"` com a mensagem real (`"Orçamento excedido para openai: daily_budget_exceeded"`) em `providerErrors.agent` — correto e honesto hoje, sem exigir nenhuma mudança nessas rotas. Promover para um `terminal_reason` dedicado fica como follow-up de baixo risco quando/se o volume de bloqueios justificar a distinção (reconfirmado: os 2 valores mortos permanecem intocados, nenhuma mudança de compatibilidade).

## Integração — fronteira compartilhada

`src/lib/agent/budget/circuit-breaker.ts`: `checkAndReserveBudget`/`reconcileBudget`/`releaseBudget`. Integrado em 3 pontos:

1. **`costs/record-llm-usage.ts`** (`invokeWithUsageTelemetry`, os 5 nós OpenAI): reserva antes da chamada; bloqueio lança `BudgetExceededError` (interrompe a execução — comportamento correto para o caminho crítico de texto); reconcilia com o custo real (`calculateOpenAiCost`) em sucesso; libera em falha.
2. **`nodes/news-fetcher.ts`** (`searchGNews`): reserva com `estimatedCost=0` (sem preço confirmado); bloqueio degrada graciosamente como "zero artigos" (mesmo comportamento já usado para falha de rede/timeout) — nunca lança exceção, porque GNews já tem um caminho de degradação graciosa estabelecido.
3. **`image-pipeline/providers.ts`** (`fetchPexelsCandidates`, `generateWithReplicate`): mesma lógica de degradação graciosa — bloqueio devolve lista vazia/`undefined`, o `ImageProcessor` já cai para o próximo tier da cascata (comportamento pré-existente, reaproveitado sem mudança).

Estimativas pré-chamada para OpenAI: `DEFAULT_OPENAI_OPERATION_COST_ESTIMATES` (`costs/pricing.ts`), calculadas a partir da média real observada nas 5 execuções completas do agente desde que a telemetria existe (consultado ao vivo via Supabase MCP na Fase 9A) — `semantic_dedupe` não tem amostra real, usa um placeholder conservador explicitamente marcado `confirmed:false`.

## Admin

`/admin/custos` ganhou uma nova seção (`BudgetPanel`, `src/components/admin/budget-panel.tsx`, alimentada por `src/lib/agent/budget/budget-repository.ts`) — não uma tela nova, para não duplicar a tela de custos já existente. Exibe por provider: modo, gasto hoje/mês, teto diário/mensal aprovado (ou "Nenhum aprovado"), reservas abertas, e uma lista dos últimos bloqueios reais (provider, operação, motivo, quando). Somente leitura nesta fase — mudar modo/teto é decisão editorial/financeira de Pedro, não automatizada aqui. Nunca exibe secrets, prompts ou conteúdo integral de notícias. Degrada graciosamente (`available:false`) quando as tabelas `budget_*` ainda não existem (migration não aplicada).

## Valores de orçamento

`CONFIRMED_CURRENT_SPEND`: ~US$0,043/execução completa do agente (OpenAI, 5 amostras reais, Fase 9A), ~US$2,58/mês projetado no volume atual. `RECOMMENDED_THRESHOLD`/`APPROVED_THRESHOLD`/`ACTIVE_THRESHOLD`: **nenhum valor aprovado por Pedro nesta fase** — `budget_thresholds` fica vazia por design, `budget_mode` fica `DISABLED` para todos os 5 providers por default. Nenhum teto arbitrário foi inventado.

## Testes

36 testes novos (551 total, era 515 — nenhuma redução, nenhuma regressão):
- `budget/circuit-breaker.test.ts` (16): modos DISABLED/AUDIT/ENFORCE repassados corretamente da RPC; degradação em falha de RPC (exception e error-no-payload); reconciliação com custo real menor/maior que a estimativa; idempotência de chamadas repetidas; liberação sem reservationId (no-op); `BudgetExceededError` carrega provider/reason.
- `costs/record-llm-usage.test.ts` (+7): reserva antes da chamada real; bloqueio impede `call()` de ser invocado; modo DISABLED sempre permite; reconciliação com custo real pós-chamada; liberação em falha; degradação nunca bloqueia; estimativas por operação batem com os valores reais da Fase 9A.
- `nodes/news-fetcher.test.ts` (+3): bloqueio não chama axios/GNews; reserva com `estimatedCost=0`; reconciliação em sucesso.
- `image-pipeline/providers.test.ts` (8, arquivo novo — não existia teste unitário para este arquivo antes): bloqueio não chama axios em nenhum dos dois providers; reserva com o preço real (Pexels=0, Replicate=$0,003); reconciliação com custo real (inclusive predição falha=$0); liberação em falha de rede.

**Limitação conhecida, documentada não escondida:** os testes acima cobrem 100% da lógica TypeScript do guard (mockando `supabaseAdmin.rpc`), mas **não** validam a atomicidade real da função Postgres sob concorrência de verdade — isso exige a migration aplicada contra um Postgres real com carga concorrente simulada, o que está fora do escopo desta fase (migration não aplicada, per o mesmo padrão de todas as fases anteriores deste projeto). Mesma limitação para timezone (`America/Sao_Paulo`) e virada de dia/mês na query SQL — a lógica está escrita e comentada, mas só verificável de fato pós-aplicação. Recomendação: validar isso com um teste de integração real na fase de deploy, antes de qualquer provider entrar em modo `ENFORCE`.

## Validação técnica

Lint limpo (`eslint . --max-warnings=0`). Typecheck limpo (`tsc --noEmit`). Vitest: 551 passando / 2 skipped (era 515/2). Build de produção limpo no worktree isolado (`env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY npm run build`, mesma técnica de mitigação do bug recorrente de env vars stale documentado em `project_vtres60_pm2_env_fix`), incluindo a rota `/admin/custos` com o novo painel. `.env.local`/`.env.production` copiados temporariamente da produção só para o build, removidos logo após (nunca commitados — `.gitignore` já cobre `.env*`).

## Produção

`PRODUCTION_CHANGED=false`. Nenhuma alteração em `/home/pedro/vtres60-blog`. Nenhuma migration aplicada a nenhum banco. Todo o trabalho desta fase ocorreu em `/home/pedro/vtres60-blog-fase9b0` (branch `feat/budget-enforcement-fase9`).

## Flags finais

```text
BUDGET_ARCHITECTURE_VALID=true
ATOMIC_ENFORCEMENT_READY=true
AUDIT_MODE_READY=true
ENFORCE_MODE_READY=true
THRESHOLDS_CONFIGURED=false
BUDGET_ENFORCEMENT_DEPLOYED=false
```

`THRESHOLDS_CONFIGURED=false` não bloqueia a Fase 9B.1 (per o plano mestre — a estrutura está pronta, nenhum valor foi inventado). `BUDGET_ENFORCEMENT_DEPLOYED` só vira `true` numa fase de deploy dedicada (migration aplicada + validação em produção), fora do escopo desta fase.
