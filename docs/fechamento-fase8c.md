# Fechamento da Fase 8C — correções de localização, integridade da agenda e validação visual

Continuação da Fase 8C (commit `d5eac31`), mesma branch (`feat/portal-funcional-fase8`), mesmo worktree isolado (`fase8c-dev`). Protocolo de evidência (spec desta etapa, seção 1) seguido item a item: comportamento atual confirmado por leitura de código e chamada real antes de qualquer alteração, causa raiz confirmada, teste escrito e observado falhando antes da correção, só então corrigido.

## Comportamento anterior da localização

Confirmado por leitura de código (`weather-provider.ts` + `weather-widget.tsx` + `route.ts`, versão do commit `d5eac31`): a coordenada do usuário (após `navigator.geolocation`) era arredondada e comparada, via distância de Haversine, contra uma lista fixa de **27 capitais estaduais** (`REFERENCE_CITIES`) — a mais próxima vencia, com fallback para Santa Maria além de 400km. **Reproduzido**: uma coordenada em Caxias do Sul (RS, ~130km de Porto Alegre) resolvia silenciosamente para "Porto Alegre", sem nenhuma indicação de distância ou aproximação — exatamente o cenário que a auditoria de fechamento pediu para verificar.

## Causa

A limitação não era do INMET, e sim um corte de escopo autoimposto pela primeira versão desta fase. **Confirmado por chamada real**: `apiprevmet3.inmet.gov.br/previsao/{codigoIbge}` (o endpoint de previsão já em uso) funciona para **qualquer** município, não só capitais — testado com Alvorada/RS (`4300604`) e Caxias do Sul/RS (`4305108`), nenhuma das duas capital.

## Fonte real de estações — pesquisa e dados reais

**Descoberta desta etapa**: `https://apitempo.inmet.gov.br/estacoes/T` é uma API pública real do INMET (mesmo domínio/órgão, requer o mesmo `User-Agent` de navegador que o endpoint de previsão) com o catálogo completo de estações automáticas:

- **673 estações no total**, **477 com `CD_SITUACAO: "Operante"`** (ativas) e 196 com `"Pane"` (fora de operação) — confirmado por chamada real e inspeção do JSON completo.
- Campos por estação: `CD_ESTACAO` (código), `DC_NOME` (nome/cidade), `SG_ESTADO` (UF), `VL_LATITUDE`/`VL_LONGITUDE` (coordenadas reais), `CD_SITUACAO` (status), `DT_INICIO_OPERACAO`/`DT_FIM_OPERACAO`.
- Sem duplicidade de nomes entre estações ativas da mesma UF (confirmado programaticamente) — seguro usar nome+UF como chave para busca por município.
- Teste real: a estação mais próxima de Santa Maria (coordenadas do padrão do widget) é a própria estação **"SANTA MARIA/RS"**, a apenas **9,5km** de distância.

**Elo com o código IBGE**: o catálogo de estações não inclui o código IBGE do município diretamente. Resolvido via a API oficial do IBGE, `servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios` (já confirmada nesta fase para outros fins) — busca o nome da estação (normalizado, sem acento/case) na lista de municípios do estado da estação. Testado com sucesso para Santa Maria, Caxias do Sul e Dilermando de Aguiar (RS).

**Real-time (bloqueador, não resolvido)**: existe uma rota `apitempo.inmet.gov.br/estacao/{dataInicial}/{dataFinal}/{codigoEstacao}` que responde HTTP 204 (rota existe, mas sem conteúdo) para as datas testadas (hoje e ontem) — não foi possível confirmar uma leitura de estação em tempo real funcional dentro do orçamento desta etapa. A previsão por período (`apiprevmet3`) continua sendo a fonte usada; a leitura instantânea de estação permanece como bloqueador para uma fase futura.

## Seleção da estação mais próxima

Implementado em `src/lib/market/inmet-stations.ts` (TDD: `inmet-stations.test.ts` escrito e observado falhando — módulo inexistente — antes da implementação):

- `fetchActiveStations()`: busca o catálogo real, filtra só `Operante`.
- `nearestActiveStation()`: Haversine contra a lista de estações ativas, com distância máxima de **50km** (`MAX_STATION_DISTANCE_KM`) — mais conservador que o limite de 400km usado para capitais, porque agora a malha de referência é muito mais densa (477 pontos reais, não 27).
- `resolveLocationToCity()`: combina os dois passos acima + resolução de código IBGE, retornando `null` (nunca um palpite) se qualquer etapa falhar.
- `REFERENCE_CITIES`/`nearestReferenceCity` (mapeamento por capital) foram **removidos** de `weather-provider.ts` — a nova spec proíbe explicitamente escolher uma capital arbitrária como fallback, e a função antiga nunca chegou a rodar em produção (fase anterior não fez deploy), então a remoção não é uma regressão de comportamento ao vivo.

## Distância

Retornada e exibida ao usuário: `weather-widget.tsx` mostra "Estação mais próxima: {NOME} (~{distância} km da sua localização)" sempre que a resolução vier de geolocalização — nunca apresenta uma cidade sem indicar que é uma aproximação.

## Fallback

Quando nenhuma estação ativa está a 50km ou menos: a API (`/api/market/weather`) retorna os dados de Santa Maria com a flag `locationFallback: true`, e o widget mostra "Nenhuma estação próxima o suficiente foi encontrada — mostrando Santa Maria" — nunca escolhe uma capital arbitrária.

## Municípios não-capitais

Confirmado meta funcionando de ponta a ponta para município não-capital real (Caxias do Sul, RS) — tanto no teste unitário (`inmet-stations.test.ts`) quanto no E2E com rede mockada (`market-weather-agenda.spec.ts`, cenário "permissão concedida").

## Cache da localização

`getCachedWeather()` já cacheava por `city.ibgeCode` (não por coordenada) desde a primeira versão desta fase — confirmado que cidades diferentes (Santa Maria vs. resolução por estação) têm entradas de cache independentes, sem colisão (`weather-provider.test.ts`, teste "cidades diferentes têm cache independente"). O catálogo de estações (`inmet-stations.ts`) tem cache próprio de 24h (muda raramente), e a resolução de código IBGE por UF tem cache de 7 dias — nenhum dos dois usa latitude/longitude como chave de cache (só o UF/nome da estação, já arredondados/normalizados).

## GEOLOCATION_FULLY_SUPPORTED

**`true`**, com ressalva honesta: a cobertura agora é proporcional à densidade real da rede de 477 estações ativas do INMET (muito mais ampla que as 27 capitais da versão anterior), não uma promessa de cobertura de 100% do território — onde não há estação a 50km, o sistema informa isso explicitamente e volta para Santa Maria, nunca finge uma cobertura que não existe.

## Testes (localização)

10 testes novos em `inmet-stations.test.ts` (filtragem por status, User-Agent, estação mais próxima real vs. capital mais distante, fallback nulo, resolução de código IBGE, cache) + testes atualizados em `weather-provider.test.ts` (removidos os 2 testes do `nearestReferenceCity` descontinuado, mantidos/renomeados os demais).

---

# Agenda — validação server-side

## Validação anterior

Confirmado por leitura direta de `src/app/api/admin/events/route.ts` (POST) e `[id]/route.ts` (PATCH), versão do commit `d5eac31`: POST validava só presença de `name/slug/description/startDate/endDate`; PATCH não validava **nada** além de autenticação. Nenhuma verificação de `status`/`dataStatus`/`verifiedAt`/`officialUrl` em nenhuma das duas rotas — o aviso em `operations-editor.tsx` era puramente visual, no cliente.

## Falha server-side (reprodução real)

Escrito e confirmado FALHANDO um teste chamando as próprias funções de rota (`POST`/`PATCH` de `src/app/api/admin/events/`) diretamente — nova suíte `src/app/api/admin/events/publish-validation.test.ts` — antes de qualquer correção, comprovando: `ROOT_CAUSE_CONFIRMED=true`.

## Regra implementada

`src/lib/agenda/event-publish-rules.ts` (TDD: `event-publish-rules.test.ts` escrito e observado falhando — módulo inexistente — antes da implementação). `validateEventPublication()` só age quando o estado **final** desejado é `"published"`; qualquer outra transição (para `candidate`/`verified`/`archived`/`cancelled`) passa direto, mesmo saindo de `"published"`.

## Campos obrigatórios para publicar

- `name` não vazio;
- `startDate` e `endDate` presentes, com `endDate >= startDate`;
- `officialUrl` não vazio;
- `dataStatus` em `official_verified` ou `manual_verified` (nunca `unverified`);
- `verifiedAt` presente;
- status anterior em `verified` ou `published` — **nunca** direto de `candidate`, e criação (`POST`) nunca pode nascer já `published` (não há status anterior possível).

## Estados

Os 5 estados (`candidate|verified|published|archived|cancelled`) e os 3 níveis de verificação (`official_verified|manual_verified|unverified`) já existiam desde a primeira versão desta fase (seção E do relatório anterior) — o que faltava era a aplicação server-side, agora implementada.

## Febrava / Mercopar / Fenasucro

**Não alterados nesta etapa**, conforme instrução explícita da spec de fechamento (seção 9): Febrava continua `candidate`/`unverified` (a correção de data 2026→2027 continua pendente de decisão editorial do Pedro); Mercopar continua `candidate`/`unverified` (site SPA, sem confirmação estrutural); Fenasucro continua `published`/`official_verified` (todos os campos e a fonte já validados na etapa anterior desta fase).

## Testes (agenda)

12 testes unitários em `event-publish-rules.test.ts` (candidato/não-verificado/verified_at ausente/official_url ausente/data inválida/evento verificado pode publicar/transições que não passam pela regra) + 9 testes de integração direta às rotas em `publish-validation.test.ts` (chamada direta ao backend, client não contorna servidor, erro legível, arquivamento, cancelamento).

## AGENDA_SERVER_VALIDATION_READY

**`true`**.

---

# UX e acessibilidade

## Playwright

Build isolado (porta 3999, nunca produção), rede mockada via `page.route()` para as chamadas client-side de geolocalização (`/api/market/weather?lat=&lon=`) — **limitação documentada**: as chamadas server-side (INMET/BCB/World Bank, feitas pelo Server Component na renderização inicial) não são interceptáveis por `page.route()` (só mocka requisições do navegador), então os testes de render inicial verificam presença/honestidade de estado, não valores fixos.

Nova suíte `e2e/market-weather-agenda.spec.ts`, 10 testes: seção sem os mocks antigos (Joinville/R$5,48), cotações sempre com estado honesto, Santa Maria padrão, permissão concedida (estação real + distância), permissão negada, estação fora de alcance (fallback honesto), provider indisponível, evento publicado aparece, candidatos não aparecem (agenda e home).

**Suíte completa** (todas as specs existentes + a nova, todos os 4 viewports): **120 testes, 120 passando** — 1 falha intermitente encontrada e diagnosticada como o rate-limit de login pré-existente (8 tentativas/15min, já documentado desde a Fase 8B), confirmado por chamada HTTP direta (`429 Muitas tentativas`) e não por suposição; após reiniciar o processo isolado (zera o bucket em memória), o mesmo teste passou de forma limpa e reprodutível.

## axe

`/agenda` (pública) e `/admin/agenda` (autenticada, adicionada ao teste consolidado de sessão única já existente — não criado um novo login, por causa do mesmo rate-limit) adicionadas a `axe.spec.ts`. **P0/P1 encontrado e corrigido nesta etapa**: 5 ocorrências de `color-contrast` (serious) na home, causadas por `.sourceTag` (CSS novo desta fase) usando `#98a2b3` a 8px sobre fundo branco (contraste 2,57:1, mínimo exigido 4,5:1) — corrigido para `#667085` (4,97:1, mesmo tom já usado em outros textos pequenos do mesmo componente). **12/12 páginas/fluxos passam sem violações P0/P1 após a correção.**

## Lighthouse mobile

| Página | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|
| Home | 76 | 100 | 100 | 100 | 2.9s | 0 | 810ms | 1.3s |
| /agenda | 67 | 100 | 100 | 100 | 11.3s | 0 | 360ms | 1.0s |

## Lighthouse desktop

| Página | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|
| Home | 98 | 100 | 100 | 100 | 1.2s | 0 | 10ms | 0.4s |
| /agenda | 91 | 100 | 100 | 100 | 2.0s | 0 | 20ms | 0.3s |

**P0/P1**: nenhum — acessibilidade/best-practices/SEO em 100 nas 4 combinações.

**P2 real, documentado, fora do escopo desta fase**: LCP de 11,3s em `/agenda` mobile (reproduzido 2x, não é ruído de medição) — causado por `public/images/industrial/segmento-agronegocio.png`, um asset de **1,87MB** usado como `mainImage` do evento Fenasucro. **Confirmado que este arquivo e sua referência em `events.json` já existiam antes da Fase 8C** (não foi tocado por nenhuma alteração desta fase ou da etapa de fechamento) — é uma dívida técnica de otimização de imagem pré-existente, não uma regressão. Não corrigido nesta etapa (fora do escopo: afeta potencialmente outras páginas que usam a mesma imagem, é uma iniciativa de otimização de imagens mais ampla). Recomendado para uma fase futura.

---

# Engenharia

- **Arquivos novos**: `src/lib/market/inmet-stations.ts` (+ teste), `src/lib/agenda/event-publish-rules.ts` (+ teste), `src/app/api/admin/events/publish-validation.test.ts`, `e2e/market-weather-agenda.spec.ts`, este documento.
- **Arquivos modificados**: `weather-provider.ts`/`.test.ts` (remoção do mapeamento por capital), `route.ts` do clima (usa o novo resolvedor), `weather-widget.tsx` (mensagens honestas de estação/distância/fallback), `market-weather.module.css` (fix de contraste), `events/route.ts` e `events/[id]/route.ts` (validação server-side), `axe.spec.ts` (novas páginas).
- **Testes novos**: 10 (`inmet-stations`) + 12 (`event-publish-rules`) + 9 (`publish-validation`, integração de rota) + 10 (Playwright `market-weather-agenda`) = 41, menos 2 testes removidos (`nearestReferenceCity`, descontinuado) = **39 líquidos**.
- **Total da suíte Vitest**: **481 passando**, 2 skipped (era 452 ao final da primeira parte da Fase 8C).
- **Total Playwright**: **120/120 passando** (suíte completa, todos os viewports).
- **Lint**: limpo.
- **Typecheck**: limpo.
- **Build**: sucesso, isolado, porta 3999 (nunca produção).
- **Secrets scan**: nenhuma chave nova; nenhum segredo nos arquivos alterados.
- **Commit**: ver `git log` desta branch.
- **Push**: `origin/feat/portal-funcional-fase8`, mesma técnica seripe da primeira parte (`git push origin fase8c-dev:feat/portal-funcional-fase8`, nunca checkout/merge no diretório de produção).
- **Produção alterada**: **false** — confirmado por `git status` restrito a `/home/pedro/vtres60-blog-fase8c` durante toda a etapa.

# Decisão

- `PHASE_8C_COMPLETE = true`
- `READY_FOR_PHASE_8D = true`
- **Bloqueadores concretos**:
  1. Leitura de estação INMET em tempo real (não previsão por período) permanece não resolvida — rota real existe (`apitempo.inmet.gov.br/estacao/...`) mas retornou HTTP 204 nas datas testadas; precisa de investigação dedicada.
  2. Resolução de estação → código IBGE depende de correspondência exata de nome (normalizado) entre `DC_NOME` da estação e o nome oficial do município no IBGE — funciona para os casos testados, mas pode falhar silenciosamente (retornando `null`, nunca um palpite) para estações cujo nome não bata exatamente com a grafia oficial do IBGE. Nenhum caso assim foi encontrado nos testes reais, mas não foi auditado exaustivamente contra as 477 estações ativas.
  3. Febrava (correção de data 2026→2027) e Mercopar (verificação estrutural) continuam pendentes de ação humana/editorial — não é bloqueador técnico.
  4. Imagem de 1,87MB em `/agenda` (P2, pré-existente) — recomendada para uma fase de otimização de imagens.
  5. Admin da Agenda ainda não tem uma fila dedicada de "candidatos pendentes de revisão" (só o filtro genérico de status do `CrudList`) — funcional, mas não otimizado para o fluxo de revisão em massa.
