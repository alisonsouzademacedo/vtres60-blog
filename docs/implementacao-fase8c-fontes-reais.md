# Fase 8C — Fontes reais para mercado, clima e agenda industrial

Branch: `feat/portal-funcional-fase8` (trabalho feito em worktree isolado `fase8c-dev`, ver seção A). Continuação da Fase 8B (commit `c063537`).

## A. Segurança

1. **Worktree**: todo o desenvolvimento ocorreu em `/home/pedro/vtres60-blog-fase8c` (branch `fase8c-dev`, criado a partir de `feat/portal-funcional-fase8` @ `c063537`). Nenhuma edição em `/home/pedro/vtres60-blog` (diretório original, servindo produção ao vivo via PM2).
2. **Risco dos JSONs**: documentado em detalhe em `docs/risco-runtime-json-fase8.md`. Causa raiz confirmada por leitura de código: `config-repository.ts`/`operations-repository.ts` leem `src/content/*.json` via `fs.readFile(process.cwd() + ...)` com `unstable_noStore()` — sem cache, sem build, toda requisição. `process.cwd()` de produção é fixo (`ecosystem.config.js`: `cwd: __dirname` = `/home/pedro/vtres60-blog`).
3. **Solução**: isolamento físico via git worktree (já em uso) — nenhuma migração de arquitetura necessária, nenhum plano de rollback necessário, porque nenhum código muda. Disciplina operacional, não mudança de sistema.
4. **Produção alterada acidentalmente**: **false**. Confirmado por `git status`/`git diff` restrito a `/home/pedro/vtres60-blog-fase8c` durante toda a fase.
5. **Achado colateral de segurança**: o `node_modules` deste worktree é um **symlink** para `/home/pedro/vtres60-blog/node_modules` (compartilhado com produção) — por isso nenhuma dependência npm nova foi instalada nesta fase (ver seção D, decisão de usar um script Python standalone para commodities em vez de uma lib de parsing de Excel).

## B. Clima

Detalhe completo em `docs/fontes-mercado-clima-fase8c.md`.

5. Fontes avaliadas: Open-Meteo, INMET.
6. Fonte escolhida: **INMET** (`apiprevmet3.inmet.gov.br`) — Open-Meteo tem tier gratuito com **uso comercial explicitamente bloqueado** ("Commercial use: ❌" em `open-meteo.com/en/pricing`), incompatível com o VTRES60 sendo um site comercial de agência.
7. Documentação: órgão federal (INMET/Ministério da Agricultura e Pecuária), sem página de termos dedicada encontrada, mas sujeito à Política de Dados Abertos do Executivo Federal.
8. Licença: dado público, sem chave, sem restrição de uso comercial encontrada.
9. Chamada real: `GET /previsao/4316907` (Santa Maria/RS) confirmada — HTTP 200, JSON válido.
10. Santa Maria: implementada como padrão (`DEFAULT_CITY`), Joinville removida.
11. Geolocalização: opt-in por botão, nunca automática; coordenada arredondada; nunca enviada a analytics/Supabase; sempre permite voltar a Santa Maria.
12. Cache: 10 minutos, em memória, por cidade.
13. Estados: `delayed` (previsão real, não é leitura instantânea) e `unavailable` — nunca `live` (é previsão por período do dia, não estação em tempo real).
14. Testes: 9 testes em `weather-provider.test.ts`.

**WEATHER_READY = true**, com a limitação documentada de que "usar minha localização" só cobre as 27 capitais estaduais como referência (não os 5.570 municípios), e que é previsão, não leitura de estação ao vivo.

## C. Moedas

Detalhe completo em `docs/fontes-mercado-clima-fase8c.md`.

15. Fontes avaliadas: Banco Central do Brasil (PTAX/Olinda).
16. Fonte escolhida: BCB/PTAX — único candidato avaliado (spec pede avaliar BCB primeiro; não foi necessário fallback).
17. Séries: `CotacaoDolarDia`/`CotacaoDolarPeriodo` (USD), `CotacaoMoedaDia`/`CotacaoMoedaPeriodo` (EUR e outras).
18. Compra/venda: ambos os campos existem na resposta; widget usa `cotacaoVenda`.
19. Frequência: diária, só dias úteis — confirmado vazio em fim de semana real.
20. Variação: calculada comparando os 2 últimos dias úteis do endpoint de período (sem lógica de calendário extra, sem divisão por zero).
21. Cache: 1 hora, em memória.
22. Testes: 8 testes em `currency-provider.test.ts`.

**CURRENCIES_READY = true**.

## D. Commodities

Detalhe completo em `docs/fontes-mercado-clima-fase8c.md`.

23. Fontes avaliadas: World Bank Commodity Markets (Pink Sheet).
24. Petróleo: "Crude oil, average", US$ 81,70/bbl (jun/2026) — `IMPLEMENT_MONTHLY_REFERENCE`.
25. Cobre: US$ 13.552/mt (jun/2026) — `IMPLEMENT_MONTHLY_REFERENCE`.
26. Alumínio: US$ 3.439/mt (jun/2026) — `IMPLEMENT_MONTHLY_REFERENCE`.
27. Aço: **`UNAVAILABLE_NO_RELIABLE_SOURCE`** — a planilha só tem minério de ferro, não aço; nenhuma outra fonte oficial gratuita encontrada. Nunca rotulado como aço.
28. Frequência: mensal (arquivo atualizado uma vez por mês pelo Banco Mundial).
29. Unidades: `$/bbl` (petróleo), `$/mt` (cobre/alumínio) — preservadas exatamente como a fonte publica.
30. Cards implementados: petróleo, cobre, alumínio (3).
31. Cards indisponíveis: aço (1, mostra "Dados indisponíveis" explicitamente).
32. Fontes oficiais: `worldbank.org/en/research/commodity-markets`, licença CC-BY.
33. Testes: 6 testes em `commodities-provider.test.ts`.

**Decisão de arquitetura**: dado extraído por script Python standalone (`scripts/refresh-commodities-reference.py`, fora do runtime Node) para `src/content/commodities-reference.json`, lido pelo provider sem parsing de Excel em tempo de requisição — evita adicionar dependência npm nova em um `node_modules` compartilhado com produção via symlink (ver seção A.5).

**COMMODITIES_READY = true** (3 de 4 indicadores implementados; aço honestamente indisponível).

## E. Agenda

Detalhe completo em `docs/validacao-eventos-fase8c.md`.

34. Fontes avaliadas: sites oficiais de cada evento (Febrava, Mercopar, Fenasucro & Agrocana).
35. Eventos confirmados: **Fenasucro & Agrocana** (data/cidade batem exatamente) → `published`/`official_verified`.
36. Eventos não confirmados: **Febrava** (confirmado **errado** — edição real é 2027, não 2026) e **Mercopar** (site é SPA, conteúdo não extraível sem JS) → ambos `candidate`/`unverified`, removidos da home pública.
37. Migration: `supabase-events-schema-fase8c.sql` — modelo documentado, **não aplicada**.
38. Pipeline: modelo híbrido implementado nos tipos (`ManagedEvent.status`: `candidate|verified|published|archived|cancelled`; `dataStatus`: `official_verified|manual_verified|unverified`) — descoberta→candidato→verificação→publicação existe como estrutura de dados; a etapa de "descoberta automática de candidato via notícia" não foi implementada (fora do escopo desta fase, que trata dos 3 eventos já cadastrados).
39. Admin: `operations-editor.tsx` atualizado com os 5 status e 3 níveis de verificação, mais campo de data de verificação e aviso visual quando um evento está `published` sem verificação. **Simplificação assumida**: não há bloqueio server-side impedindo publicar sem fonte (spec seção 18) — só o aviso visual no formulário. Gap documentado, não escondido.
40. Expiração: `src/lib/agenda/event-lifecycle.ts`, testada (18 testes), timezone `America/Sao_Paulo`, comparação date-only. `local-content-repository.ts` já aplica a regra na leitura (evento publicado expirado some da home mesmo sem um job rodando).
41. Job: função pura existe e está testada; **não conectada a nenhum agendador/cron em produção** (spec proíbe ativar job em produção nesta fase).
42. Testes: 18 testes em `event-lifecycle.test.ts`, mais os testes pré-existentes de `local-content-repository.test.ts` continuam passando com a nova regra de visibilidade.

**AGENDA_READY = true** para o modelo/lógica; 2 dos 3 eventos ficam como candidatos até confirmação adicional (decisão correta e honesta, não um bug).

## F. Engenharia

43. **Arquivos novos**: `src/lib/market/{types,currency-provider,weather-provider,commodities-provider,health}.ts` (+ `.test.ts` de cada), `src/lib/agenda/event-lifecycle.ts` (+ teste), `src/components/widgets/weather-widget.tsx`, `src/app/api/market/weather/route.ts`, `src/content/commodities-reference.json`, `scripts/refresh-commodities-reference.py`, `supabase-events-schema-fase8c.sql`, 4 documentos em `docs/`.
44. **Migrations**: 1 nova (`supabase-events-schema-fase8c.sql`), não aplicada.
45. **Testes novos**: 51 (25 providers de mercado + 8 health + 18 ciclo de vida de eventos — ver contagem exata por arquivo nos próprios arquivos de teste).
46. **Total da suíte**: 452 passando, 2 skipped (era 403 antes desta fase).
47. **Lint**: limpo (`npx eslint . --max-warnings=0`).
48. **Typecheck**: limpo (`npx tsc --noEmit`).
49. **Playwright**: **não executado nesta fase** — gap honesto, ver seção G.
50. **axe**: **não executado nesta fase** — mesmo gap.
51. **Lighthouse**: **não executado nesta fase** — mesmo gap.
52. **Build**: `npm run build` completo, isolado no worktree, sucesso (92 páginas geradas, incluindo a nova rota `/api/market/weather`).
53. **Secrets scan**: nenhuma chave nova introduzida (todas as fontes desta fase — INMET, BCB, World Bank — são públicas, sem autenticação).
54. **Commit**: ver abaixo.
55. **Push**: `origin/feat/portal-funcional-fase8`, via `git push origin fase8c-dev:feat/portal-funcional-fase8` (atualiza o branch remoto sem nunca dar checkout/merge no diretório de produção — técnica nova desta fase, análoga ao "build isolado em worktree" da Fase 6).

## G. Decisão

- 56. `WEATHER_READY = true` (com limitação documentada: só previsão por período, só 27 capitais como referência de localização)
- 57. `CURRENCIES_READY = true`
- 58. `COMMODITIES_READY = true` (3/4 indicadores; aço honestamente indisponível)
- 59. `AGENDA_READY = true` (modelo e lógica prontos; 2/3 eventos como candidatos até confirmação adicional — comportamento correto, não pendência técnica)
- 60. `READY_FOR_PHASE_8D = true`, com os seguintes bloqueadores concretos levados para a próxima fase:

## Bloqueadores concretos para fases futuras

1. **Validação UX/acessibilidade completa não executada** (Playwright/axe/Lighthouse desta fase específica) — a suíde existente continua passando (452 testes), mas os novos estados visuais (indisponível, carregando localização, permissão negada) não foram testados com navegador real nesta fase. Recomendado antes de expor a novos usuários em produção.
2. **Editorial**: decisão sobre a Febrava (manter como candidato aguardando revisão, ou já anunciar a cobertura de setembro/2027) é do Pedro — nenhuma correção de copy/data foi feita silenciosamente.
3. **Mercopar**: precisa de confirmação por outra via (a SPA não expõe conteúdo a scraping estático) antes de poder ser republicado.
4. **Geolocalização de clima**: cobre só capitais estaduais; expandir para todos os municípios exigiria uma fonte de geocodificação reversa completa (ex.: API de localidades do IBGE), não pesquisada nesta fase.
5. **Admin da Agenda**: falta validação server-side impedindo publicar evento sem fonte/verificação (hoje só há aviso visual no formulário).
6. **Aço**: nenhuma fonte oficial gratuita encontrada — se isso for um requisito de negócio, precisa de pesquisa dedicada (provavelmente envolve um provider pago).
