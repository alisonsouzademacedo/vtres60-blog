# Validação individual dos eventos da Agenda Industrial (Fase 8C)

Auditoria evento a evento contra a fonte oficial, protocolo de zero-dedução (spec seção 16). Nenhum evento foi assumido como existente só por já estar no `events.json` anterior.

## 1. Febrava

- **Site oficial cadastrado**: `https://febrava.com.br` (sem `www`).
- **Achado crítico**: o domínio `febrava.com.br` (apex, sem `www`) está **genuinamente inacessível** — confirmado com timeout de conexão na porta 443 (15s, testado 2x) e *connection reset* na porta 80, via `curl` local **e** via `WebFetch` (infraestrutura da própria Anthropic — ou seja, não é bloqueio deste ambiente específico, o domínio apex está fora do ar ou bloqueando de forma ampla).
- **`www.febrava.com.br` funciona** e foi usado para a verificação real.
- **Nome confirmado**: Febrava.
- **Edição/ano confirmado**: **2027**, não 2026.
- **Data confirmada**: "14 a 17 - Setembro | 2027" (14–17 de setembro de 2027).
- **Cidade/local**: São Paulo, SP — São Paulo Expo (bate com o cadastro anterior).
- **Divergência encontrada**: o `events.json` anterior tinha `"Febrava 2026"`, `startDate: "2026-09-15"`, `endDate: "2026-09-18"` — **objetivamente incorreto**. A Febrava é um evento bienal (a cada 2 anos); não existe edição em 2026, a próxima edição real é 2027.
- **Decisão tomada nesta fase**: `status` rebaixado de `"active"` para **`candidate`**, `dataStatus` de `"demonstrativo"` para **`unverified`** — deixou de aparecer na home/agenda pública (`isVisibleToPublic` exige `status === "published"`). `officialUrl` corrigida para a variante `www` que efetivamente responde.
- **O que NÃO foi feito**: as datas/ano do evento (2026 → 2027) não foram reescritas silenciosamente — corrigir a data/edição é uma decisão editorial de conteúdo (o evento pode ser removido da agenda, adiado editorialmente para a cobertura de 2027, ou mantido como candidato até nova checagem), não uma correção puramente técnica. **Pendente decisão do Pedro.**
- **Fonte**: `https://www.febrava.com.br`, verificado em 2026-07-21.

## 2. Mercopar

- **Site oficial cadastrado**: `https://mercopar.com.br`.
- **Acessibilidade confirmada**: HTTP 200, site responde normalmente.
- **Achado técnico**: o site é uma SPA (Single Page Application) — o HTML estático retornado (via `curl` e via `WebFetch`) contém apenas o texto "Mercopar", sem o conteúdo real (datas, local), que é montado via JavaScript no navegador. Nem `curl` nem `WebFetch` (que converte HTML para markdown, não executa JS) conseguiram extrair o conteúdo real da página.
- **Confirmação parcial anterior** (sessão antes do `/clear`): um `grep` no HTML bruto encontrou as palavras "2026" e "outubro" na página, compatível com `startDate: "2026-10-06"` do JSON — mas isso é evidência fraca (palavras soltas, não uma confirmação estruturada de data/local/edição).
- **Decisão tomada nesta fase**: `status` rebaixado para **`candidate`**, `dataStatus` para **`unverified`** — não aparece mais na home/agenda pública até confirmação real.
- **Pendente**: confirmar via outra abordagem (ex.: acessar a API/endpoint JSON que a SPA provavelmente consome internamente, ou aguardar disponibilidade de uma ferramenta que renderize JS) antes de poder marcar como verificado.

## 3. Fenasucro & Agrocana

- **Site oficial cadastrado**: `https://www.fenasucro.com.br`.
- **Nome confirmado**: "Fenasucro & Agrocana" (bate exatamente).
- **Edição/ano confirmado**: 2026.
- **Data confirmada**: "11 a 14 de Agosto de 2026" — bate exatamente com `startDate: "2026-08-11"` / `endDate: "2026-08-14"` do JSON.
- **Cidade/estado confirmado**: Sertãozinho, SP — bate exatamente.
- **Local (venue)**: o nome específico do venue ("Centro de Eventos Zanini") **não aparece explicitamente** na página oficial consultada — só a referência "Sertãozinho | SP" com link do Google Maps. Dado parcialmente confirmado (data/cidade sim, venue não verificado de forma independente).
- **Decisão tomada nesta fase**: `status` promovido para **`published`**, `dataStatus` para **`official_verified`**, `verifiedAt`/`publishedAt` registrados com a data desta verificação (2026-07-21). Continua aparecendo na home/agenda pública.
- **Fonte**: `https://www.fenasucro.com.br`, verificado em 2026-07-21.

## Resumo

| Evento | Status anterior | Status novo | Verificação | Aparece na home? |
|---|---|---|---|---|
| Febrava | active/demonstrativo | candidate/unverified | Confirmado **errado** (ano) | Não |
| Mercopar | active/demonstrativo | candidate/unverified | Inconclusivo (SPA) | Não |
| Fenasucro & Agrocana | active/demonstrativo | published/official_verified | Confirmado correto | Sim |

## Migration

`supabase-events-schema-fase8c.sql` documenta o esquema que corresponderia a este modelo se a Agenda migrar de `events.json` para o Supabase no futuro — **não aplicada**, a fonte de verdade continua sendo o arquivo JSON.

## Job de arquivamento

Lógica pura e testada em `src/lib/agenda/event-lifecycle.ts` (18 testes em `event-lifecycle.test.ts`): evento `published` cujo `endDate` já passou (comparação por data, fuso `America/Sao_Paulo`, nunca excluído) vira `archived` automaticamente. **Não há job/cron rodando em produção nesta fase** — a função existe e está testada, mas não foi conectada a um agendador real (spec proíbe ativar job em produção nesta fase). `local-content-repository.ts` já aplica a regra de visibilidade (`isVisibleToPublic`) na leitura, então mesmo sem o job rodar periodicamente, um evento publicado expirado já para de aparecer na home imediatamente (a única diferença é que o `status` no JSON continuaria `"published"` até o job rodar de fato — o efeito visível ao público já está correto hoje).
