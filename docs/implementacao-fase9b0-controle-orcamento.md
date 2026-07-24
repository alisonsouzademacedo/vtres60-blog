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

`PRODUCTION_CHANGED=false`. Nenhuma alteração em `/home/pedro/vtres60-blog`. Nenhuma migration aplicada a nenhum banco de produção. Todo o trabalho desta fase ocorreu em `/home/pedro/vtres60-blog-fase9b0` (branch `feat/budget-enforcement-fase9`).

---

## Fechamento (2026-07-24) — validação real de atomicidade e do BudgetPanel

Duas pendências identificadas ao fim da implementação inicial: (1) a atomicidade só tinha sido validada com mocks TypeScript, nunca contra Postgres real sob concorrência; (2) o `BudgetPanel` mudou a UI de `/admin/custos` sem passar por Playwright/axe. Ambas fechadas nesta etapa, sem tocar produção.

### Validação real das RPCs — Postgres isolado

Container Docker descartável (`postgres:17`, porta `55499`, nome `vtres60-fase9b0-pg-test`), **isolado tanto da produção quanto de outro container já em uso por outro projeto neste servidor** (`v360-fase5-db-lab`, porta `55432` — não reaproveitado, para não misturar dados de projetos diferentes). Migration aplicada com um stub mínimo de `agent_runs (id uuid primary key)` só para satisfazer a FK de `budget_reservations.run_id` (nenhum outro dado inventado).

Confirmado via schema real (`\d`, `pg_policies`, `pg_class`): RLS habilitado nas 4 tabelas, zero policies (deny-all, mesmo padrão de todo o projeto), constraints/índices/tipos batem exatamente com o design.

**Teste de concorrência real (não simulado com mock)**: modo `ENFORCE` + teto diário de US$10,00 (valor de teste, nunca gravado em produção); duas transações `psql` disparadas verdadeiramente em paralelo (`&` + `wait`, dois processos Docker separados), cada uma pedindo reservar US$6,00 (juntas excedem o teto). Resultado real:
```
Transação A: {"allowed": false, "reason": "daily_budget_exceeded", "daily_spent": 6.00, ...}
Transação B: {"allowed": true, "reservation_id": "8bd4a185-...", "daily_spent": 0, ...}
```
Exatamente uma reserva foi gravada (`select sum(estimated_cost) from budget_reservations` = US$6,00 — nunca 12,00, nunca dupla reserva). Repetido com 5 chamadas verdadeiramente concorrentes ao mesmo provider (`daily_spent` observado sequencialmente 0/1/2/3/4, 5 reservas distintas, soma exata US$5,00, 0,415s total) — confirma serialização correta sob carga sem deadlock nem timeout (arquiteturalmente, deadlock é impossível neste design: cada chamada mantém no máximo um lock de linha por vez, nunca dois simultâneos).

Demais cenários exigidos, todos executados contra o Postgres real (não mockados):
- **Reconciliação com custo real menor** que a estimativa (US$6,00 → US$0,0012): confirmado.
- **Reconciliação com custo real maior** (US$0 → US$0,45): confirmado.
- **Idempotência**: reconciliar a mesma reserva duas vezes com valores diferentes não altera o segundo valor (guarda `where status='reserved'` impede sobrescrita pós-confirmação); liberar (`release`) a mesma reserva duas vezes não lança erro nem reverte o estado.
- **Liberação**: `status` vira `released`, sem custo.
- **Expiração**: uma reserva `reserved` há mais de 5 minutos foi corretamente ignorada no cálculo de gasto acumulado (testado com `reserved_at` retroagido manualmente) — uma nova reserva que dependeria dela ter expirado foi aprovada corretamente.
- **Falha no meio da função / rollback**: uma chamada com `provider` inválido violou o `CHECK` constraint dentro do `INSERT`; a transação da função inteira reverteu atomicamente, zero linhas órfãs (`count(*)` antes = depois = 0).
- **Precisão decimal**: valores fracionários realistas de custo de LLM (`0.0000875` reservado, reconciliado para `0.0000912345`) preservados exatamente — `numeric` do Postgres não arredonda.
- **ID inexistente**: `reconcile`/`release` numa reserva que não existe não lança erro, não afeta linhas (mesmo comportamento best-effort do lado TypeScript).

**Limitação que permanece, honestamente**: este Postgres isolado não tem PostgREST na frente (só testa as funções SQL diretamente via `psql`, não via `supabaseAdmin.rpc()` real sobre HTTP) — a integração TypeScript↔RPC continua coberta só pelos mocks descritos na seção de testes acima. A camada SQL em si (onde mora toda a lógica de atomicidade) agora está provada contra Postgres real, não mock.

Container descartável, encerrado e removido ao final desta etapa — nenhum dado de teste, nenhum vestígio, nenhuma alteração em produção ou em qualquer outro projeto deste servidor.

### BudgetPanel — Playwright + axe

Descoberta arquitetural relevante: `/admin/__test-fixtures__` (localização original planejada) nunca teria virado rota real — o Next.js App Router trata qualquer segmento de path iniciado por `_` como "pasta privada", excluída do roteamento por convenção. Corrigido movendo o harness para `/e2e-fixtures/budget-panel` (fora de `/admin/*`, evitando também o middleware de autenticação que exige cookie de sessão para qualquer path sob `/admin/:path*` — o harness não precisa herdar essa exigência, já que só renderiza o componente puro). Gate de segurança: `notFound()` a menos que `PLAYWRIGHT_TEST_FIXTURES==="1"`, nunca setado em produção.

Cobertos via fixtures (6 cenários) + contra o `/admin/custos` real (autenticado, produção-equivalente): DISABLED, AUDIT com teto configurado, ENFORCE com bloqueios reais listados, configuração ausente ("Nenhum aprovado", nunca um valor inventado), sem reservas/sem bloqueios (estado vazio honesto), tabelas indisponíveis (estado real hoje, migration não aplicada), cenário inexistente (404 real), navegação por teclado, responsividade (375px sem overflow), ausência de secrets/API keys/JWT/e-mail em qualquer cenário. Usuário não autenticado: teste direto contra `/admin/custos` real confirma redirecionamento para `/admin/login` (mesma proteção de todo `/admin/*`).

**Achado real durante esta validação, não relacionado ao BudgetPanel**: ao adicionar `/admin/custos` à suíte axe (nunca coberta antes desta fase), 2 violações P0/P1 apareceram — `label`/`select-name` (Form elements must have labels). Causa raiz confirmada por leitura direta do código: em `cost-settings-form.tsx` (componente pré-existente, não tocado por esta fase até este achado), todo par `<label>Texto</label>` + `<select>`/`<input>` estava estruturado como irmãos no DOM, sem `htmlFor`/`id` nem wrapping — sem associação programática nenhuma entre rótulo e controle, invisível para leitores de tela apesar de parecer correto visualmente. Corrigido envolvendo cada controle dentro do seu `<label>` (associação implícita, sem precisar de `id` — evita colisão de IDs duplicados, já que "Provider"/"Moeda"/"Nota" se repetem em 3 sub-formulários na mesma página). 16 pares corrigidos. Confirmado via axe real: 0 violações P0/P1 após o fix. Bug pré-existente, exposto só porque esta fase estendeu a cobertura de acessibilidade a uma página que nunca tinha sido auditada — mesmo padrão já visto em fases anteriores deste projeto (ex: Fase 8D encontrou e corrigiu bugs reais fora do escopo direto da tarefa, achados só por execução genuína, não por revisão de código).

### Regressão

Lint limpo, typecheck limpo, Vitest 551/2 skipped (idêntico ao fechamento anterior — nenhum teste novo de unidade nesta etapa, só e2e), build de produção limpo (2 vezes, antes e depois do fix de acessibilidade), 23/23 Playwright (16 fixtures + 3 admin.spec.ts estendidos + 3 axe.spec.ts admin, incluindo `/admin/custos` agora limpo), secrets scan limpo (diff completo revisado, `.env.local`/`.env.production` copiados só para build/teste, removidos logo após, nunca commitados).

### Flags atualizadas

```text
BUDGET_ARCHITECTURE_VALID=true
BUDGET_IMPLEMENTATION_READY=true
ATOMIC_ENFORCEMENT_READY=true
ATOMIC_ENFORCEMENT_PENDING_DATABASE_VALIDATION=false
AUDIT_MODE_READY=true
ENFORCE_MODE_READY=true
THRESHOLDS_CONFIGURED=false
BUDGET_ENFORCEMENT_DEPLOYED=false
```

`ATOMIC_ENFORCEMENT_READY` passa a `true` com base em evidência real (Postgres isolado, não mock) — critério da Seção 4 do plano de fechamento satisfeito integralmente. `THRESHOLDS_CONFIGURED` permanece `false`: nenhum valor de orçamento foi aprovado por Pedro, nenhum foi inventado. `READY_FOR_DEPLOY` permanece `false` — migration segue não aplicada em produção.
