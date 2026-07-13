# Agente Autônomo V360 — Arquitetura e Memória de Projeto

> Documento de handoff. Escrito para que uma sessão de IA nova (sem memória das sessões anteriores) consiga entender o sistema, continuar o trabalho e **não repetir erros já resolvidos**. Se você é essa IA: leia a Seção 5 inteira antes de tocar em qualquer código deste pipeline.

---

## 1. Visão Geral da Arquitetura

- **Framework:** Next.js 15 (App Router), TypeScript, servido via `next start` gerenciado pelo **PM2** (processo `vtres60-blog`) em servidor próprio — não é serverless/Vercel. Site público roda sob `basePath: /blog` (`https://www.vtres60.com.br/blog`).
- **Banco de dados:** Supabase (Postgres). O projeto **migrou** de um repositório baseado em arquivos JSON (`src/content/*.json`) para Supabase — a camada de acesso é `src/services/editorial/editorial-repository.ts`, que expõe `editorialRepository` com a mesma API pública de antes (nenhum consumidor mudou na migração).
- **Orquestração do agente:** LangGraph (`@langchain/langgraph`), grafo compilado em `src/lib/agent/workflow.ts`. LLM: OpenAI `gpt-4o` via `@langchain/openai` (client único em `src/lib/agent/llm.ts` — trocar de provedor é editar só esse arquivo).

### Modelo híbrido de disparo

| Disparo | Rota | Auth | Comportamento |
|---|---|---|---|
| **Manual (Admin UI)** | `POST /api/admin/agent/stream` | Cookie de sessão do admin (`requireAdmin()`) | SSE ao vivo no painel (`AgentConsole`, `/admin/agente`). Dois botões: "Enviar para a fila" (com URL) e "Gerar Notícia Agora" (sem URL, cai no NewsFetcher). **Sempre gera `draft`** — há um humano observando o terminal, então nunca publica sozinho. |
| **Agendado (cron externo)** | `POST /api/agent/cron` | Bearer token (`AGENT_API_KEY`) | Chamado por um cron externo (hoje: cron-job.org, `0 5,17 * * *`, timezone `America/Sao_Paulo`). Responde `202` **imediatamente** e processa em segundo plano via `after()` do Next.js (necessário porque o pipeline completo passa fácil de 30s, e o timeout do disparador free é 30s). Publica automaticamente (`status: "published"`) se a auditoria aprovar. |
| **Genérico (machine-to-machine)** | `POST /api/agent/trigger` | Bearer token (`AGENT_API_KEY`) | SSE, existe para chamadas externas/futuras. Não é usado por nenhuma UI hoje. |

`isAgentRequestAuthorized()` (`src/lib/agent/require-agent-auth.ts`) centraliza a checagem de Bearer token, compartilhada entre `/api/agent/cron` e `/api/agent/trigger`.

---

## 2. O Banco de Dados e Fila (Supabase)

### Tabela `posts`
Corresponde ao tipo TypeScript `ManagedPost` (`src/types/editorial.ts`). Schema completo em `supabase-schema.sql`. Pontos relevantes:
- `id` é `TEXT`, não `UUID` — registros migrados do JSON legado usam ids prefixados (`post-slug-x`), registros novos usam `crypto.randomUUID()`. A coluna aceita os dois formatos.
- `category_id` / `author_id` / `tag_ids` são referências "soft" (sem `FOREIGN KEY`) — o código de leitura (`local-content-repository.ts`) já tolera referência ausente com fallback, então uma FK rígida mudaria esse comportamento.
- `slug` tem `UNIQUE` — é essa constraint do banco que dá a proteção contra race condition ao criar posts (`editorial-repository.ts` captura o erro Postgres `23505` e traduz pra mensagem amigável).
- `seo` é `JSONB`. Campos do Agente Autônomo guardados ali (via `SeoEntry` em `types/editorial.ts`):
  - `ogImage`: a imagem final escolhida (não confundir com `state.ogImage` do grafo, que é só a foto original candidata).
  - `companyLogoUrl`: **novo, adicionado pelo Agente** — URL do favicon/logo da empresa foco da matéria (ver Seção 3, ImageProcessor). Guardado dentro do JSONB em vez de coluna própria — **não exigiu migração de schema**.

### Tabela `agent_queue`
Schema em `supabase-queue-schema.sql`. Diferente de `posts`, é uma tabela nova sem dados legados, então usa tipos nativos (`uuid`, `timestamptz`).
```
id uuid primary key default gen_random_uuid()
url text not null
status text not null default 'pending'  -- 'pending' | 'processed'
created_at timestamptz not null default now()
```
Funções em `src/lib/agent/queue-repository.ts`: `enqueueUrl()`, `getOldestPendingUrl()`, `markProcessed()`.

**Como a fila dita prioridade sobre o RSS/GNews:**
- `/api/agent/cron`: busca `getOldestPendingUrl()`. Se existir, marca como `processed` **antes** de rodar o grafo (para não reprocessar o mesmo link se a execução falhar no meio) e usa a URL como `sourceUrl`. Se não existir nada pendente, roda o grafo sem `sourceUrl` → `PriorityRouter` cai no `NewsFetcher`.
- `/api/admin/agent/stream` (fluxo manual): se o usuário mandou uma URL pelo campo de texto, insere na fila **e já marca como processada** (a execução é síncrona/observada ali mesmo — a fila serve como audit trail, não como buffer nesse caso).

---

## 3. O Grafo (LangGraph Workflow)

Arquivo: `src/lib/agent/workflow.ts`. Estado compartilhado: `src/lib/agent/state.ts` (`AgentStateAnnotation`).

```
START --[PriorityRouter]--> ContentExtractor   (se sourceUrl já veio no state)
                        \--> NewsFetcher --[routeAfterNewsFetch]--> ContentExtractor (achou noticia)
                                                                \--> END (GNews falhou/0 artigos — aborta sem crash)
ContentExtractor --> Drafter --> InternalAuditor
InternalAuditor --[aprovado]--------------------> ImageProcessor --> Publisher --> END
InternalAuditor --[reprovado, < 3 tentativas]---> Drafter (com feedback)
InternalAuditor --[reprovado, esgotou tentativas]-> ImageProcessor --> Publisher (Publisher salva como draft)
```

### PriorityRouter
Não é um nó — é uma **conditional edge** a partir de `START` (`priorityRouter()` em `workflow.ts`). Decisão pura de roteamento, sem efeito no state, então o padrão idiomático do LangGraph é edge condicional, não nó. Lê `state.sourceUrl`: se preenchido, pula direto pro `ContentExtractor`; senão, vai pro `NewsFetcher`.

### NewsFetcher (`nodes/news-fetcher.ts`)
Busca via **GNews.io** (`GET https://gnews.io/api/v4/search`, `q`, `lang=pt`, `country=br`, `max=10`, `apikey`). **Substituiu o RSS do Google News** — ver Seção 5, é uma armadilha real que já foi resolvida, não reverter. LLM (`withStructuredOutput`) ranqueia os artigos por título+descrição e escolhe o de maior aderência ao nicho industrial B2B. Se a API falhar ou devolver 0 artigos, **não lança exceção** — devolve o state sem `sourceUrl`, e `routeAfterNewsFetch` manda o grafo pra `END` de forma graciosa.

### ContentExtractor (`nodes/content-extractor.ts`)
`axios.get(sourceUrl)` + `jsdom` + `@mozilla/readability` (o mesmo algoritmo do Modo de Leitura do Firefox). **Substituiu uma heurística própria com Cheerio** (`<article>` → `<p>`) que falhava silenciosamente em sites reais — ver Seção 5. Extrai duas coisas:
1. `og:image` do `<head>` — **precisa ser extraído ANTES de chamar `Readability.parse()`**, porque esse método mutila o DOM em memória como parte do próprio algoritmo; depois de rodar, a tag pode não estar mais acessível do jeito esperado.
2. O corpo do artigo via Readability → vira `sourceText`.

### Drafter (`nodes/drafter.ts` + `prompts.ts`)
A **persona V360**: "Redator Sênior da V360", tom maduro/direto/sem jargão de marketing, sem postura de guru digital. Regra de ouro: se a notícia for de outro segmento, adaptar a dor pro chão de fábrica industrial. Sempre cita a V360 como parceira estratégica com um CTA — **e esse CTA precisa ser o último parágrafo, isolado, sem dado novo** (isso é crítico para o Auditor funcionar corretamente, ver Seção 5). Também extrai `imageKeyword` (3 palavras em inglês, pro ImageProcessor) e `companyDomain` (domínio oficial da empresa foco da matéria, `nullable()` — vira `undefined` no state se a matéria não tiver empresa específica).

Tem loop de correção: se `state.auditFeedback` estiver preenchido (reprovação anterior), o motivo específico é injetado no prompt pra corrigir só aquilo, sem reescrever do zero.

### InternalAuditor (`nodes/internal-auditor.ts` + `prompts.ts`)
Barreira de segurança anti-alucinação, com **duas frentes eliminatórias**:
1. **Fidelidade factual**: compara `draftText` com `sourceText`, frase por frase. Dado inventado (número, nome, citação que não existe no original) = reprovado. **Omissão não é falha** — resumir implica deixar coisas de fora, isso é edição normal, não alucinação (ver Seção 5, foi um bug real).
2. **Voz V360**: reprova jargão de marketing raso ("não é sobre isso, é sobre aquilo", travessão em excesso, metáfora forçada, frase de palco).

Máximo **3 tentativas** (`MAX_DRAFT_ATTEMPTS` em `drafter.ts`). Esgotadas as tentativas, o grafo **não** encerra em `END` — segue pro `ImageProcessor`/`Publisher` mesmo assim, mas o `Publisher` força `status: "draft"` nesse caso (revisão humana de emergência), nunca descarta o trabalho nem publica algo reprovado.

### ImageProcessor (`nodes/image-processor.ts`)
Duas cascatas independentes, uma pra imagem principal e outra pro logo — não dependem uma da outra.

**Imagem principal (`imageUrl`)**, em ordem de prioridade:
1. `og:image` do artigo original (se existir e for URL válida) — a foto real da matéria.
2. Replicate (`black-forest-labs/flux-schnell`, endpoint de modelo oficial sem fixar version hash, `Prefer: wait=30` + poll manual de fallback). Qualquer erro (incluindo `402 Insufficient credit`, que é o estado atual da conta) é capturado graciosamente.
3. Pexels (`api.pexels.com/v1/search`) — banco de imagens stock.
4. Placeholder (`via.placeholder.com`) — nunca deve travar o grafo.

**Logo da empresa (`companyLogoUrl`)**: se `companyDomain` existir, monta `https://www.google.com/s2/favicons?domain=${dominio}&sz=256` (Google Favicons API — ver Seção 5, **não é Clearbit**, essa troca já foi feita e testada). Sem fetch — a URL é resolvida direto pelo `<img src>` no front-end.

### Publisher (`nodes/publisher.ts`)
Reaproveita `editorialRepository.createPost()` (a mesma camada que o painel admin usa) em vez de um `INSERT` via `supabaseAdmin` duplicado — ganha de graça a checagem de slug único contra a constraint do banco (race-safe) e o mapeamento camelCase↔snake_case já testado. Se colisão de slug, tenta de novo com sufixo numérico (até 5 tentativas).

**Status final:**
```
status = (state.autoPublish && state.auditApproved) ? "published" : "draft"
```
- `autoPublish` é setado pelo **chamador** do grafo, não pelo Publisher: `true` só em `/api/agent/cron`. Fluxo manual (admin) nunca passa `autoPublish`, então fica `false` por default → sempre draft.
- Se `auditApproved` for `false` (chegou aqui só porque esgotou as 3 tentativas), força `draft` independente de `autoPublish`.

---

## 4. APIs e Variáveis de Ambiente

Arquivos: `.env.local` (prioridade mais alta no Next.js, inclusive em produção — ver Seção 5) e `.env.production` (fonte canônica documentada do projeto). Ambos devem ter os mesmos valores para as chaves compartilhadas. `.env.example` documenta os nomes sem valor.

| Variável | Propósito |
|---|---|
| `ADMIN_PASSWORD` | Login do painel admin (pré-existente, não é do Agente) |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_PATH` | URL pública e base path (`/blog`) do site (pré-existente) |
| `AGENT_API_KEY` | Bearer token compartilhado entre `/api/agent/cron` e `/api/agent/trigger` — protege as rotas machine-to-machine |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase público (anon key) — RLS deny-all em todas as tabelas, então essa key sozinha não lê/escreve nada |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente Supabase admin (`supabaseAdmin` em `src/lib/supabase.ts`) — bypassa RLS, uso exclusivo server-side |
| `DATABASE_URL` | Connection string Postgres direta — usada só pelo script de migração (`scripts/migrate-to-supabase.ts`), não pela aplicação em runtime |
| `GNEWS_API_KEY` | GNews.io — busca de notícias do `NewsFetcher` |
| `OPENAI_API_KEY` | LLM (`gpt-4o`) — usado em `NewsFetcher` (ranqueamento), `Drafter` e `InternalAuditor` |
| `PEXELS_API_KEY` | Banco de imagens stock, fallback nível 3 do `ImageProcessor` |
| `REPLICATE_API_TOKEN` | Geração de imagem via IA (Flux), fallback nível 2 do `ImageProcessor` — conta sem crédito hoje (`402`), cai pro Pexels automaticamente |

Chaves de valores reais **não estão neste documento** por segurança — estão em `.env.local` e `.env.production` no servidor.

---

## 5. Lições Aprendidas e Armadilhas Evitadas (CRÍTICO)

**Leia isto antes de mexer em qualquer coisa relacionada ao Agente.**

### PM2 + build do Next.js: cache velho quebra a hidratação silenciosamente
`next start` (rodando via PM2) carrega o bundle do servidor **em memória** na inicialização. Rodar `npm run build` de novo **não atualiza o processo já rodando** — só atualiza os arquivos em `.next` no disco. Se você rebuildar sem reiniciar o PM2, o processo continua servindo HTML que referencia chunks JS/CSS com hash **antigo**, que não existem mais em disco (foram sobrescritos pelo build novo). O sintoma é enganoso: a página renderiza normal no SSR (parece "certa" numa screenshot), mas o JavaScript do cliente nunca carrega (erro 400/404 nos chunks), então a hidratação do React falha silenciosamente e o site fica sem nenhuma interatividade. Em casos piores (build parcialmente sobrescrito no meio de uma reinicialização), pode virar um 500 puro no site inteiro.

**Regra fixa: todo `rm -rf .next && npm run build` (ou só `npm run build`) tem que ser seguido de `pm2 restart vtres60-blog`, sempre, sem exceção.** Depois do restart, confirme que o hash do chunk no HTML servido bate com o arquivo que existe em `.next/static/chunks/`:
```bash
curl -s https://www.vtres60.com.br/blog | grep -oE '_next/static/chunks/webpack-[a-z0-9]+\.js'
ls .next/static/chunks/ | grep '^webpack-'
# os dois hashes têm que ser iguais
```

### `.env.local` tem prioridade sobre `.env.production` — mesmo em produção
Ordem de carregamento do Next.js: `.env.production.local` > `.env.local` > `.env.production` > `.env`. Isso significa que se as duas chaves (`.env.local` e `.env.production`) tiverem valores **diferentes** pra mesma variável, `.env.local` vence, mesmo rodando `next start` em modo produção. Isso já causou um bug real (`AGENT_API_KEY` divergente entre os dois arquivos — o valor configurado no cron externo batia com `.env.production`, mas o processo real usava o de `.env.local`, dando `401` incorretamente). **Mantenha os dois arquivos sincronizados manualmente sempre que atualizar uma chave.**

### Google News RSS: link é redirect via JS, não a URL final
`news.google.com/rss/search?...` devolve itens com `<link>` apontando pra `news.google.com/rss/articles/...` — um redirecionamento que só resolve **executando JavaScript no navegador** (Google usa uma chamada interna `batchexecute` não documentada). `axios.get()` simples recebe `200` mas o conteúdo é a própria página do Google, não a notícia. **Foi substituído por GNews.io**, que devolve a URL direta do publisher. Não reverter para Google News RSS sem resolver esse problema de redirect primeiro (as opções consideradas foram: engenharia reversa do endpoint interno do Google, headless browser, ou trocar de provedor — escolhemos trocar de provedor).

### Cheerio + heurística de `<article>`: falha silenciosa em sites reais
A extração original usava Cheerio com a heurística "`<article>` se existir, senão `<body>`, filtra `<p>` com mais de 40 caracteres". Testado contra site real (`otempo.com.br`): a tag `<article>` ali é usada para o widget "Mais Lidas" da lateral, não para o corpo da notícia — a heurística extraía **0 caracteres**, sem erro nenhum. **Foi substituído por `@mozilla/readability` + `jsdom`** (o algoritmo do Reader Mode do Firefox), testado com sucesso em 3 sites brasileiros diferentes. `cheerio` foi removido das dependências do projeto (ficou sem uso).

### Clearbit Logo API está morta — nunca mais tentar usar
`https://logo.clearbit.com/${dominio}` **não resolve DNS**, confirmado contra dois resolvers públicos independentes (Google `8.8.8.8` e Cloudflare `1.1.1.1`) — não é problema de rede local, o subdomínio genuinamente não existe mais (provavelmente descontinuado após a aquisição da Clearbit pela HubSpot; o domínio raiz `clearbit.com` ainda resolve normalmente, só o subdomínio `logo.` não). **Foi substituído pela Google Favicons API** (`https://www.google.com/s2/favicons?domain=${dominio}&sz=256`), testada e confirmada funcionando (segue um redirect 301 interno do Google, depois `200`, `image/jpeg`) em domínios reais.

### EventSource nativo não envia headers customizados
O `EventSource` do browser só faz `GET` e não aceita header `Authorization` customizado. As rotas machine-to-machine (`/api/agent/cron`, `/api/agent/trigger`) usam Bearer token (`AGENT_API_KEY`) — chamar isso direto do painel admin exporia essa chave no bundle do navegador (variável não prefixada `NEXT_PUBLIC_`, não deveria nunca chegar no client). **Solução: rota separada `/api/admin/agent/stream`**, autenticada pelo cookie de sessão do admin (`requireAdmin()`, o mesmo mecanismo do resto de `/api/admin/*`), que o `AgentConsole` chama via `fetch()` + leitura manual do `ReadableStream` do corpo da resposta (não `EventSource`, porque também precisa mandar `sourceUrl` no body de um `POST`).

### Timeout de 30s do disparador de cron externo
Serviços gratuitos de cron HTTP (ex: cron-job.org) têm timeout curto (30s no plano free), mas o pipeline completo (várias chamadas de LLM + scraping + até 3 tentativas de auditoria) costuma passar disso. **Solução: `/api/agent/cron` responde `202 Accepted` imediatamente e processa em segundo plano via `after()` do `next/server`** — API oficial do Next.js pra isso, funciona tanto em servidor próprio quanto serverless (diferente de simplesmente não dar `await`, que só seria seguro aqui por acaso, por o processo ser persistente). Resultado da execução em segundo plano fica registrado via `operationsRepository.log()`, visível em `/admin/logs` — não em campo nenhum do JSONB de posts.

### O Auditor reprovando o que o próprio Drafter foi instruído a fazer
Bug real de prompt engineering, achado só num dry-run com chave de LLM real (não aparece em `typecheck`/`build`): o `Drafter` é instruído a sempre citar a V360 num CTA final; o `InternalAuditor` reprovava exatamente essa menção como "alucinação" (não está no texto original — o que é verdade, mas é esperado, não é falha) em ~2 de cada 3 execuções. Corrigido colocando essa exceção como a **primeira instrução** do prompt do Auditor ("REGRA ZERO"), repetida no fechamento — bullet no meio do prompt não era suficiente para o LLM respeitar de forma confiável. Um segundo bug relacionado: o Auditor também reprovava por **omissão** de detalhes do original (resumir implica deixar coisas de fora — isso não é alucinação), precisou de uma clarificação explícita e forte no prompt. **Se decidir alterar `AUDITOR_SYSTEM_PROMPT` ou `DRAFTER_SYSTEM_PROMPT` no futuro, rode pelo menos 3-5 execuções reais (com chave de LLM de verdade) antes de considerar a mudança pronta — esse tipo de regressão não aparece em nenhuma checagem estática.**

### Ambiente de desenvolvimento tem variáveis Supabase de outro projeto
O sandbox usado durante o desenvolvimento tinha `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` definidas globalmente no shell, de um projeto Supabase completamente diferente (não relacionado a este projeto). Isso causava `Invalid API key` sempre que um comando (`npm run build`, `npm run dev`, scripts de teste) rodava sem isolar essas variáveis explicitamente. **Sempre prefixar comandos de build/execução manual com `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY`** ao trabalhar nesse ambiente especificamente — isso não deve existir no servidor de produção real, mas vale checar (`env | grep -i SUPABASE`) se o sintoma reaparecer.
