# Auditoria Funcional Integral do Portal VTRES60 — Fase 8A

Data: 2026-07-20. Escopo: leitura e investigação apenas — nenhum código, migration, dado, ambiente, commit, push, deploy, restart de PM2 ou conteúdo foi alterado nesta fase.

Estado confirmado no início da auditoria:
- Git: branch `main`, commit `d95cbee`, working tree limpo (só `src/content/leads.json`/`logs.json` modificados — mutação de runtime esperada, nunca commitada).
- PM2: `vtres60-blog` e `vtres60-agent-worker` online; `vtres60`/`v360-dashboard` fora de escopo, não tocados.
- Supabase (`fdsojpwznvephwdoghbn`): `posts`=25, `categories`=13, `tags`=16, `authors`=1, `educational_articles`=11, `agent_queue`≈17-18, `agent_runs`=0, `agent_provider_usage`=0, tabelas de custo (Fase 7) todas em 0 linhas.
- **Não existem tabelas Supabase para**: segmentos, eventos/agenda, radar, oportunidades ("Inteligência VTRES60"), empresas/hubs, assinantes de newsletter, dados de mercado/clima. Todos esses domínios vivem em arquivos JSON em `src/content/*.json` (com CRUD via admin, no caso de segmentos e eventos) ou em arrays hardcoded em `src/data/content.ts` (sem nenhum CRUD, no caso de empresas), ou não existem de forma alguma (mercado, clima, radar, inteligência, WhatsApp).

---

## 1. Inventário de todas as seções (Home)

| Seção | Componente | Fonte de dados |
|---|---|---|
| Header | `header.tsx` | `settings.json` (portal), `categories` via Supabase |
| Hero | `hero.tsx` | `home.json` |
| Notícias em destaque | `featured-news.tsx` | Supabase `posts` |
| Últimas notícias + Seleção editorial | `page.tsx` (inline) | Supabase `posts` |
| Segmentos industriais | `segment-showcase.tsx` | `segments.json` (JSON com CRUD admin) |
| Seletor de setor ("personalize a curadoria") | `segment-selector.tsx` | array hardcoded em `src/data/content.ts` — **desconectado** do anterior |
| Agenda industrial | `agenda-showcase.tsx` | `events.json` (JSON com CRUD admin) |
| Radar industrial | inline em `page.tsx` | **100% texto hardcoded** no componente; só a lista de 4 empresas usa dado real (`companies`) |
| Inteligência VTRES60 | inline em `page.tsx` | **100% array hardcoded** de 3 itens no componente |
| Análise VTRES60 (CTA comercial embutido) | inline em `page.tsx` | **100% texto hardcoded**, contém o único link "Falar com um especialista" (mailto) |
| Hubs de empresas | inline em `page.tsx` | array hardcoded em `src/data/content.ts` (WEG, Gerdau, Marcopolo, Randon, John Deere, Tramontina) |
| Mercado industrial + Clima | `market-weather.tsx` | **100% hardcoded**, sem nenhuma chamada de API |
| Newsletter / Briefing Industrial | `newsletter-form.tsx` | `home.json` (copy) + `POST /api/leads` → `leads.json` |
| Footer | `footer.tsx` | `settings.json` (colunas/links 100% configuráveis) |

---

## 2. Inventário de todos os CTAs

| CTA | Destino real | Observação |
|---|---|---|
| Header → busca | `/buscar` | funcional |
| Header → "Assine grátis" (`settings.headerButton`) | `/#newsletter` | mesmo formulário do rodapé da home |
| Hero → "Acompanhar notícias" | `/noticias` | funcional |
| Hero → "Receber o briefing diário" | `/#newsletter` | mesmo formulário |
| Radar → "Abrir radar" | `/noticias` | **não existe página de radar** — link genérico para a listagem de notícias |
| Radar → tags (`#Inteligência Artificial` etc.) | `/tags/[slug]` | tags fixas hardcoded, não as tags reais do sinal (que não existe) |
| Inteligência VTRES60 → cada card | **sem CTA/link individual** | cards são só texto, "ação recomendada" não é clicável |
| Análise VTRES60 → "Falar com um especialista" | `mailto:especialista@vtres60.com.br` | **não é WhatsApp**; endereço não verificado nesta auditoria |
| Hubs → "Explorar hub" / cada empresa | `/empresas/[slug]` | rotas existem e respondem 200; hoje sempre mostram estado vazio (ver §11) |
| Hubs → "Todas as empresas" | `/empresas` | funcional |
| Newsletter → "Assinar Briefing Industrial" | `POST /api/leads` | grava lead; **não envia nenhum e-mail** (ver §6) |
| Footer → Últimas notícias / Mercado / Tecnologia / Segmentos | rotas reais | 200 confirmado |
| Footer → Sobre / Expediente / Política editorial / Privacidade | rotas reais | 200 confirmado |
| Footer → Newsletter | `/#newsletter` | mesmo formulário |
| Footer → Empresas acompanhadas | `/empresas` | funcional |
| Footer → Agenda industrial | `/agenda` | 200 confirmado |
| Footer → "Fale com a redação" | `mailto:portal@vtres60.com.br` | endereço diferente do CTA comercial; nenhum dos dois verificado |
| Footer → Preferências de cookies | `CookiePreferencesButton` | funcional (validado na Fase 7 via Playwright) |
| **CTA comercial via WhatsApp** | **não existe** | ver §5 |

Nenhum link "#" morto ou botão que só rola a página foi encontrado — o único ponto fraco de CTA é a ausência total de um canal comercial direto (WhatsApp) e o CTA de Inteligência VTRES60 sem destino clicável.

---

## 3. Inventário de todas as rotas

Públicas confirmadas (200 ao vivo): `/`, `/noticias`, `/noticias/[slug]`, `/categorias`, `/categorias/[slug]`, `/segmentos`, `/segmentos/[slug]`, `/agenda`, `/empresas`, `/empresas/[slug]`, `/buscar`, `/tags/[slug]`, `/sobre`, `/expediente`, `/politica-editorial`, `/privacidade`, `/sitemap.xml`, `/robots.txt`, `/rss.xml`.

Admin (`/admin/(protected)/*`): `agenda`, `agente`, `artigos`, `autores`, `backup`, `categorias`, `configuracoes`, `custos`, `destaque-editorial`, `hero`, `home`, `identidade-visual`, `leads`, `logs`, `midia`, `newsletter` (redireciona para `home#newsletter`), `noticias`, `segmentos`, `seo`, `tags`, `ultimas-noticias`.

**Não existem** páginas admin para: empresas/hubs, mercado industrial, clima, radar, inteligência/oportunidades, WhatsApp/CTA comercial.

---

## 4/5/6/14. Classificação funcional e dados falsos/estáticos (consolidado por seção)

### Header — **FUNCTIONAL**
Logo, busca, menu de categorias e botão de assinatura são todos reais e configuráveis. Sem achados.

### Hero — **FUNCTIONAL**
Título, subtítulo, botões e busca vêm de `home.json`, roteados corretamente. Sem achados.

### Notícias (destaque + últimas + seleção editorial) — **FUNCTIONAL**
Fonte real (Supabase `posts`), ordenação configurável, imagens e links corretos. Confirmado em Fases 6/7 via Playwright/Lighthouse.

### Segmentos industriais — **MISLEADING**
- `segments.json` tem CRUD real via `/admin/segmentos`, e a página `/segmentos/[slug]` responde 200.
- **Porém o campo "Quantidade de notícias" é um `NumberField` digitado manualmente no admin** (`operations-editor.tsx`), não um cálculo. Confirmado: **0 dos 25 posts reais têm qualquer `segment_slugs` populado** — a coluna existe no Supabase (`posts.segment_slugs`) mas **`publisher.ts` grava `segmentSlugs: []` incondicionalmente** (linha 164), nunca lida com nenhuma classificação da IA. Não existe nenhum passo de classificação de segmento no pipeline do agente (nenhuma referência a "segment" em `drafter.ts`/`state.ts`).
- Os números atuais (Metalurgia 12, Plástico 15, Têxtil 18...) são exatamente os valores de *seed* original de `src/data/content.ts` — nunca foram corrigidos para refletir a realidade (zero).
- **Classificação: MISLEADING** (parece uma contagem real e dinâmica, mas é 100% manual e desconectada de qualquer post real).
- **Achado adicional — taxonomia duplicada**: existe um **segundo** conceito de "segmento" em `src/data/content.ts` (`export const segments = [...]`, só os nomes), usado pelo componente `SegmentSelector` ("Seu setor em primeiro plano"). Esse seletor grava uma preferência em `localStorage` e tenta destacar cards com `data-segments` — mas como todo post real tem `segments=[]` (mesmo bug acima), **o destaque nunca acontece na prática**: a feature de personalização por setor está presente na UI mas é **BROKEN/NO_DATA_SOURCE** hoje.

### Agenda industrial — **MISLEADING**
- CRUD real via `/admin/agenda`, página `/agenda` responde 200, 3 eventos ativos hoje (Febrava 2026, Mercopar, Fenasucro & Agrocana).
- **Os 3 eventos têm `dataStatus: "demonstrativo"`** — o próprio sistema já rotula esses dados como não verificados, mas eles são exibidos na home e na agenda pública como se fossem informação real e confiável (datas, local, público esperado, expositores).
- **Não existe nenhuma lógica de expiração automática.** O filtro público é só `status === "active"` (campo manual); não há nenhuma comparação com `new Date()` contra `endDate` em nenhum lugar do código. Um evento cuja data já passou continuará aparecendo como "próximo" até um humano lembrar de mudar o status manualmente.
- **Classificação: MISLEADING** (dado explicitamente marcado como demonstrativo pelo próprio schema, mas apresentado ao público sem nenhum aviso, e sem mecanismo de expiração).

### Radar Industrial — **STATIC_DEMO**
- Todo o conteúdo (título do sinal, texto, tags) é **string literal fixa dentro de `page.tsx`** — não existe tabela, não existe geração por LLM, não existe edição administrativa, não existe `generated_at`/`valid_until`/`evidence_post_ids`.
- Único elemento real: a lista de 4 empresas vem de `companies` (mas essa lista em si é estática — ver Hubs). O rótulo "em acompanhamento" vs "contexto setorial" alterna por paridade do índice (`index % 2 === 0`), sem nenhum critério real.
- "Abrir radar" não leva a lugar nenhum específico — cai em `/noticias`.
- **Classificação: STATIC_DEMO / MISLEADING.**

### Inteligência VTRES60 — **STATIC_DEMO**
- Os 3 cards ("Demanda emergente", "Sinal comercial", "Movimento digital") são um **array literal hardcoded** no componente da home. Nenhuma evidência, fonte, data de geração, validade, segmento ou empresa associada. Nenhuma distinção visual entre fato/análise/recomendação (a spec pede isso explicitamente — hoje tudo é apresentado com o mesmo peso de afirmação).
- Nenhum CTA individual por card.
- **Classificação: STATIC_DEMO / MISLEADING.**

### "Análise VTRES60" (seção que contém o único CTA comercial) — **STATIC_DEMO**
- Texto 100% hardcoded. O único link de contato comercial do site inteiro (`mailto:especialista@vtres60.com.br`) está enterrado aqui, sem nenhuma relação com o conteúdo real do post/segmento visualizado.

### Hubs de empresas (WEG, Gerdau, Marcopolo, Randon, John Deere, Tramontina) — **PARTIAL**
- Lista de empresas é um **array hardcoded em código-fonte** (`src/data/content.ts`), sem tabela, sem CRUD admin, sem página de gestão.
- A vinculação real de posts a empresas **existe e funciona corretamente** (`publisher.ts` grava `companies: companyFilter.valid`, comparando contra o nome exato dos hubs válidos) — mas **nenhum dos 25 posts publicados até agora teve nenhuma empresa da lista mencionada/reconhecida**, então **todas as 6 páginas de hub mostram hoje o estado vazio real**: *"Ainda não há notícias monitoradas para WEG. Novas matérias são publicadas regularmente."* — confirmado ao vivo.
- Isso é honesto (não inventa dado), mas a home ainda ostenta a seção como "Hubs editoriais" / "Empresas acompanhadas" com tom de monitoramento ativo quando, na prática, zero cobertura existe até hoje.
- Tickers (WEGE3, GGBR4 etc.) são texto estático, não dado de bolsa ao vivo — mas também nunca são apresentados como se fossem (não há "R$" nem variação ao lado do ticker), então não são enganosos por si só.
- **Classificação: PARTIAL** (mecanismo real e correto, mas sem volume de dados reais ainda; lista de empresas em si sem gestão administrativa).

### Mercado Industrial + Clima — **STATIC_DEMO**
- **100% hardcoded, sem nenhuma chamada de API.** `market-weather.tsx` é um array fixo de 6 cotações (Dólar R$ 5,48, Euro R$ 6,41, Petróleo, Aço, Alumínio, Cobre) e um bloco de clima fixo ("Joinville, SC", 21°, "Parcialmente nublado").
- O rótulo já diz **"Dados demonstrativos · 18:00"** — mas o "18:00" é uma string fixa, nunca reflete a hora real, o que por si é enganoso (parece um horário de atualização real).
- Nenhuma localização configurável, nenhuma opção "usar minha localização", nenhum fallback para Santa Maria/RS (localização desejada pela especificação) — a cidade fixa hoje é Joinville/SC, sem relação com nenhuma configuração do portal.
- **Classificação: STATIC_DEMO** (a única seção que já se autodeclara "demonstrativa" — o problema não é a honestidade do rótulo, é que não existe *nenhuma* integração real por trás para eventualmente substituí-lo).

### Newsletter / Briefing Industrial — **NEWSLETTER_REGISTRATION_ONLY**
Ver §6 dedicado abaixo — classificação oficial do sistema de e-mail.

### Footer — **FUNCTIONAL**
Todos os links testados respondem 200; totalmente configurável via admin; sem achados.

### SEO técnico, Consentimento (LGPD), Meta Pixel — **FUNCTIONAL**
Já validados de forma extensiva na Fase 7 (Lighthouse 100/100/100 acessibilidade/boas práticas/SEO em home, /noticias e artigo; 56 testes Playwright cobrindo consentimento e Pixel, incluindo o bug de PageView duplicado corrigido). Não re-testado em profundidade nesta fase por já ter evidência recente e válida — apenas confirmado que a página home segue servindo 200 e sem erros de console além do já corrigido.

---

## 5. WhatsApp e CTA comercial

**Não existe nenhuma integração de WhatsApp no código-fonte.** Busca exaustiva por `wa.me`, `whatsapp`, `WhatsApp` em todo o `src/` não encontrou nenhum link, componente, evento de analytics (`whatsapp_click`) ou lógica relacionada — apenas:
- um nome de arquivo de imagem que contém a palavra "WhatsApp" (upload de uma fonte externa, sem relação);
- o campo genérico "Telefone / WhatsApp" no formulário de configurações institucionais (`/admin/configuracoes`), que hoje armazena o valor placeholder **`+55 11 0000-0000`** — um número obviamente fictício, DDD 11, sem nenhuma relação com o número informado pelo usuário (DDD 55).

**Não há conflito com nenhum número institucional real**, porque nenhum número real está configurado em lugar nenhum do projeto (banco, JSON, env, documentação). O único "canal comercial" hoje é o `mailto:especialista@vtres60.com.br` hardcoded na seção "Análise VTRES60" — sem nenhuma auditoria possível de encode de mensagem, nova aba, `noopener`, comportamento mobile ou evento de analytics, porque **o elemento simplesmente não existe**.

Seguindo a instrução do usuário (usar o número fornecido, normalizado, na ausência de conflito):
- Número normalizado: `555596634475`
- Destino recomendado: `https://wa.me/555596634475?text=Ol%C3%A1%2C%20vim%20pelo%20portal%20de%20notícias%20da%20VTRES60%20e%20gostaria%20de%20falar%20com%20um%20especialista.`
- **Esta auditoria não pode verificar que este número pertence de fato à VTRES60 ou está ativo no WhatsApp Business** — isso é uma dependência real do usuário (ver §19), não uma limitação técnica superável por investigação de código.

Nenhum `WHATSAPP_NUMBER_CONFLICT` foi encontrado.

---

## 6. Newsletter e Briefing — auditoria completa

Todos os pontos de entrada de assinatura (header "Assine grátis", hero "Receber o briefing diário", seção dedicada "Briefing Industrial", footer "Newsletter") convergem para **o mesmo componente** (`NewsletterForm`) e **o mesmo endpoint** (`POST /api/leads`) — não há fluxos divergentes nem duplicação de lógica, o que é positivo architeturalmente.

O que **existe e funciona de verdade**:
- Validação de e-mail (regex), obrigatoriedade de consentimento (checkbox), honeypot anti-bot (campo `website` oculto), rate limiting (5 tentativas / 10 min por IP).
- Gravação real em `operationsRepository.createLead()` → `src/content/leads.json` (arquivo de runtime, nunca versionado — confirmado 26 leads reais hoje).
- Log operacional de cada novo lead.
- Painel `/admin/leads` — "Consulte, filtre e exporte" os contatos.

O que **não existe, em nenhum grau**:
- **Nenhum provider de e-mail está integrado.** `src/services/integrations/lead-integration.ts` define `leadIntegrations = [new LocalOnlyIntegration()]`, cujo método `send()` é literalmente `async send(){return}` — um no-op. O comentário no próprio código diz: *"Futuras implementações: RD Station, HubSpot, Mailchimp, Brevo, Sheets e Webhook"* — nenhuma foi construída.
- Nenhum e-mail é enviado ao assinante em nenhum momento — nem confirmação, nem double opt-in, nem o próprio briefing.
- Nenhum unsubscribe, suppression list, tratamento de bounce/complaint, domínio remetente, SPF/DKIM/DMARC, template, cron de envio, fila, histórico de disparo ou métrica de e-mail existe, porque nada envia e-mail.
- `/admin/newsletter` é apenas um **redirect** para o editor de conteúdo da home (`/admin/home#newsletter`) — edita o texto do formulário, não gerencia campanhas nem assinantes de fato.

**Classificação oficial: `NEWSLETTER_REGISTRATION_ONLY`.**

Um cadastro hoje **nunca** resulta em envio de nenhum e-mail.

---

## 7. Segmentação das notícias — definições e proposta de taxonomia

Conforme solicitado, as três camadas devem ser tratadas como conceitos distintos:

- **CATEGORIA** — assunto editorial (já existe, real, Supabase `categories`, 13 categorias, `posts.category_id`, funcional).
- **TAG** — descritor complementar (já existe, real, Supabase `tags`, 16 tags, `posts.tag_ids`, funcional).
- **SEGMENTO** — setor industrial ao qual a notícia é diretamente aplicável (existe como coluna `posts.segment_slugs`, mas **nunca é preenchida** — bug confirmado em `publisher.ts:164`).

**Proposta de taxonomia e relacionamento (arquitetura recomendada):**
1. Adicionar ao `drafter.ts` um campo de classificação de segmento no schema Zod de saída (análogo a `companies`), com a lista de 10 segmentos válidos (`Metalurgia, Plástico, Têxtil, Moveleiro, Máquinas, Automotivo, Químico, Alimentos, Energia, Agronegócio` — os mesmos já usados em `src/data/content.ts`) como enum fechado.
2. Instruir explicitamente o LLM: associar um segmento **somente quando o setor tiver relação central ou aplicação industrial comprovável** no texto da notícia — nunca associar por proximidade temática fraca, e permitir **zero, um ou vários segmentos por post** (nunca todos).
3. `publisher.ts` passa a gravar `segmentSlugs: segmentFilter.valid` (mesmo padrão de `companies`), filtrando contra a lista de segmentos válidos vinda de `segments.json` (não do array estático de `content.ts`, que deve ser aposentado como fonte de verdade em runtime — hoje só serve de seed).
4. `segments.json`'s `articleCount` deixa de ser um campo digitado manualmente (`NumberField` no admin) e passa a ser **calculado em tempo de leitura** (`COUNT` sobre `posts.segment_slugs`), como já acontece implicitamente com tags/categorias via os relacionamentos reais.
5. Corrigir/aposentar o `SegmentSelector` (personalize por setor): ou (a) ligá-lo à mesma fonte real de segmentos pós-correção, garantindo que `data-segments` nos cards passe a bater com segmentos reais, ou (b) removê-lo até que exista volume suficiente de posts classificados para o filtro fazer sentido.
6. Backfill dos 25 posts existentes é **deliberadamente fora de escopo** (mesma política já registrada nas fases anteriores) — só posts publicados após a correção precisam ter segmento real.

---

## 8. Agenda Industrial — arquitetura recomendada

Estado atual: 3 eventos, todos `dataStatus: "demonstrativo"`, sem verificação de fonte oficial, sem expiração automática, CRUD manual via `/admin/agenda` sobre `events.json`.

**Arquitetura recomendada (modelo híbrido, conforme pedido):**

Tabela Supabase `industrial_events` (substituindo `events.json` como fonte de verdade — o JSON de eventos vira apenas seed inicial, mesmo papel que `posts.json` já tem hoje):

```
id text primary key
name text not null
slug text not null unique
status text not null check (status in ('candidate','verified','published','archived')) default 'candidate'
source_url text                 -- de onde o candidato foi descoberto
official_url text                -- site oficial do evento, confirmado
start_date date not null
end_date date not null
city text
state text
venue text
segment_ids text[] default '{}'
image text
verified_at timestamptz          -- quando um humano confirmou contra a fonte oficial
published_at timestamptz
archived_at timestamptz          -- preenchido automaticamente quando end_date < hoje
data_status text not null check (data_status in ('official_verified','manual','estimated','demonstrativo')) default 'demonstrativo'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Pipeline:
1. **Descoberta automática de candidatos** — reaproveitar o mesmo `NewsFetcher`/GNews já usado pelo agente de notícias, com uma consulta dedicada a feiras/eventos industriais brasileiros; grava como `status='candidate'`, `data_status='estimated'`.
2. **Verificação por fonte oficial** — passo (humano ou semi-automático) que confere data/local contra o `official_url` antes de promover para `verified`; só então `data_status` pode virar `official_verified`.
3. **Publicação** — `status='published'` é o único status exibido publicamente (substituindo o atual `status==='active'` puramente manual).
4. **Edição administrativa** — mesma tela de hoje, mas com os novos campos obrigatórios (`source_url`, `verified_at`).
5. **Arquivamento automático** — job diário (mesmo cron/worker que já existe) que seta `archived_at = now()` e `status='archived'` para todo evento com `end_date < hoje`, removendo-o da home/agenda pública sem intervenção manual. Isso resolve diretamente o risco atual de "evento expirado exibido como próximo".

**Recomendação explícita: não fazer scraping genérico sem manutenção.** O modelo acima usa a mesma infraestrutura de descoberta que já existe (GNews) e sempre passa por confirmação antes de virar dado público — não um scraper solto de sites de terceiros.

---

## 9. Radar Industrial — diagnóstico

Hoje: conteúdo 100% estático, sem tabela, sem geração, sem edição admin, sem `evidence_post_ids`/`source_urls`/`generated_at`/`valid_until`. As "empresas monitoradas" vêm da mesma lista estática de hubs (§11).

**Recomendação de arquitetura** (nova tabela `radar_signals`):
```
id uuid primary key default gen_random_uuid()
title text not null
summary text not null
evidence_post_ids text[] not null   -- obrigatório ter pelo menos 1
source_urls text[] not null default '{}'
tags text[] default '{}'
company_names text[] default '{}'
segment_ids text[] default '{}'
confidence text check (confidence in ('low','medium','high'))
status text check (status in ('draft','published','expired')) default 'draft'
generated_at timestamptz not null default now()
valid_until timestamptz
created_at timestamptz not null default now()
```
Geração: um novo nó no grafo do agente (ou um job periódico separado) que analisa os posts publicados nos últimos N dias e **só** produz um sinal quando houver pelo menos uma notícia-evidência real vinculada — nunca uma afirmação solta. Edição/aprovação administrativa antes de publicar (mesmo padrão de rascunho→publicado já usado em posts).

---

## 10. Inteligência VTRES60 — diagnóstico

Mesma situação do Radar: hoje 100% estático, sem diferenciação entre fato/análise/recomendação. **Recomendação**: tratar como uma extensão do mesmo `radar_signals` (ou uma tabela irmã `market_opportunities` com os mesmos campos de evidência), adicionando um campo explícito `kind: 'fact' | 'analysis' | 'recommendation'` que controla tanto o rótulo visual quanto a validação (uma `recommendation` nunca pode ser renderizada com o mesmo peso tipográfico de um `fact`).

---

## 11. Hubs de empresas — diagnóstico

Mecanismo de vinculação (`publisher.ts` + `taxonomies.ts`) está **corretamente implementado** — o problema é 100% de volume de dados (0 posts até agora mencionaram as 6 empresas da lista fixa), não de arquitetura. Pontos de melhoria:
- Promover a lista de empresas de `src/data/content.ts` para uma tabela real (`public.companies`) com CRUD admin — hoje qualquer alteração exige deploy de código.
- Considerar exibir a seção "Hubs editoriais" na home **condicionalmente** (`SHOW_WITH_REAL_DATA` só quando pelo menos 1 empresa tiver ≥1 post real vinculado) até que a cobertura orgânica cresça — hoje ela aparece incondicionalmente prometendo "empresas acompanhadas" sem nenhuma cobertura ainda.

---

## 12. Mercado Industrial — diagnóstico e fontes recomendadas

Nenhuma integração existe hoje. Fontes reais recomendadas (sem scraping):
- **USD/BRL, EUR/BRL**: Banco Central do Brasil (API PTAX, gratuita, sem chave) ou AwesomeAPI (`economia.awesomeapi.com.br`, gratuita, sem chave, mais simples de consumir).
- **Petróleo, Aço, Alumínio, Cobre**: commodities exigem um provider pago confiável (ex.: Alpha Vantage, Trading Economics, ou a mesma AwesomeAPI para os pares que ela cobre) — nenhum destes tem chave configurada no projeto hoje; **decisão de provider é uma dependência do usuário** (ver §19).
- Estados obrigatórios por indicador: `LIVE | DELAYED | STALE | UNAVAILABLE`, sempre acompanhados de fonte + horário + unidade — exatamente como a especificação pede. Quando um indicador não puder ser obtido com confiabilidade, **ocultar ou marcar como indisponível, nunca "demonstrativo"** — a seção precisa deixar de fingir que "18:00" é um horário real.
- Cache: como o app já tem o padrão de `getCachedProviderHealth()` (60s) para providers do agente, o mesmo padrão de cache (ex.: 15-30 min, jobs de câmbio/commodities não mudam a cada segundo) pode ser reaproveitado.

---

## 13. Clima — diagnóstico e arquitetura recomendada

Hoje: cidade fixa "Joinville, SC", sem nenhuma chamada de API. Recomendação:
- **Open-Meteo** (`api.open-meteo.com`) — gratuito, **sem necessidade de chave**, cobre temperatura atual/máxima/mínima/condição, ótimo candidato para não depender de credencial nova.
- Localização padrão: **Santa Maria, RS** (coordenadas fixas no código), com botão explícito "Usar minha localização" que só solicita `navigator.geolocation` **após o clique** (nunca automático/silencioso, nunca por IP) — preferência salva em `localStorage` (mesmo padrão já usado pelo `SegmentSelector`), com fallback para Santa Maria em caso de recusa/erro.
- Exibir sempre fonte ("Open-Meteo") e horário da última atualização.

---

## 14. Veracidade da interface — achados adicionais

Além do já descrito por seção:
- Nenhum link `href="#"` morto foi encontrado.
- Nenhum formulário que finge enviar sem de fato enviar (o único formulário real, de newsletter, envia de verdade para o backend — só não dispara e-mail depois).
- Nenhuma página vazia com conteúdo genérico não relacionado foi encontrada (os estados vazios existentes, como o hub da WEG, são honestos).
- O único "horário" falso apresentado como real é o "18:00" fixo do Mercado Industrial.

Classificação por seção (`SHOW_WITH_REAL_DATA / SHOW_EMPTY_STATE / HIDE_UNTIL_DATA / REMOVE / REBUILD`):

| Seção | Ação recomendada |
|---|---|
| Segmentos industriais | **REBUILD** (corrigir contagem para real antes de continuar exibindo) |
| Agenda industrial | **REBUILD** (arquitetura de verificação + expiração antes do próximo evento vencer) |
| Radar Industrial | **HIDE_UNTIL_DATA** (não existe geração real; manter fora do ar até existir) |
| Inteligência VTRES60 | **HIDE_UNTIL_DATA** (idem) |
| Hubs de empresas | **SHOW_EMPTY_STATE** (já faz isso corretamente — manter, mas considerar ocultar a seção inteira da home enquanto cobertura = 0) |
| Mercado Industrial + Clima | **HIDE_UNTIL_DATA** (remover "Dados demonstrativos" da home pública até haver integração real; nada substitui pior do que dado falso rotulado como atual) |
| Newsletter/Briefing | **SHOW_WITH_REAL_DATA** (captura é real — mas revisar a promessa de "briefing diário" enquanto não há envio nenhum, ver riscos) |

---

## 15. Ciclo de vida dos dados por módulo

| Módulo | Fonte de verdade | Ingestão | Validação | Publicação | Expiração | Admin |
|---|---|---|---|---|---|---|
| Notícias | Supabase `posts` | Agente autônomo (cron/manual) | Auditor interno (LLM) | `status` | não expira | `/admin/artigos`, `/admin/agente` |
| Segmentos | `segments.json` (hoje) | seed manual | nenhuma | `showOnHome` | não expira | `/admin/segmentos` (contagem manual — bug) |
| Newsletter | `leads.json` | formulário público | e-mail regex + honeypot + rate limit | imediata (grava) | nunca | `/admin/leads` (só consulta/exporta) |
| Agenda | `events.json` | seed + edição manual | nenhuma (`dataStatus` é auto-descritivo, não verificado) | `status` manual | **nenhuma** | `/admin/agenda` |
| Radar | inexistente | N/A | N/A | N/A | N/A | inexistente |
| Inteligência | inexistente | N/A | N/A | N/A | N/A | inexistente |
| Hubs | `src/data/content.ts` (código) | hardcoded | N/A | sempre "publicado" | N/A | inexistente |
| Mercado | inexistente | N/A | N/A | N/A | N/A | inexistente |
| Clima | inexistente | N/A | N/A | N/A | N/A | inexistente |
| Contatos | `settings.json` | admin | nenhuma | imediata | N/A | `/admin/configuracoes` |

---

## 16. Admin — o que já é administrável

**Sim**: artigos/posts, autores, categorias, tags, destaque editorial, home (copy), hero, identidade visual, SEO, custos/providers do agente, backup/restore, logs, mídia, segmentos (parcialmente — falta contagem real), agenda (parcialmente — falta verificação/expiração), leads (só consulta/exportação, não envio).

**Não**: empresas/hubs, radar, inteligência/oportunidades, dados de mercado, clima, contato comercial/WhatsApp, envio de newsletter/campanhas, providers de e-mail.

Nenhuma proposta de automação deste relatório (agenda, radar, inteligência, segmentos) depende de mecanismo sem tela de correção administrativa equivalente — todas as arquiteturas recomendadas nas seções 7-10 preveem edição humana antes da publicação.

---

## Riscos

- **LGPD/reputacional**: leads captados com "consentimento para receber newsletter" que nunca recebem nada — risco de reclamação e de descumprimento da expectativa criada no opt-in, mesmo sem envio de fato (a promessa em si já é o problema).
- **Reputacional**: dados de mercado/clima "demonstrativos" e eventos com `dataStatus=demonstrativo` expostos publicamente sem nenhum aviso ao visitante — se identificado por um usuário ou pela imprensa, mina a credibilidade editorial de um portal de notícias.
- **Técnico**: taxonomia de segmento duplicada (`data/content.ts` vs `segments.json`) é uma fonte fácil de bugs futuros se alguém editar só uma das duas achando que é a única.
- **Operacional**: nenhuma expiração automática de eventos é um risco silencioso — sem monitoramento, um evento vencido pode ficar meses como "próximo".

---

## Prioridades

- **P0**: nenhum bloqueador crítico de segurança/dados encontrado nesta auditoria (não há vazamento, não há dado destrutivo).
- **P1**: (a) corrigir `segmentSlugs: []` hardcoded no Publisher; (b) resolver a promessa de newsletter sem envio real (ou implementar provider, ou ajustar a copy para não prometer "briefing" até existir); (c) remover/rotular claramente "Dados demonstrativos" do Mercado Industrial e o `dataStatus=demonstrativo` da Agenda antes que cheguem a um leitor achando que é real.
- **P2**: arquitetura de eventos com expiração automática; arquitetura de Radar/Inteligência com evidência real; tabela de empresas com CRUD; integração de câmbio/clima real; WhatsApp comercial.
- **P3**: unificar/aposentar a taxonomia de segmento duplicada (`SegmentSelector`); páginas de gestão para mercado/clima/hubs.

---

## Plano de implementação (alto nível, por fase futura)

1. **Fase 8B — Segmentação real**: schema Zod do Drafter + `publisher.ts` + recalcular `articleCount` em tempo de leitura + remover campo manual do admin.
2. **Fase 8C — Agenda confiável**: nova tabela `industrial_events`, pipeline de descoberta→verificação→publicação→arquivamento automático (cron diário).
3. **Fase 8D — Mercado e Clima reais**: integrar AwesomeAPI/BCB (câmbio), decidir provider de commodities, Open-Meteo (clima) com Santa Maria como padrão e opt-in de geolocalização.
4. **Fase 8E — Newsletter de verdade**: escolher provider (Resend/Brevo/SendGrid), validar domínio remetente (SPF/DKIM/DMARC), implementar double opt-in + unsubscribe + pelo menos um template de briefing automatizado.
5. **Fase 8F — Radar & Inteligência com evidência real**: nova(s) tabela(s), nó de geração no agente (ou job separado), tela de aprovação editorial antes de publicar.
6. **Fase 8G — CTA comercial**: implementar link real de WhatsApp (pendente confirmação do número pelo usuário) com tracking de evento.
7. **Fase 8H — Hubs administráveis**: migrar `companies` de código para tabela com CRUD.

## Plano de testes

Cada fase acima deve seguir o mesmo padrão já estabelecido nas Fases 6/7 deste projeto: unit tests para lógica pura (cálculo de contagem, filtro de expiração, resolução de preço/estado de indicador), Playwright + axe para qualquer UI nova, e build isolado em git worktree antes de qualquer deploy — nunca contra o `.next` do PM2 real.

## Plano de deploy

Mesmo runbook já documentado e exercitado na Fase 7: branch de trabalho → checkpoint (backup + snapshot Supabase/PM2) → migrations em produção → merge sem force → deploy controlado (stop worker → build → restart blog --update-env → smoke test → restart worker).

---

## Dependências inevitáveis do usuário

Estas não podem ser resolvidas por investigação de código — dependem de decisão ou credencial externa:

1. **Confirmar que `55 9663-4475` é o número real e ativo de WhatsApp Business da VTRES60** (nenhuma fonte no projeto confirma isso; nenhum conflito foi encontrado, mas também nenhuma confirmação).
2. **Escolher e fornecer credencial de um provider de e-mail transacional/newsletter** (Resend, Brevo, SendGrid ou outro) e o domínio remetente a validar (SPF/DKIM/DMARC) — sem isso, nenhum e-mail jamais vai sair, independente do código.
3. **Escolher provider de dados de commodities** (aço, alumínio, cobre) — câmbio e clima têm opções gratuitas sem chave (AwesomeAPI/BCB, Open-Meteo), mas commodities industriais normalmente exigem um provider pago; Pedro precisa decidir orçamento/fornecedor.
4. **Confirmar se `especialista@vtres60.com.br` e `portal@vtres60.com.br` são caixas de e-mail reais e monitoradas** — não verificável tecnicamente sem acesso a essas caixas.
5. **Decisão editorial**: manter Radar/Inteligência fora do ar até existir geração real, ou aceitar mantê-los como estão (estático) por ora — é uma escolha de produto, não técnica.

---

## Decisão final

**READY_FOR_IMPLEMENTATION = false**

Bloqueadores exatos (todos endereçáveis, nenhum é falta de acesso técnico ao próprio projeto):
1. Ausência de decisão sobre provider de e-mail (newsletter não pode ser corrigida sem essa escolha).
2. Ausência de confirmação do número de WhatsApp como canal oficial ativo.
3. Ausência de decisão sobre provider de commodities (câmbio/clima já têm caminho gratuito claro; commodities não).
4. Ausência de decisão editorial sobre o destino de Radar/Inteligência VTRES60 enquanto não há geração real (ocultar agora vs. aceitar como está até a Fase 8F).

Nenhum desses bloqueadores impede que as Fases 8B (segmentação), 8C (agenda) e 8H (hubs) comecem imediatamente — são as únicas três frentes sem nenhuma dependência externa pendente.

---

## Atualização — Fase 8B (2026-07-21)

O bloqueador 2 (WhatsApp) foi resolvido: número `55 9663-4475` confirmado pelo usuário, sem conflito real encontrado (nenhum número real estava configurado em lugar nenhum). CTA "Falar com um especialista" e equivalentes comprovados (mesma copy/target) migrados para `wa.me`. Segmentação real implementada (fonte canônica, classificação no agente, contagens reais, `SegmentSelector` unificado). Newsletter: copy corrigida para não prometer envio ainda inexistente (backend não alterado, provider de e-mail continua não implementado — bloqueador 1 permanece). Bloqueadores 3 e 4 permanecem inalterados (fora de escopo desta fase).

Detalhe completo: `docs/implementacao-fase8b-fundacao.md`. Preview do backfill de segmentos (dry-run real, 27 posts): `docs/backfill-segmentos-preview-fase8.md`.
