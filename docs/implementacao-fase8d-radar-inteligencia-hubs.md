# Fase 8D — Radar Industrial, Inteligência VTRES60 e Hubs Administráveis

**Data:** 2026-07-22
**Worktree:** `/home/pedro/vtres60-blog-fase8c` (branch `fase8c-dev`, derivada de `2918b1a`)
**Branch remota:** `feat/portal-funcional-fase8`
**Commit inicial:** `2918b1a`
**Commit final:** `17e7a58`
**Plano executado:** `docs/superpowers/plans/2026-07-22-fase8d-radar-inteligencia-hubs.md` (16 tarefas, execução orientada por subagentes com revisão em cada uma — ver `.superpowers/sdd/progress.md` para o ledger completo)

## Metodologia

Cada tarefa do plano foi implementada por um subagente "implementador" fresco e revisada por um subagente "revisor" independente (verificação de spec + qualidade de código), com correções aplicadas e re-revisadas até aprovação — nenhuma tarefa avançou com achado Crítico ou Importante em aberto. Duas tarefas de risco de processo (Task 13 — build/servidor isolado/Playwright/Lighthouse) foram executadas diretamente pelo controller (não por subagente) dado o histórico documentado de incidentes de `pkill` neste projeto; mesmo assim passaram pela mesma revisão de subagente independente ao final.

Protocolo de evidência seguido antes de qualquer alteração: confirmado por leitura direta de código que Radar Industrial e Inteligência VTRES60 eram 100% hardcoded em `page.tsx` (sem tabela, sem tipo — `docs/auditoria-funcional-home-fase8.md` reconfirmado), que a lista de empresas era um array estático sem CRUD, e que **0 de 29 posts** publicados tinham qualquer empresa associada (consulta SQL real, mesmo após as Fases 8B/8C).

Ao final das 16 tarefas, uma **revisão final de branch inteiro** (modelo mais capaz disponível, escopo cross-task — o que nenhuma revisão isolada por tarefa consegue ver) encontrou um bug real: a home renderizava `RadarSignal.tagIds` (ids reais de tags) como texto da hashtag e como slug do link, em vez de resolver para o nome/slug reais da tag — quebraria silenciosamente (link para página vazia, texto ilegível) no primeiro sinal real publicado com tags. Nenhuma das 16 revisões por tarefa pegou isso porque nenhuma exercitou a view populada da home com um sinal real contendo tags (só o estado vazio foi testado nas tarefas de home/validação). Corrigido com um `Map` de id→tag (mesmo padrão já usado em `/radar` para posts de evidência), verificado com uma fixture temporária real (nunca commitada) e re-revisado até aprovação ("Ready to merge: Yes"). Ver a seção "Bugs reais encontrados" abaixo para o registro completo.

## Arquitetura

Radar, Inteligência e Empresas seguem o **mesmo padrão de repositório JSON já usado para segments/events** (`operationsRepository`, `src/services/operations/operations-repository.ts`) — não Supabase. Motivo: a spec proíbe aplicar migração remota nesta fase, e este é exatamente o precedente já estabelecido pela Fase 8C para `agenda_events` (schema documentado, não aplicado; fonte de verdade real fica em JSON até uma decisão explícita de migrar). Um schema SQL completo foi escrito e documentado (`supabase-radar-intelligence-companies-schema-fase8d.sql`) para uma migração futura, mas **nada foi aplicado a nenhum banco**.

Validação de publicação é 100% server-side (`src/lib/radar/validate-signal.ts`, `validate-intelligence.ts`), espelhando `src/lib/agenda/event-publish-rules.ts` da Fase 8C: nenhuma rota confia no client, o estado validado é sempre o registro mesclado (atual + patch), e `sourceUrls` é sempre derivado server-side a partir do `sourceUrl` real dos posts de evidência — nunca digitado livremente pelo admin, tornando estruturalmente impossível inventar uma fonte.

## Radar Industrial

**Antes:** `src/app/page.tsx` — string fixa "IA industrial acelera projetos de eficiência..." e tags hardcoded (`["Inteligência Artificial","Automação","Dados industriais"]`).

**Depois:** `RadarSignal` (`src/types/operations.ts`) com `id, title, summary, evidencePostIds, sourceUrls, tagIds, segmentSlugs, companySlugs, confidence, generatedAt, validUntil, status, reviewedAt, publishedAt, createdAt, updatedAt`. Status: `draft → reviewed → published`, mais `expired` (varredura automática e idempotente na leitura, quando `validUntil` já passou) e `rejected` (terminal, definido pelo admin). Publicação bloqueada sem: evidência real (posts existentes e publicamente visíveis), `sourceUrls`, `validUntil` futuro, `reviewedAt`, e transição a partir de `reviewed`/`published` apenas.

Admin: `/admin/radar` (lista + criação + edição), com seletores reais de posts publicados, tags, segmentos e empresas (nenhuma fonte digitada livremente). Home: seção real, com estado vazio honesto quando não há sinal publicado. Página própria: `/radar`, lista todos os sinais publicados com evidência (link para o post real) e fontes.

**Estado atual:** nenhum sinal real foi criado ainda (correto — a spec exige aprovação administrativa manual, não geração automática). A seção pública mostra o estado vazio honesto até que um admin publique o primeiro sinal real.

## Inteligência VTRES60

**Antes:** array literal de 3 tuplas hardcoded em `page.tsx` ("Demanda emergente", "Sinal comercial", "Movimento digital").

**Depois:** `IntelligenceItem` com `radarSignalId` (obrigatório, deve referenciar um sinal real do Radar), `kind: "fact"|"analysis"|"recommendation"`, evidência própria (`evidencePostIds`/`sourceUrls`, também server-derivada), mesmo ciclo de status do Radar. Recomendação sem `recommendedAction` preenchido é bloqueada na publicação ("não apresentar recomendação como notícia"). Diferenciação visual real na home (badge por tipo: FATO azul / ANÁLISE VTRES60 roxo / RECOMENDAÇÃO âmbar).

Admin: `/admin/inteligencia`, com seletor de sinal real do Radar como origem obrigatória. **Estado atual:** vazio, honesto, pelo mesmo motivo do Radar.

## Hubs de empresas

**Antes:** array estático em `src/data/content.ts` (6 empresas), sem CRUD, sem admin, `contentRepository.listCompanies()` retornava o array direto.

**Depois:** `ManagedCompany` administrável via `/admin/empresas` (`id, name, slug, legalName?, description, sector, website, ticker?, tickerSource?, active, featured, createdAt, updatedAt`). As 6 empresas históricas foram migradas como seed real (`src/content/companies.json`, mesmo padrão de `events.json`/`segments.json` já commitados neste projeto) — **nenhum dado inventado**: os 4 sites que retornavam 200 direto via `curl` (gerdau.com, randon.com.br, deere.com, tramontina.com.br) foram usados como estão; os 2 bloqueados por WAF na raiz (weg.net, marcopolo.com.br) foram confirmados reais por evidência indireta (DNS resolvendo para CDN legítimo — Akamai/Cloudflare — e, no caso da WEG, seu subdomínio de RI ativo em `ri.weg.net` hospedado por um provedor real de IR/MZ Group), documentado explicitamente como fricção de acesso, não como dado não verificado.

`contentRepository.listCompanies()` agora computa `hasCoverage`/`postCount` reais (por nome exato de empresa em posts publicamente visíveis — mesma regra de matching já usada pelo pipeline do agente em `taxonomies.ts`, não alterada) e filtra empresas inativas incondicionalmente. A home só destaca empresas com `hasCoverage: true` — nunca uma sem post real, mesmo que marcada como destaque. **Estado atual:** 0 de 29 posts têm empresa associada, então a seção de Hubs mostra o estado vazio honesto na home hoje (comportamento correto e verificado por teste).

## Monitoramento (NewsFetcher) — decisão documentada

**MONITORING_IMPLEMENTED=false.** Reconfirmado: `src/lib/agent/nodes/news-fetcher.ts` faz uma única chamada GNews por execução do cron (keyword fixa de setor, 2x/dia), sem nenhum conceito de "monitorar empresa específica". Não existe nenhum enforcement de orçamento em nenhum node do grafo do agente (`provider_budget_settings` é só um painel de leitura em `/admin/custos`, nunca consultado por `news-fetcher.ts`/`workflow.ts`/rotas de trigger). Adicionar N consultas por empresa monitorada sem esse enforcement seria exatamente o tipo de mudança de custo não controlado que a spec proíbe explicitamente ("Não criar uma consulta por empresa sem avaliar custo"). Decisão: não implementado nesta fase — é um follow-up bem definido (construir enforcement real de orçamento primeiro, monitoramento por empresa depois).

## Migrations

`supabase-radar-intelligence-companies-schema-fase8d.sql` — documentado, **não aplicado** a nenhum banco. `companies`/`radar_signals`/`intelligence_items` com `id uuid` (entidades novas, sem id legado prefixado); referências a `posts` usam `text[]` (`evidence_post_ids`), nunca FK `uuid`, evitando o bug real da Fase 7 (`ERROR 42804`). RLS habilitado, sem policies (deny-all, mesmo padrão de todo o projeto — acesso real via `supabaseAdmin`/service_role no servidor).

## Admin

`/admin/empresas`, `/admin/radar`, `/admin/inteligencia` — CRUD completo, reaproveitando `CrudList`/`OperationsEditor` (empresas) e dois componentes novos (`RadarEditor`/`IntelligenceEditor`, com seletores reais de evidência). Backend nunca confia no client: toda tentativa de publicar sem evidência real, revisão prévia, ou (para Inteligência) sinal de origem real é bloqueada nas rotas (`422`), não só na UI — comprovado por testes de ataque direto ao backend (`publish-validation.test.ts` em `radar/` e `intelligence/`).

## Testes

**Novos (34 líquidos):** validação de publicação Radar (11) e Inteligência (8), ataque-direto-ao-backend Radar (4) e Inteligência (4), expiração automática de sinais (2), seed de companies (1), cobertura real de empresas (2), rotas de empresas (2). Total Vitest: **515 passando / 2 skipped** (era 481/2 no início da Fase 8D).

**Playwright:** 137/137 passando (suite completa, incluindo 4 cenários novos em `e2e/radar-intelligence-hubs.spec.ts` — home nunca mostra os arrays hardcoded antigos, `/radar` é real, Hubs só mostra empresa com cobertura real e comprovada por navegação até o hub, não apenas contagem de DOM).

**axe:** 13/13, incluindo `/radar` e as 3 novas telas admin (mesma sessão autenticada do teste já existente, sem login extra, respeitando o rate-limit documentado de 8 tentativas/15min).

**Lighthouse** (via Chromium do Playwright, mesma técnica da Fase 8C): `/radar` mobile 94/100/100/100 (perf/a11y/bp/seo), desktop 100/100/100/100; home mobile 64/100/100/100, desktop 99/100/100/100. Acessibilidade 100 em ambas as páginas após duas correções reais: contraste (`#667085`/`#3268bd`, compliant só em fundo claro, usados sobre o fundo escuro real de `.card`/`.head`/`.empty`) e skip-link sem alvo focável (`<main>` de `/radar` não tinha `id="conteudo"`, único ponto de topo do site sem essa convenção).

**Bugs reais encontrados e corrigidos durante a validação** (não apenas revisão de código — execução real):
1. Warning de lint (parâmetro `index` não usado).
2. Contraste em `/radar` (estado vazio) — fundo escuro real vs. cor pensada para fundo claro.
3. Skip-link sem alvo em `/radar` (Lighthouse a11y caiu para 98).
4. Contraste na view populada de `.card` (`.evidence`/`.sources`) — nunca testada antes porque `radarSignals.json` não tem seed (começa vazio por design); verificada criando uma fixture temporária real (post real + source_url real), rodando axe, depois removendo a fixture — **nenhum dado fictício foi commitado**.
5. Asserção de teste vazia (`toBeGreaterThanOrEqual(0)`, sempre verdadeira) substituída por prova real de cobertura.
6. Gap real do plano: o gate de auto-seed em `read()` não incluía `"companies"` — sem a correção, `companies.json` nunca seria populado (achado pelo próprio implementador da Task 3, corrigido pelo controller).
7. **Achado pela revisão final de branch inteiro (não por nenhuma das 16 revisões por tarefa):** a home resolvia `RadarSignal.tagIds` (ids reais de tags) direto como texto de hashtag e como slug de link, sem passar pelo nome/slug reais da tag — quebraria silenciosamente no primeiro sinal publicado com tags (link para página vazia via `/tags/[slug]`, que filtra por `slugify(nome)`, não por id). Corrigido resolvendo `tagId → {name, slug}` via `editorialRepository.listTags()`, mesmo padrão já usado em `/radar` para posts de evidência. Verificado com uma fixture temporária real (tag real "tag-automacao"/"Automação"/"automacao", nunca commitada): a home passou a renderizar corretamente `#Automação` linkando para `/tags/automacao`. Esse é exatamente o tipo de bug que só uma revisão de branch inteiro pega — nenhuma tarefa isolada testou a view populada da home com tags reais.

**Processos:** servidor de teste isolado sempre iniciado com PID capturado explicitamente. Um incidente evitado (não ocorrido): `$!` após `npx next start &` capturou o PID do wrapper `npm exec`, não do `next-server` real que ocupava a porta — identificado antes de qualquer kill por padrão, verificado que o PID órfão pertencia ao worktree e não a nenhum processo PM2, e a técnica de início mudou para invocar `node_modules/.bin/next` diretamente. Restart counts do PM2 de produção idênticos do início ao fim da sessão: `vtres60-blog: 88`, `v360-dashboard: 95`, `vtres60-agent-worker: 1`, `vtres60: 0`.

## Limitações conhecidas, documentadas não escondidas

- Radar e Inteligência estão funcionalmente completos mas **vazios em produção** até que um admin publique o primeiro sinal/item real — isso é o comportamento correto (estado vazio honesto), não um bug.
- O teste de Hubs cobre a lógica corretamente, mas seu ramo "populado" nunca foi exercitado contra dados reais (0/29 posts com empresa) — mecânica verificada por leitura de código, não por execução real end-to-end.
- Não existe cobertura de regressão permanente para a view populada de `/radar` nem para a seção Radar da home (as fixtures usadas para achar os bugs de contraste e de resolução de tags foram removidas, não commitadas) — um teste populado de verdade (ou um lint de contraste automatizado) seria mais barato a longo prazo do que repetir esse processo manual a cada mudança futura nessas seções.
- Monitoramento por empresa: avaliado, não implementado, follow-up bem definido (ver seção acima).

## Produção

**PRODUCTION_CHANGED=false.** Nenhuma alteração em `/home/pedro/vtres60-blog` durante esta fase. Nenhum deploy, nenhum merge para `main`, nenhuma migration aplicada, nenhum restart de PM2 fora do necessário para o próprio worktree isolado.

## Flags finais

- `RADAR_READY=true` (schema, validação, admin, home, página própria — todos implementados e testados; vazio até primeira publicação real)
- `INTELLIGENCE_READY=true` (idem)
- `HUBS_READY=true` (empresas administráveis, cobertura real, home coverage-gated)
- `MONITORING_IMPLEMENTED=false` (decisão documentada, follow-up definido)
- `READY_FOR_FINAL_DEPLOY=false` — deploy explicitamente fora de escopo desta fase, por instrução direta ("Não fazer deploy. Não mergear main."). O deploy final de Fases 8B+8C+8D continua sendo um passo separado e não iniciado.

## Bloqueadores concretos para um deploy futuro

Nenhum bloqueador técnico identificado nesta fase — o código está testado e funcional. O único pré-requisito real antes de um deploy útil é editorial: sem pelo menos um sinal de Radar e um item de Inteligência publicados pelo admin, essas seções aparecerão vazias em produção (correto, mas provavelmente não o resultado desejado no primeiro dia após o deploy).
