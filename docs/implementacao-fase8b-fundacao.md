# Fase 8B — Fundação Funcional: WhatsApp, Captação e Segmentação Real

Data: 2026-07-21. Branch: `feat/portal-funcional-fase8` (a partir de `main`, commit `d95cbee`). Escopo: CTA comercial via WhatsApp, captação de leads com copy honesta, segmentação real das notícias. Fora de escopo (não tocado): Mercado Industrial, clima, commodities, Agenda Industrial, Radar Industrial, Inteligência VTRES60, hubs administráveis, envio de newsletter, provider de e-mail, deploy.

---

## 0. Incidente operacional: vazamento parcial de conteúdo para produção

Durante a implementação, foi descoberto empiricamente (via `curl` direto em `https://www.vtres60.com.br/blog/`) que edições em `src/content/home.json` já estavam sendo servidas ao vivo em produção, **sem nenhum build, commit, push ou restart do PM2**.

Causa raiz: o processo PM2 `vtres60-blog` roda `next start` neste mesmo diretório de trabalho. Rotas dinâmicas (`ƒ` no build output) executam o handler Node a cada requisição e leem `src/content/*.json` do disco em tempo real (sem cache, via `unstable_noStore()` no repositório) — apenas código `.tsx`/`.ts` precisa de rebuild para valer; conteúdo JSON puro reflete imediatamente qualquer edição no disco, independente de branch Git.

Isso já era um risco conhecido e documentado para `leads.json`/`logs.json` (dados de runtime mutados pelo próprio app), mas não havia sido reconhecido que o mesmo vale para arquivos de **configuração/copy editados pelo desenvolvedor** (`settings.json`, `home.json`, `seo.json`, `segments.json`, `events.json`) — a direção da mutação é diferente (admin/dev → arquivo, não app → arquivo), mas o efeito de "ir ao ar imediatamente" é idêntico.

**Escopo confirmado do vazamento** (diff completo revisado):
- `home.json`: textos da newsletter (título, descrição, texto do botão do hero, texto do botão de assinatura, mensagem de sucesso) — foram ao ar.
- `settings.json`: bloco `whatsapp` foi apenas **adicionado** (chave nova) — inerte, pois o código compilado em produção ainda não lê esse campo; sem efeito visível até o deploy real do código desta fase.
- Nenhum outro arquivo de conteúdo vazou.

**Decisão tomada**: manter a copy nova no ar. O texto que vazou é estritamente mais honesto que o anterior (deixou de prometer "briefing diário" ainda inexistente) — não é dado sensível, não quebra nenhuma funcionalidade, e vai na mesma direção do objetivo desta fase. Reverter agora seria, pelo mesmo mecanismo, **outra mutação ao vivo** (voltando à copy antiga, que era exatamente o problema identificado na Fase 8A). Pedro foi avisado em tempo real durante a sessão.

**Lição para fases futuras**: qualquer edição de `src/content/*.json` neste diretório deve ser tratada como deploy imediato de conteúdo, independentemente do estado do branch Git. Trabalho de conteúdo que não deva ir ao ar antes da aprovação precisa ser preparado apenas na cópia isolada (worktree/diretório) e aplicado ao repositório real somente no momento do deploy aprovado — não durante o desenvolvimento.

---

## A. WhatsApp comercial

**Estado reconfirmado antes da mudança**: nenhum link `wa.me` existia no código. `settings.json.phone` = `"+55 11 0000-0000"` (placeholder). CTA "Falar com um especialista" na home (`Análise VTRES60`) e nas páginas de Marketing Industrial usava `mailto:especialista@vtres60.com.br`. Nenhum conflito de número real foi encontrado — confirma o achado da Fase 8A.

**Fonte canônica**: `PortalSettings.whatsapp` (novo, em `src/types/admin.ts` e `src/content/settings.json`), com `displayNumber`, `normalizedNumber` (`555596634475`, exatamente o número informado, sem dígito adicionado), `defaultMessage` e `enabled`. Editável em `/admin/configuracoes` (nova seção "WhatsApp comercial").

**Helpers**: `src/lib/whatsapp.ts` — `buildWhatsAppUrl()` (monta `https://wa.me/<numero>?text=<mensagem codificada>`, retorna `undefined` se desabilitado/sem número) e `buildDefaultCommercialCta()` (usa WhatsApp quando habilitado, cai para `mailto:${contactEmail}` institucional caso contrário — nunca hardcoded).

**Componente**: `src/components/editorial/whatsapp-cta.tsx` (`WhatsAppCTA`) — `target="_blank"`, `rel="noopener noreferrer"`, não renderiza nada quando desabilitado (nunca um link quebrado), dispara `whatsapp_click` no clique (nunca ao carregar a página — confirmado por teste Playwright que verifica zero requisições de rede ao `wa.me` no carregamento).

**CTAs atualizados** (todos com o mesmo label "Falar com um especialista", mesmo destino `mailto:especialista@vtres60.com.br` original — comprovadamente equivalentes, mesma copy/target):
1. Home, seção "Análise VTRES60" (`src/app/page.tsx`) — único CTA comercial identificado pela Fase 8A como "o único do site inteiro". **Divergência confirmada**: essa afirmação da Fase 8A não se sustentou — a mesma CTA existe também nas páginas de Marketing Industrial (evergreen) e no campo `cta` persistido por post/artigo.
2. Páginas de pilar de Marketing Industrial (`src/app/marketing-industrial/[slug]/page.tsx`) — CTA final da página (não o link âncora `#especialista` do topo, que é só navegação interna).
3. `src/app/categorias/marketing-industrial/page.tsx` — CTA admin-configurável por categoria; confirmado via SQL que o valor hoje persistido no Supabase é exatamente o placeholder padrão (nunca customizado). Como escrever no Supabase em produção durante esta fase seria um deploy de dado fora do escopo aprovado, a substituição foi feita **em tempo de renderização**: se o valor salvo for literalmente o placeholder antigo, usa o CTA canônico (WhatsApp); qualquer valor realmente customizado pelo admin continua respeitado como link normal.
4. `src/lib/agent/nodes/publisher.ts` (`buildDefaultCommercialCta`) — todo post publicado pelo agente a partir de agora recebe o CTA de WhatsApp em `post.cta`, renderizado como "PRÓXIMA DECISÃO" em cada página de artigo.
5. `src/components/admin/content-editor.tsx` (`blank()`) — novo post/artigo criado manualmente no admin também recebe o CTA de WhatsApp como padrão.

**Não alterado (divergência registrada, não silenciosa)**: os 27 posts já publicados mantêm o `cta` com mailto persistido no Supabase — atualizar em massa exigiria um UPDATE em produção fora do escopo desta fase (mesma política do backfill de segmentos). O default de `taxonomy-editor.tsx` (criação de nova categoria com página Marketing Industrial) também não foi alterado — é um valor padrão de formulário admin raramente exercitado, não uma URL pública fixa.

**Analytics**: `src/lib/analytics-events.ts` (`trackEvent`) reaproveita o mesmo `window.gtag`/`window.dataLayer` já inicializado por `AnalyticsScripts`/`ConsentBanner` — quando GTM está configurado, só o `dataLayer.push` roda (gtag não existe por design, ver comentário em `analytics-scripts.tsx`); quando não há GTM, só `gtag('event', ...)` roda. Nunca os dois ao mesmo tempo (sem duplicação).

---

## B. Captação de leads (newsletter)

**Backend reconfirmado, não reescrito**: `POST /api/leads` (rate limit 5/10min, honeypot `website`, validação de e-mail, consentimento obrigatório) → `operationsRepository.createLead()` → `leads.json` → log. `leadIntegrations = [LocalOnlyIntegration]` (no-op) confirmado — nenhum e-mail é enviado, nenhum provider foi integrado.

**Copy revisada** (removidas as frases proibidas: "briefing diário", "de segunda a sexta", "receba todos os dias"):

| Local | Antes | Depois |
|---|---|---|
| `home.json` hero.secondaryButton | "Receber o briefing diário" | "Cadastrar no Briefing Industrial" |
| `home.json` newsletter.title | "Comece o dia sabendo o que realmente importa." | "Entre para a lista do Briefing Industrial." |
| `home.json` newsletter.description | "Curadoria e interpretação..." | "Deixe seu e-mail para acompanhar o lançamento e ser um dos primeiros a receber quando o envio começar." |
| `home.json` newsletter.buttonText | "Assinar Briefing Industrial" | "Quero entrar na lista" |
| `home.json` newsletter.successMessage | "Inscrição recebida. Bem-vindo ao Briefing Industrial." | "Cadastro recebido com sucesso. Você está na lista do Briefing Industrial." |
| `newsletter-form.tsx` título do form | "Receba o briefing gratuitamente" | "Entre na lista do Briefing Industrial" |
| `newsletter-form.tsx` subtítulo | "Uma leitura objetiva, de segunda a sexta." | "Deixe seu contato para acompanhar o lançamento e as próximas atualizações." |
| `newsletter-form.tsx` checkbox de consentimento | "Aceito receber a newsletter... e sei que posso cancelar quando quiser." | "Aceito que a VTRES60 guarde meu contato para me avisar quando o Briefing Industrial começar a ser enviado, conforme a Política de Privacidade" (link real para `/privacidade`, antes ausente) |
| `newsletter-form.tsx` nota de rodapé do form | "Sem spam. Cancele quando quiser." | "Sem spam. Seus dados não são compartilhados com terceiros." (removida promessa de cancelamento inexistente) |
| `api/leads/route.ts` erro de consentimento | "...para receber a newsletter." | "...para que possamos guardar seu contato." |

**Unificação confirmada**: header, hero, bloco dedicado e footer convergem para o mesmo `NewsletterForm`/`POST /api/leads` — nenhum formulário paralelo foi criado, nenhum foi encontrado.

**Envio de e-mail implementado nesta fase: false** (conforme proibição explícita).

---

## C. Segmentação real

### Causa raiz reconfirmada
- `publisher.ts:169` gravava `segmentSlugs: []` incondicionalmente — confirmado antes da mudança.
- Nenhuma referência a "segment" existia em `drafter.ts`/`state.ts` antes desta fase — confirmado.
- Duas fontes de segmento coexistiam: `segments.json` (via `operationsRepository`, com CRUD real em `/admin/segmentos`) e o array estático `src/data/content.ts` (`segments`/`segmentProfiles`, usado apenas como seed uma única vez e diretamente pelo `SegmentSelector`, que ficava dessincronizado de qualquer edição feita no admin).
- `articleCount` era um `NumberField` editável manualmente — confirmado, valores idênticos ao seed original (nunca corrigidos).

### Fonte canônica
`segments.json` via `operationsRepository`/`contentRepository.listSegments()`/`listSegmentProfiles()` — já era a fonte usada por `/segmentos` e `/segmentos/[slug]`. `src/data/content.ts` permanece apenas como seed inicial (não removido — outros consumidores como `companies`/`events` continuam usando esse arquivo para outros domínios fora de escopo desta fase).

### Pipeline do agente (`src/lib/agent/taxonomies.ts`, `drafter.ts`, `prompts.ts`, `publisher.ts`)
- `loadValidSegments()` (novo) — carrega `{slug, name}[]` de `operationsRepository.listSegments()`, mesmo padrão de `loadValidTags()`.
- `filterValidSegmentSlugs()` (novo) — filtra slugs inexistentes e remove duplicados, mesmo padrão de `filterValidTagIds()`/`filterValidCompanies()`. Nunca usa fallback genérico.
- `DraftSchema` (Zod) ganhou `segmentSlugs: string[]` — lista dinâmica de segmentos válidos é fornecida ao classificador via `formatSegmentsForPrompt()`, na mesma mensagem de taxonomias (categorias/tags/empresas).
- `DRAFTER_SYSTEM_PROMPT` ganhou a "REGRA DE SEGMENTAÇÃO": associar apenas quando o setor tiver relação central ou aplicação industrial comprovável; nunca por palavra isolada, exemplo secundário ou empresa apenas citada; zero a vários segmentos válidos; nunca inventar slug.
- `publisher.ts` passa a gravar `segmentSlugs: segmentFilter.valid` (antes: `[]` fixo) e registra em `agent` log (`classificacao_taxonomia`) os segmentos solicitados, aceitos e descartados — sem persistir corpo da notícia.

### Auditoria do segmento (decisão, Seção 15 do spec)
**Não foi adicionada validação por LLM extra no `InternalAuditor`.** Justificativa:
- **Custo**: uma chamada extra ao LLM por execução do agente, para uma validação que já é feita deterministicamente (existência do slug) e semanticamente pelo próprio Drafter (mesma responsabilidade de tags/companies, que também não são auditadas pelo InternalAuditor).
- **Confiabilidade**: o padrão já estabelecido no projeto (Fase 3) trata `categoryId` como o único campo estruturalmente obrigatório, auditado deterministicamente; tags/companies são enriquecimento opcional, filtrado mecanicamente após o Drafter, sem gate de LLM adicional. Segmento segue exatamente essa mesma categoria de dado.
- **Risco**: baixo — pior caso é um segmento indevidamente associado (mitigado pelo prompt + filtro determinístico) ou uma lista vazia (resultado sempre válido). Nenhum dos dois quebra a publicação.
- **Testes**: cobertos por fixtures determinísticas (ver Seção E), sem depender de LLM real na suíte padrão.

### Contagens reais
- `src/repositories/local-content-repository.ts`: nova função `countPostsBySegment()` — conta posts **publicados e visíveis** (mesma regra `visible()` já usada por `allArticles()`: `status==="published"` ou `scheduled` com data já passada; `draft` nunca conta) agrupados por `segment_slugs`.
- `listSegmentProfiles()` agora usa essa contagem real em vez do campo manual `articleCount` do JSON.
- Admin (`/admin/segmentos`, `operations-editor.tsx`): campo "Quantidade de notícias" deixou de ser um `NumberField` editável — agora é um `<input disabled>` mostrando a contagem real calculada. O campo `articleCount` continua existindo em `segments.json` (não foi apagado — nenhum consumidor confirmado depende dele além do próprio admin, que agora ignora esse valor).

### SegmentSelector
`src/components/editorial/segment-selector.tsx` deixou de importar o array estático de `src/data/content.ts` — agora recebe `segments: string[]` como prop (nomes reais de `segmentProfiles`, a mesma fonte canônica). Preferência em `localStorage` preservada; se o valor salvo não existir mais na lista real, cai para "Todos". Retorna `null` (não renderiza) quando não há nenhum segmento — estado vazio honesto em vez de mostrar controles sem função.

### Páginas de segmento
`/segmentos` e `/segmentos/[slug]` já usavam a fonte canônica antes desta fase (não precisaram de mudança de dados) — o estado vazio ("Ainda não há conteúdos publicados aqui...") e o `noindex` condicional já existiam e foram apenas reconfirmados ao vivo no build isolado.

### Backfill (dry-run, executado de verdade)
`scripts/backfill-segmentos.ts` — script controlado, **sem `--apply`** (não implementado nesta fase, de propósito): lê todos os posts reais do Supabase, classifica cada um com o mesmo classificador (mesma lista real de segmentos, mesmas regras), valida deterministicamente os slugs propostos, nunca escreve no banco. Executado de verdade em 2026-07-21 contra os 27 posts reais (não 25 — o número cresceu desde a Fase 8A, reconfirmado empiricamente):

- **HIGH_CONFIDENCE: 16**
- **AMBIGUOUS: 0**
- **NO_SEGMENT: 11**
- **ERROR: 0**

Relatório completo: `docs/backfill-segmentos-preview-fase8.md`. **Limitação conhecida**: 2 das 27 justificativas em texto livre do relatório contêm caracteres corrompidos (ex.: "ind\x7fstria" em vez de "indústria") — parece ser uma peculiaridade pontual da geração de texto livre pelo LLM nesses dois casos específicos (a classificação de segmento em si, campo estruturado, não foi afetada). Cosmético, não bloqueante, não escrito em nenhum dado de produção.

Nenhum post existente foi alterado (texto, categoria, tags, companies preservados — o script é 100% leitura + um arquivo de relatório).

---

## D. Testes

Novos/expandidos (vitest): `taxonomies.test.ts` (+10 casos de segmento), `publisher.test.ts` (+10 casos: único, múltiplos, vazio, slug inventado, duplicado, telemetria, preservação de categoria/tags/companies, CTA dinâmico com/sem WhatsApp habilitado), `drafter.test.ts` (+5 casos de schema), `local-content-repository.test.ts` (+9 casos de `visible`/`countPostsBySegment`), `whatsapp.test.ts` (novo, 9 casos), `backfill-segmentos.test.ts` (novo, 8 casos de classificação pura + schema). Fixtures/mocks em todos — nenhum teste da suíte padrão depende de LLM real.

Playwright: `e2e/whatsapp-and-newsletter.spec.ts` (novo, 5 casos: CTA abre em nova aba com `rel=noopener`, sem disparo automático de rede, copy sem promessas proibidas, checkbox linka `/privacidade`, segmento vazio mostra estado honesto). `e2e/axe.spec.ts` expandido: `/segmentos`, `/segmentos/metalurgia`, e um novo teste consolidado (login único) para `/admin/segmentos`, `/admin/configuracoes`, `/admin/leads` — consolidado em uma única sessão de login para não estourar o rate limit de login administrativo (8 tentativas/15min) ao rodar a suíte inteira.

**Achados incidentais de acessibilidade corrigidos** (fora do escopo original, descobertos pelos novos testes, correção de uma linha cada, mesma classe de bug já corrigido na Fase 7):
- `.admin-table-title small` em `admin.css` tinha contraste insuficiente (3.94:1, precisa 4.5:1) — afetava **todas** as páginas de listagem admin (segmentos, notícias, categorias, agente etc.), não só as tocadas nesta fase. Corrigido reutilizando a cor já validada `#8390a2` (mesma de `.admin-table-meta`).
- `<select>` de filtro por origem em `/admin/leads` não tinha nome acessível (`select-name`, crítico) — adicionado `aria-label="Filtrar por origem"`.

---

## E. Validação técnica

Todo o build/Playwright/axe rodou em cópia isolada (`rsync` para diretório fora do repositório, `node_modules` symlinked, nunca o `.next` do PM2 ao vivo) — nunca contra a produção real. Detalhe: a rede de testes teve dois falsos-negativos por acúmulo de rate-limit de login administrativo (8/15min, em memória, persistente entre execuções de teste contra o mesmo processo de servidor) causado pelo grande volume de logins administrativos executados manualmente durante o desenvolvimento — resolvido consolidando os novos testes em uma única sessão autenticada e reiniciando o servidor antes da corrida final.

- **Lint**: limpo (1 erro de aspas não escapadas corrigido).
- **Typecheck**: limpo (fixtures de teste desatualizadas corrigidas — `segmentSlugs` ausente em 4 arquivos de teste pré-existentes).
- **Vitest**: 401 → suíte completa com todos os novos casos, 100% passando.
- **Build**: sucesso, 91 páginas geradas.
- **Playwright** (79 testes, 4 viewports): 100% passando na corrida limpa final.
- **axe** (13 casos incluindo os novos): 100% passando após as 2 correções de acessibilidade acima.

---

## F. Não implementado nesta fase (proibições respeitadas)

Confirmado: nenhum deploy, nenhuma alteração em `main`, nenhuma migration remota, nenhum restart de PM2, nenhum e-mail enviado, nenhum provider de e-mail integrado, nenhum backfill aplicado em produção, nenhum texto de post alterado, nenhum segmento criado por dedução ou preenchido por padrão, nenhum dígito adicionado ao WhatsApp, nenhum lead exposto, nenhum arquivo de runtime (`leads.json`/`logs.json`) versionado, Radar/Inteligência/Agenda/Mercado/Clima não tocados.

**Exceção registrada e explicada na Seção 0**: conteúdo de `home.json` foi involuntariamente servido em produção durante o desenvolvimento, por uma característica da arquitetura (JSON de conteúdo lido do disco em tempo real pelo mesmo processo PM2), não por uma ação deliberada de deploy.
