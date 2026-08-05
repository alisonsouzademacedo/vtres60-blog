# Fase 9B.1 — Supabase como Fonte de Verdade para Radar, Inteligência e Empresas

**Data:** 2026-07-26
**Worktree:** `/home/pedro/vtres60-blog-storage-fase9b1` (branch `feat/storage-supabase-fase9`, derivada de `origin/feat/budget-enforcement-fase9@22753b1`)
**Plano executado:** `docs/plano-mestre-fase9b-automacao-editorial-vtres60.md`, Parte III, Fase 9B.1
**Dependência:** `ATOMIC_ENFORCEMENT_READY=true` (Fase 9B.0, confirmado)

## Objetivo

Substituir a persistência em JSON (`src/content/{companies,radarSignals,intelligenceItems}.json`) por Supabase para os três domínios, preservando 100% do comportamento público/admin, validações server-side, estados vazios honestos, evidências e a FK real entre Inteligência e Radar — sem criar conteúdo fictício.

## Auditoria — estado real confirmado antes de qualquer alteração

- **Schemas**: `companies`, `radar_signals`, `intelligence_items` já aplicados em produção (Fase 8E), 0 linhas, RLS habilitado, **0 policies** (deny-all, mesmo padrão de todo o projeto). FK real `intelligence_items.radar_signal_id → radar_signals.id` (`on delete cascade`). Os 3 PKs são `uuid` (não `text`, diferente de posts/categories/tags/agenda_events).
- **Dados reais nos JSONs**: `radarSignals.json` e `intelligenceItems.json` **não existem** — nunca foram criados, 0 registros reais (confirma o estado documentado desde a Fase 8D/9A). `companies.json` tem **6 empresas reais** (WEG, Gerdau, Marcopolo, Randon, John Deere, Tramontina).
- **Único ponto de integração**: `operationsRepository` (`src/services/operations/operations-repository.ts`). Toda rota admin (`/api/admin/{radar,intelligence,companies}`) e todo consumidor público (`local-content-repository.ts` → home, `/radar`, `/empresas`) passam exclusivamente por ele. `backup-service.ts` já excluía essas 3 coleções do backup/restore antes desta fase (gap pré-existente, fora de escopo, não alterado).
- **Precedente direto já existente**: `src/services/editorial/editorial-repository.ts` já migrou posts/categories/tags/authors para Supabase com o mesmo padrão genérico (mapper camelCase↔snake_case, `list/getOne/create/update/remove`). `scripts/migrate-to-supabase.ts` já faz migração idempotente via `upsert(rows, {onConflict:"id"})`, preservando o id original.

## Decisão: ids de `companies` (divergência real registrada, não deduzida)

O convencional de "preservar o id original" (usado para posts/categories/tags/authors, cuja coluna é `text`) **não funciona** para `companies`: os 6 ids reais em `companies.json` são strings tipo `"company-weg"` (herdados do seed da Fase 8D), mas a coluna `companies.id` já aplicada em produção é `uuid`. O comentário do próprio arquivo de schema da Fase 8D (`supabase-radar-intelligence-companies-schema-fase8d.sql`) afirma que companies "não tem ids legados vindos de JSON antigo" — **essa premissa já estava incorreta** no momento em que foi escrita, especificamente para `companies` (confirmado por leitura direta do arquivo, não por dedução).

Divergência registrada e resolvida por decisão explícita de Pedro (não decidida unilateralmente): **manter `companies.id` como `uuid`** (Opção A), gerando um **UUID v5 determinístico** (RFC 4122) para cada id legado, com as seguintes condições obrigatórias, todas cumpridas:

1. **Nenhum UUID aleatório por execução** — `src/lib/uuid-v5.ts` implementa UUID v5 sobre `node:crypto` (sem dependência nova; verificado que o pacote `uuid` não está instalado e não foi adicionado). Mesma entrada → sempre o mesmo UUID, validado contra o vetor de referência oficial (`uuid.uuid5(uuid.NAMESPACE_DNS, "www.example.com")`, conferido via `python3 -c "import uuid; ..."`).
2. **Namespace fixo e documentado**: `ce6a5120-b110-43c5-bf91-3ec9adc0f69a` (gerado uma única vez via `crypto.randomUUID()`, 2026-07-26, hardcoded para sempre em `src/services/operations/company-legacy-ids.ts`).
3. **Bits de versão/variante válidos**: versão 5 e variante RFC 4122 forçados no algoritmo, testados (`uuid-v5.test.ts`: regex de formato, nibble de versão, nibble de variante).
4. **Testes de regressão**: `company-legacy-ids.test.ts` fixa os 6 UUIDs reais esperados para os 6 ids legados conhecidos — qualquer mudança futura no algoritmo ou namespace quebraria esse teste imediatamente.

Mapa `legacy_id → uuid → slug → name` (produzido pelo script de migração, ver seção de testes):

| legacy_id | uuid | slug | name |
|---|---|---|---|
| company-weg | `19cdc9a5-89f3-5532-943c-91f7cfc215db` | weg | WEG |
| company-gerdau | `185dd603-2931-5549-9de6-6b9b0af85317` | gerdau | Gerdau |
| company-marcopolo | `b476b3c9-8c2c-5ac8-a019-6e443dde0624` | marcopolo | Marcopolo |
| company-randon | `458a49a7-4a47-5c09-824a-fbdfacb3316f` | randon | Randon |
| company-john-deere | `bd1e1b42-1037-5c66-a784-2f86ed841b04` | john-deere | John Deere |
| company-tramontina | `f13d02ed-e0f3-597a-b3ad-c6894ef703c7` | tramontina | Tramontina |

### Proteção adicional por slug (não depender só do UUID)

`companies.slug` já tinha constraint `unique` aplicada (confirmado via `list_tables` verbose — não foi criada por dedução). O script de migração (`scripts/migrate-operations-to-supabase.ts`) usa o slug como verificação primária de idempotência: para cada empresa, consulta por slug primeiro; só insere se não existir; se existir com o UUID determinístico esperado, atualiza (idempotente); **se existir com um UUID diferente do esperado, o script para e reporta a divergência — nunca decide sozinho, nunca sobrescreve**. Validado com Postgres real (ver seção de testes): uma tentativa de inserir um id diferente com slug já existente falha com `duplicate key value violates unique constraint "companies_slug_key"` — a proteção é real, não apenas uma intenção documentada.

### Reconfirmação de ausência de referências aos ids antigos

Grep completo do repositório (código, testes, rotas, JSONs, docs) por `company-weg`/`company-gerdau`/`company-marcopolo`/`company-randon`/`company-john-deere`/`company-tramontina` fora de `companies.json`: **zero ocorrências**. O tipo público `Company` (`src/types/content.ts`) nunca expõe `id` — só é usado internamente em `/admin/empresas/{id}`. `posts.companies` associa por **nome exato**, nunca por id (confirmado em `local-content-repository.ts`/`countPostsByCompanyName`). `logs.json` (runtime real) não contém nenhum dos 6 ids. Nenhuma referência em localStorage (a UI admin não persiste ids no client) ou analytics.

### Compatibilidade de URLs administrativas antigas — testada e um bug real corrigido

Testado de verdade (não assumido): `GET /api/admin/companies/company-weg` contra um servidor real com a flag ligada e os dados migrados.

**Bug real encontrado e corrigido**: a primeira implementação de `getByIdOrSlug` lançava incondicionalmente qualquer erro retornado pela busca por id (`if (byId.error) throw ...`). Postgres rejeita `"company-weg"` como entrada para uma coluna `uuid` com o erro real `22P02` ("invalid input syntax for type uuid") **antes mesmo de rodar a query** — isso nunca chegava a cair para a busca por slug/id legado, e a rota quebrava com 500 em vez de resolver a URL antiga. Corrigido: `22P02` agora é tratado como "não encontrado por id" (cai para slug, depois para a resolução de id legado); qualquer outro código de erro continua sendo propagado como falha real. Coberto por 2 novos testes de regressão (`supabase-operations-repository.test.ts`), incluindo o caso em que um erro genuíno (não 22P02) deve continuar sendo lançado.

Após o fix, confirmado via chamada HTTP real: `GET /admin/empresas/company-weg` (via API) resolve para a empresa WEG migrada; um id legado inexistente (`company-does-not-exist`) devolve 404 limpo, sem inventar dado.

**A resolução de compatibilidade não é uma segunda fonte de verdade** — é a mesma função pura (`legacyCompanyUuid`) usada na migração, aplicada como fallback de leitura. **Pode ser removida com segurança** assim que não houver mais risco de link/bookmark antigo em uso — a funcionalidade de empresas administráveis tem poucos dias de existência (Fase 8D, 2026-07-22) e um único usuário administrador (Pedro); recomenda-se remover em uma limpeza futura, não nesta fase.

## Arquitetura de implementação

- **`src/lib/uuid-v5.ts`**: UUID v5 (RFC 4122) sobre `node:crypto`, sem dependência nova.
- **`src/services/operations/company-legacy-ids.ts`**: namespace fixo, `legacyCompanyUuid()`, `looksLikeLegacyCompanyId()`, lista dos 6 ids legados conhecidos (documentação/teste, não é a fonte operante).
- **`src/services/operations/supabase-operations-repository.ts`**: repositório Supabase para `companies`/`radarSignals`/`intelligenceItems`, mesmo padrão genérico de `editorial-repository.ts` (mapper camelCase↔snake_case field-by-field, confirmado paridade 1:1 com as 3 tabelas — nenhum campo perdido, nenhum inventado). Inclui `sweepExpiry` (mesma regra de expiração automática de sinais/itens publicados vencidos, agora via `update().in()` no Supabase) e a resolução de compatibilidade de id legado.
- **Feature flags** (`src/services/operations/operations-repository.ts`): `COMPANIES_SUPABASE_SOURCE` e `RADAR_INTELLIGENCE_SUPABASE_SOURCE` (env vars, default `false` = JSON). Radar e Inteligência compartilham uma única flag porque há FK real entre as tabelas no Postgres — não é possível ter uma em Supabase e a outra em JSON simultaneamente. **Import dinâmico** (`import("./supabase-operations-repository")`, não estático): um import estático quebraria toda leitura/escrita em JSON (inclusive com a flag desligada, inclusive em testes sem Supabase configurado) porque `@/lib/supabase` cria o client já no module-load — encontrado e corrigido durante a implementação (rodar a suíte de testes existente antes de prosseguir revelou a quebra imediatamente).
- **Migração**: `scripts/migrate-operations-to-supabase.ts` (`npm run migrate:operations -- --preview|--apply`), preview por padrão, idempotente, produz o mapa legacy_id→uuid→slug→name, protege por slug, aborta com divergência reportada em vez de decidir sozinho.

## Central de Curadoria

**Adiada para depois da Fase 9B.6**, conforme permitido explicitamente pelo plano mestre ("Implementação pode ocorrer junto da Fase 9B.1 ou depois da 9B.6, conforme auditoria real."). Justificativa: Radar e Inteligência acabaram de ser migrados e continuam vazios (nenhum sinal/item real publicado ainda); os demais insumos da Central (backfill pendente, alertas de orçamento com threshold configurado, falhas de monitoramento, mudanças de Agenda) dependem de fases ainda não executadas (9B.2–9B.7). Construir uma visão agregada agora produziria uma estrutura prematura e provavelmente incompleta/errada quando os insumos reais existirem — risco maior que o benefício de adiantar.

## Produção

`PRODUCTION_CODE_CHANGED=false`: nenhuma alteração de código/config em `/home/pedro/vtres60-blog`, nenhuma migration nova aplicada, nenhum flag ativado em `.env.production`/`ecosystem.config.js`. **Mas houve, sim, uma escrita real de dados em produção durante a validação desta fase — ver "Incidente" abaixo. A afirmação original desta seção, "PRODUCTION_CHANGED=false", estava incorreta e foi corrigida no fechamento de 2026-08-05.**

**Incidente real durante a validação (não apenas um "quase incidente")**: ao testar o script de migração contra um ambiente isolado, uma janela em que `.env.local` já tinha sido restaurado para as credenciais reais de produção enquanto variáveis de ambiente de linha de comando ainda apontavam para o stack isolado fez com que o `dotenv override:true` do script priorizasse `.env.local` — o script rodou de fato contra o Supabase real de produção e inseriu as 6 empresas reais na tabela `companies` (vazia até então) por uma janela real, breve mas real. **Detectado imediatamente** (verificação de contagem pós-execução, prática já estabelecida no projeto), **revertido imediatamente** (`DELETE` pelos 6 ids exatos, confirmado `count=0` de novo). Nenhum dado inventado foi inserido (eram as 6 empresas reais, com os UUIDs determinísticos corretos), a flag `COMPANIES_SUPABASE_SOURCE` nunca esteve ativa em produção, e o site público continuou servindo de `companies.json` o tempo todo — nenhum usuário real viu os dados temporariamente presentes na tabela. `PRODUCTION_PROCESS_INCIDENT=false` (nenhum processo PM2 foi tocado). Flags corretas para este incidente:

```text
PRODUCTION_DATA_INCIDENT=true
PRODUCTION_DATA_RESTORED=true
PRODUCTION_PROCESS_INCIDENT=false
PUBLIC_IMPACT_OBSERVED=false
DATA_LOSS=false
```

## Fechamento (2026-08-05) — proteção de destino contra escrita acidental em produção

Ver `docs/runbook-migration-safety.md` para o guia operacional completo. Resumo do que foi corrigido:

- **Causa raiz confirmada**: `dotenv.config({override:true})`, presente em todo script de escrita deste projeto (`migrate-operations-to-supabase.ts`, `migrate-to-supabase.ts`, `backfill-excerpt-impact.ts`, `backfill-segmentos.ts`), fazia `.env.local` sempre vencer sobre qualquer variável já presente no processo — o inverso do que a intuição de um operador esperaria ao passar uma variável explícita na linha de comando.
- **Auditoria global**: todo script em `scripts/` que pode escrever em Supabase/Postgres/Storage foi mapeado (`migrate-operations-to-supabase.ts`, `migrate-to-supabase.ts` — que antes não tinha NENHUM gate `--apply`, escrevia incondicionalmente —, `backfill-excerpt-impact.ts`, `fase5-dry-run.mts`). `backfill-segmentos.ts` é só leitura (nunca escreve no banco) — recebeu a resolução segura de env por consistência, sem o guard de escrita completo.
- **`scripts/lib/safe-target.ts`** (novo, compartilhado): `loadEnvSafely()` (nunca `override:true` — variável já presente no processo sempre vence; conflito real entre processo e arquivo aborta com `ENV_DESTINATION_CONFLICT`, nunca decide sozinho), `resolveDestination()` (identifica `LOCAL`/`TEST`/`STAGING`/`PRODUCTION`/`UNKNOWN` a partir da URL, nunca lê a service role key), `assertSafeToWrite()` (`FAIL_CLOSED` para destino `UNKNOWN`; contra o project ref de produção confirmado — `fdsojpwznvephwdoghbn` — exige simultaneamente `--allow-production`, `--apply`, dry-run desativado, manifest gerado, idempotency key e ator registrado), `buildManifest()`/`writeManifest()` (manifest determinístico — mesmo idempotencyKey para a mesma operação repetida —, gravado em `.migration-manifests/`, fora do controle de versão, nunca contém secrets).
- **Todos os 4 scripts de escrita real** foram atualizados para usar essa proteção compartilhada. `migrate-to-supabase.ts` ganhou, pela primeira vez, um modo dry-run por padrão (antes escrevia sempre, sem nenhuma flag `--apply`).
- **Validação real, não só unitária**: com `.env.local` (que já estava restaurado às credenciais reais de produção) apontando de fato para `https://fdsojpwznvephwdoghbn.supabase.co`, rodar `migrate-operations-to-supabase.ts --apply` (sem `--allow-production`) — a réplica exata do cenário que causou o incidente original — abortou corretamente com `FAIL_CLOSED` **antes** de qualquer `upsert`, com manifest gerado e destino identificado corretamente como `PRODUCTION`. Contagem confirmada em produção antes/depois: `0/0/0`, sem alteração. Separadamente, contra um stack Supabase local isolado (Postgres+PostgREST, descartável, nunca reaproveitando `v360-fase5-db-lab` de outro projeto), o caminho de sucesso completo (`--apply` sem precisar de `--allow-production`, já que o destino é `LOCAL`) foi executado duas vezes seguidas: 6 inserções na primeira, 0 inserções/6 atualizações na segunda, mesmo `idempotencyKey` nas duas execuções — idempotência real, não apenas testada com mock.
- **62 testes novos** (32 em `safe-target.test.ts`, 8 em `migrate-operations-to-supabase.test.ts`, 5 em `migrate-to-supabase.test.ts`, 2 em `scripts-safety-audit.test.ts` — uma auditoria automática que falha se um script novo de escrita não importar a proteção, ou se qualquer script voltar a usar `override:true` em código real). Cobrem os 22 cenários exigidos: env explícito local, `.env.local` isolado, conflito entre os dois, destino desconhecido, os 7 requisitos individuais do guard de produção (cada um isoladamente ausente bloqueia), execução local e de teste válidas, dry-run nunca escreve, escrita bloqueada nunca chama Supabase, secrets nunca aparecem em manifest/log, UUID v5 permanece determinístico, segunda execução não duplica, rollback preview incluído no manifest, e a auditoria automática de todos os scripts.
- **`TEST`/`STAGING` no tipo de destino**: presentes porque o plano exige a classificação completa, mas este projeto não tem projeto Supabase real de staging/test hospedado — todo teste isolado usa Postgres+PostgREST local via Docker (`kind=LOCAL`). A função nunca infere `TEST`/`STAGING` a partir de padrão de hostname (seria dedução); só reconhece esses valores via `SAFE_TARGET_ENV_LABEL` declarado explicitamente por um operador, e mesmo assim nunca reclassifica o project ref real de produção.
- **Regressão**: lint limpo, typecheck limpo, Vitest 628/2 skipped (era 581/2 — sem redução, +47 líquido), build de produção limpo (flags ligadas e desligadas), secrets scan limpo. Nenhuma UI pública alterada nesta etapa — Playwright/axe não re-executados (não exigidos pelo plano para mudanças sem superfície pública).
- **Produção**: nenhuma escrita nesta etapa de fechamento (confirmado `0/0/0` antes e depois). PM2: os 4 processos deste servidor mostraram restart_count=0 com PIDs novos e uptime idêntico entre si (~2h19min) no início desta sessão — consistente com um reboot da máquina ocorrido entre sessões, não com qualquer ação tomada aqui (nenhum comando `pm2`/`pkill`/`kill` foi executado nesta etapa). Site público confirmado saudável via HTTPS real (200 após redirect).

Flags finais desta etapa:

```text
ENV_PRECEDENCE_ROOT_CAUSE_CONFIRMED=true
AFFECTED_SCRIPTS_MAPPED=true
FAIL_CLOSED_DESIGN_VALIDATED=true
PRODUCTION_TARGET_GUARD_READY=true
DRY_RUN_DEFAULT=true
PRODUCTION_REQUIRES_EXPLICIT_ALLOW=true
PROJECT_REF_VALIDATION_READY=true
COMPANY_LEGACY_ID_MAPPING_VALID=true
COMPANY_UUIDS_DETERMINISTIC=true
COMPANY_MIGRATION_IDEMPOTENT=true
LEGACY_ADMIN_URLS_SAFE=true
RADAR_SUPABASE_SOURCE=false
INTELLIGENCE_SUPABASE_SOURCE=false
COMPANIES_SUPABASE_SOURCE=false
DATA_LOSS=false
PRODUCTION_DATA_INCIDENT=true
PRODUCTION_DATA_RESTORED=true
PRODUCTION_PROCESS_INCIDENT=false
PUBLIC_IMPACT_OBSERVED=false
PHASE_9B1_COMPLETE=true
READY_FOR_PHASE_9B2=true
READY_FOR_DEPLOY=false
```

## Testes e validação

Ver seção dedicada no relatório final (Parte D) para a lista completa. Resumo:
- **Vitest**: 28 novos testes (uuid-v5: 8, company-legacy-ids: 7, supabase-operations-repository: 15 — incluindo os 2 de regressão do bug 22P02) + suíte completa sem redução.
- **Postgres isolado real** (Docker `postgres:17`, descartável, nunca reaproveitando `v360-fase5-db-lab` de outro projeto): RLS deny-all confirmado (SELECT retorna 0 linhas, INSERT bloqueado), unique constraint de slug confirmado sob concorrência real (2 transações paralelas, exatamente uma falha), FK cascade confirmado (delete de radar_signal remove intelligence_item associado), migração da própria migration (DDL) idempotente (`create table if not exists`, reaplicada 2x sem erro).
- **Stack Supabase local isolado** (Postgres + PostgREST + proxy `/rest/v1`, tudo descartável): migração aplicada de verdade via o script real (não mock), 2 execuções consecutivas confirmando idempotência ponta a ponta (6 inserções → 0 inserções/6 atualizações), paridade campo a campo confirmada contra `companies.json`.
- **HTTP real contra servidor isolado** (porta 3999, `NEXT_PUBLIC_BASE_PATH=/blog`, ambas as flags ligadas): `/empresas` e `/empresas/weg` renderizam as 6 empresas reais; `/admin/empresas/company-weg` resolve corretamente após o fix do bug 22P02; login admin real; 404 limpo para id inexistente.
- **Playwright**: 11/11 em `admin.spec.ts`+`radar-intelligence-hubs.spec.ts` (`--workers=1`; falhas iniciais com workers paralelos eram rate-limit de login, já documentado no projeto — confirmadas como flakiness, não regressão, ao rodar isolado e serial). 3 falhas em `public-pages.spec.ts` são esperadas e não relacionadas: o stack isolado não tem posts reais (fora do escopo desta fase migrar conteúdo editorial).
- **axe**: 13/13 sem violações P0/P1, incluindo `/empresas/weg`, `/radar`, `/admin/empresas`, `/admin/radar`, `/admin/inteligencia` (a 1ª tentativa da suíte com 8 páginas administrativas em sequência estourou o timeout padrão de 30s do Playwright — sem relação com acessibilidade; passou limpo com timeout estendido).
- **Vitest final**: 581 passando / 2 skipped (583 total; baseline era 551/2 = 553 — sem redução, +30 líquido: 28 novos + 2 de regressão do bug 22P02).
- **Lint/typecheck/build**: `eslint . --max-warnings=0` limpo; `tsc --noEmit` limpo; `npm run build` limpo tanto com as flags desligadas (padrão) quanto ligadas (lendo o Supabase real de produção, só leitura, tabelas vazias, nenhuma escrita).
- **Secrets scan**: diff revisado; nenhum secret/token/chave em nenhum arquivo novo ou alterado; `.env.local` nunca commitado (git-ignored, confirmado).
- **PM2**: `vtres60-blog` (89 restarts), `vtres60-agent-worker` (1), `vtres60` (0) — idênticos ao último checkpoint conhecido (Fase 9B.0). `PRODUCTION_PROCESS_INCIDENT=false`.
