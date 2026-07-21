# Fontes reais — clima, moedas e commodities (Fase 8C)

Para cada fonte: protocolo de zero-dedução (spec seção 1) seguido item a item — documentado, chamada real executada, conteúdo validado.

## Clima

### Fontes avaliadas

| Fonte | Documentação oficial | Chave | Uso comercial | Resultado |
|---|---|---|---|---|
| Open-Meteo | `open-meteo.com/en/licence` (dados CC-BY 4.0) + `/en/pricing` | Não (tier grátis) | **Bloqueado no tier grátis** — página de pricing mostra "Commercial use: ❌" explicitamente; só planos pagos (Standard+) concedem licença comercial | Rejeitada nesta fase (sem assinatura paga contratada) |
| INMET (`apiprevmet3.inmet.gov.br`) | Órgão federal (Ministério da Agricultura e Pecuária) — sem página de termos dedicada encontrada (`/dadosabertos` retornou 404), mas sujeito à Política de Dados Abertos do Executivo Federal (Decreto 8.777/2016), mesma categoria já usada com sucesso para BCB/PTAX nesta fase | Não | Dado público federal, sem restrição de uso encontrada | **Escolhida** |
| INMET — catálogo de estações automáticas (`apitempo.inmet.gov.br/estacoes/T`) | Sem documentação formal encontrada, mas mesmo domínio/órgão do endpoint de previsão já em uso | Não | Dado público, usado para geocodificação, não para leitura de valor climático em si | **Escolhida (fechamento da Fase 8C)** — ver seção "Geolocalização" abaixo |
| INMET — leitura de estação em tempo real (`apitempo.inmet.gov.br/estacao/{datas}/{codigo}`) | Rota real (retorna HTTP 204 em vez de 404), mas não retornou dados nas datas testadas | Não | Não confirmado | Não implementada — retornou vazio (204) para as datas testadas; investigação encerrada por orçamento de tempo, ver "bloqueadores" |

### Fonte escolhida: INMET

- **Documentação**: `apiprevmet3.inmet.gov.br/previsao/{codigoIbge}` — endpoint usado pelo próprio site oficial do INMET (`tempo.inmet.gov.br`), confirmado por chamada real.
- **Licença**: dado público de órgão federal brasileiro. Nenhuma restrição de uso comercial encontrada (diferente do Open-Meteo).
- **Chamada real executada**: `GET /previsao/4316907` (Santa Maria, RS) — HTTP 200, JSON com estrutura `{ "4316907": { "21/07/2026": { "manha": {...}, "tarde": {...}, "noite": {...} } } }`.
- **Limitação técnica descoberta**: a API bloqueia o `User-Agent` padrão de curl/bots com *connection reset* (WAF) — funciona normalmente com um `User-Agent` de navegador comum. Implementado em `weather-provider.ts`.
- **Semântica confirmada**: é **previsão por período do dia** (manhã/tarde/noite), não leitura de estação em tempo real. Por isso `freshnessStatus` nunca é `"live"` para clima — sempre `"delayed"` (dado real, mas não instantâneo) ou `"unavailable"`.
- **Santa Maria, RS**: código IBGE `4316907`, definido como `DEFAULT_CITY` em `weather-provider.ts`. Joinville (mock antigo) removida.
- **Geolocalização**: opt-in por botão ("Usar minha localização"), nunca automática. Coordenada arredondada para 1 casa decimal (~11km) antes de qualquer uso, nunca enviada a analytics nem persistida no Supabase — só `localStorage` do navegador. Permite sempre voltar para Santa Maria.
- **Limitação de escopo assumida conscientemente**: a API do INMET só aceita código IBGE de município, não latitude/longitude arbitrária. Implementar geocodificação reversa completa (5.570 municípios) estava fora do orçamento desta fase — em vez disso, `REFERENCE_CITIES` cobre as 27 capitais estaduais (fatos públicos verificáveis: nome, código IBGE, coordenadas da sede), e a localização do usuário é casada com a capital mais próxima (distância de Haversine, com fallback para Santa Maria se nenhuma capital estiver a menos de 400km). Documentado como gap honesto, não escondido.
- **Cache**: em memória, 10 minutos de TTL por cidade (`WEATHER_CACHE_TTL_MS`), evita chamar a API a cada renderização.
- **Testes**: `src/lib/market/weather-provider.test.ts` — Santa Maria válida, User-Agent de navegador, timeout/erro de rede, HTTP não-200, código IBGE ausente, cidade de referência diferente, cache por cidade, arredondamento de coordenada, cidade mais próxima, fallback para Santa Maria.

### Bloqueadores / não implementado nesta fase

- Leitura de estação automática em tempo real (temperatura "ao vivo" de verdade) — não pesquisada; a previsão por período é o que foi validado e implementado.
- Geocodificação reversa completa (todos os municípios) — só as 27 capitais estaduais estão cobertas como referência de "localização mais próxima".

## Moedas

### Fonte escolhida: Banco Central do Brasil — PTAX (Olinda API)

- **Documentação/endpoint**: `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata` — API pública oficial do Banco Central, formato OData/JSON, sem chave.
- **Endpoints confirmados por chamada real**:
  - `CotacaoDolarDia(dataCotacao=@dataCotacao)` — USD, um único registro por dia (já é o fechamento).
  - `CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)` — qualquer outra moeda (testado com EUR), retorna **todos** os boletins do dia (Abertura/Intermediário/Fechamento).
  - `CotacaoDolarPeriodo(...)` / `CotacaoMoedaPeriodo(...)` — intervalo de datas, usado para calcular variação.
- **Compra/venda**: campos `cotacaoCompra`/`cotacaoVenda` — o widget usa `cotacaoVenda` (cotação de venda, referência mais comum ao público).
- **Frequência confirmada**: diária, só em dias úteis. `CotacaoDolarDia` retorna array **vazio** em fins de semana (testado com um sábado real) — nunca "usa a última conhecida" silenciosamente, o provider trata isso como `unavailable` quando não há nenhum dia no período consultado.
- **Rótulo correto**: nunca "ao vivo" — sempre "PTAX (cotação de referência)", porque é fechamento diário, não streaming de mercado.
- **Semântica do "último boletim"**: para EUR (endpoint genérico), o rótulo do último boletim do dia varia entre `"Fechamento"` e `"Fechamento PTAX"` dependendo do dia — a regra implementada é pegar o registro de `dataHoraCotacao` mais recente por dia, **não** filtrar por `tipoBoletim` (rótulo inconsistente entre dias, confirmado por chamada real).
- **Variação**: calculada como `(atual - anterior) / anterior * 100`, comparando os dois últimos dias úteis retornados pelo endpoint de período (que já exclui fins de semana/feriados — sem necessidade de lógica de calendário adicional, sem divisão por zero possível já que só há registros de pregões reais).
- **Cache**: 1 hora (PTAX fecha uma vez por dia útil).
- **Testes**: `src/lib/market/currency-provider.test.ts` — resposta válida, formato, escolha do boletim mais recente (EUR), sem registro anterior (variação null), fim de semana/feriado (unavailable, nunca mock), API indisponível (exceção), cache e invalidação.

## Commodities

### Fonte escolhida: World Bank Commodity Markets ("Pink Sheet")

- **Documentação**: `worldbank.org/en/research/commodity-markets` — licença **CC-BY** (Creative Commons Attribution) confirmada na própria página.
- **Arquivo real**: `https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx` — baixado e parseado nesta fase (aba "Monthly Prices"), confirmando dado real: "Updated on July 02, 2026", última linha `2026M06`.
- **Frequência**: mensal. Não é dado em tempo real — nunca rotulado como "ao vivo".
- **Por que não parseamos XLSX em runtime**: o arquivo muda uma vez por mês; parsear planilha a cada requisição do site não faz sentido e evitamos adicionar uma dependência npm de parsing de Excel só para isso. Em vez disso, `scripts/refresh-commodities-reference.py` (script Python standalone, **fora** do runtime Node — não toca `node_modules` do projeto) baixa e extrai os valores relevantes para `src/content/commodities-reference.json`, que o provider (`commodities-provider.ts`) só lê.
- **Por que Python e não TypeScript**: o worktree desta fase compartilha `node_modules` com o diretório de produção via symlink (`ls -la` confirma) — rodar `npm install` ali escreveria pacotes novos direto no `node_modules` que o PM2 de produção usa, violando o isolamento desta fase. Um script Python standalone (`pip install openpyxl`, independente do projeto Node) evita esse risco por completo.

### Decisão por indicador

| Indicador | Série real (Pink Sheet) | Valor (jun/2026) | Decisão |
|---|---|---|---|
| Petróleo | "Crude oil, average" ($/bbl) | US$ 81,70 | `IMPLEMENT_MONTHLY_REFERENCE` |
| Cobre | "Copper" ($/mt) | US$ 13.552 | `IMPLEMENT_MONTHLY_REFERENCE` |
| Alumínio | "Aluminum" ($/mt) | US$ 3.439 | `IMPLEMENT_MONTHLY_REFERENCE` |
| Aço | — (planilha só tem "Iron ore, cfr spot", **não** aço/produto siderúrgico acabado) | US$ 100,80/dmtu (minério, não exposto como "aço") | `UNAVAILABLE_NO_RELIABLE_SOURCE` |

**Aço explicitamente não implementado**: a spec proíbe rotular minério de ferro como aço (seção 9) — nenhuma fonte oficial gratuita de preço de aço (produto siderúrgico acabado, distinto de minério de ferro) foi encontrada no orçamento de tempo desta fase. A interface mostra "Dados indisponíveis" para este card, não é omitida silenciosamente nem substituída pelo valor do minério.

### Cache e staleness

- `fetchedAt` gravado no JSON de referência no momento da extração.
- `stale` após 45 dias (referência mensal ficando velha, mas ainda mostrada com timestamp visível).
- `unavailable` após 100 dias (nunca mostra dado antigo indefinidamente — spec seção 13).

### Testes

`src/lib/market/commodities-provider.test.ts` — dado mensal real, aço nunca substituído por minério de ferro, stale (>45 dias), unavailable (>100 dias), série incorreta/ausente rejeitada, arquivo de referência ausente/inválido.

## Nomenclatura da seção (spec seção 11)

A seção foi renomeada de "Mercado industrial" para **"Referências de mercado"** — o nome antigo, combinado com o subtítulo antigo "Dados demonstrativos · 18:00" (removido), sugeria uma cotação única e atualizada. Como a seção agora mistura frequências reais diferentes (moedas diárias em dias úteis, commodities mensais), "referências" comunica melhor que nem tudo é "ao vivo". Mudança feita por necessidade de não induzir o usuário a erro, não por preferência estética.
