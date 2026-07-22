# Risco operacional: arquivos JSON de runtime lidos diretamente do disco

**Fase**: 8C — registrado antes de qualquer alteração de código desta fase.
**Status**: risco confirmado, mitigação operacional já em vigor (git worktree isolado), sem migração arquitetural nesta fase.

## Causa

Todo o conteúdo editável do site (`settings`, `branding`, `seo`, `home`, `segments`, `events`, `media`, `leads`, `logs`) é lido em **runtime**, a cada requisição, diretamente do disco — não há build step, não há cache, não há camada intermediária:

- `src/services/config/config-repository.ts` — `readConfig()` faz `fs.readFile(path.join(contentDirectory, `${name}.json`))` para `settings`/`branding`/`seo`/`home`, com `contentDirectory = path.join(process.cwd(), "src", "content")`.
- `src/services/operations/operations-repository.ts` — `read()` faz o mesmo para `segments`/`events`/`media`/`leads`/`logs`.
- Ambos chamam explicitamente `unstable_noStore()` do Next.js antes de ler — isso **desativa qualquer cache de rota/fetch do Next.js** para essas leituras, garantindo que cada requisição HTTP leia o arquivo do zero.

`process.cwd()` do processo Node em produção é fixado pelo PM2: `ecosystem.config.js` define `cwd: __dirname`, ou seja, o diretório literal onde esse arquivo de configuração vive — hoje, `/home/pedro/vtres60-blog`. Esse valor é resolvido uma única vez, na inicialização do processo `next start`, e não muda enquanto o processo estiver de pé.

## Arquivos afetados

Todos os arquivos em `src/content/*.json`: `settings.json`, `branding.json`, `seo.json`, `home.json`, `segments.json`, `events.json`, `media.json`, `leads.json`, `logs.json`.

## Risco

Qualquer edição de arquivo em `/home/pedro/vtres60-blog/src/content/*.json` — **independente de qual branch git está com checkout ali, independente de commit, independente de build ou de `pm2 restart`** — é servida ao público imediatamente na próxima requisição. Não existe passo de deploy entre "arquivo no disco" e "conteúdo ao vivo" para esses dados. Isso já aconteceu de fato na Fase 8B: uma edição de `home.json` feita durante o desenvolvimento, no mesmo diretório onde o PM2 roda, vazou para produção sem nenhum deploy formal (ver `docs/implementacao-fase8b-fundacao.md`, seção 0, e a entrada de 2026-07-21 em `project_vtres60_timeline.md`).

O mecanismo é puramente sobre **qual caminho absoluto é editado**, não sobre git/branch/deploy. Editar o mesmo caminho de arquivo em qualquer branch produz o mesmo efeito.

## Solução recomendada

Das opções levantadas na spec, a que resolve o risco sem exigir mudança de arquitetura ou plano de rollback é a que já está em uso nesta fase: **isolamento físico de diretório via `git worktree`**. Como `process.cwd()` de produção é fixo em `/home/pedro/vtres60-blog`, qualquer trabalho de desenvolvimento feito em um caminho de disco diferente (`/home/pedro/vtres60-blog-fase8c`, worktree desta fase) é estruturalmente incapaz de afetar produção — não há leitura cruzada de diretórios em nenhum ponto do código auditado.

Isso **não é uma migração de arquitetura**: nenhum código muda, nenhuma tabela nova, nenhum plano de rollback necessário. É uma disciplina operacional que já estava documentada como obrigatória desde a Fase 8B (ver `feedback_vtres60_runtime_files_in_repo` e `feedback_deploy_build_restart_atomic` na memória do projeto) e foi formalizada nesta fase com um worktree real.

### Opções avaliadas e não escolhidas nesta fase (requerem plano de rollback e teste de compatibilidade próprios — fora do escopo da Fase 8C)

- **Supabase como fonte de verdade**: resolveria o risco de raiz (leitura viria de um banco compartilhado, não do disco local do processo), mas exige migrar 9 arquivos JSON, todas as rotas de admin que os escrevem, e validar RLS/policies — mudança grande demais para esta fase.
- **Conteúdo copiado para o diretório de runtime apenas no deploy** (ex.: `rsync` de `src/content/` na etapa de deploy, a partir de uma pasta de dados separada do código): reduz o risco em produção normal, mas não protege contra o cenário exato que causou o incidente (edição direta no mesmo diretório onde o PM2 roda durante desenvolvimento) — precisaria ser combinado com a disciplina de worktree de qualquer forma.
- **PM2 apontando para release imutável** (diretório `current` symlinkado, estilo blue/green deploy): resolve o problema de forma mais definitiva a longo prazo, mas exige redesenhar o processo de deploy inteiro (`ecosystem.config.js`, scripts de build, rotação de releases) — recomendado para uma fase de infraestrutura dedicada, não para a Fase 8C.

## Solução implementada nesta fase

Nenhuma mudança de código. **Procedimento obrigatório**, já seguido desde o início desta fase e válido para todas as fases futuras:

1. Todo desenvolvimento que toque `src/content/*.json` (ou qualquer arquivo, para manter uma única regra simples) ocorre exclusivamente em um `git worktree` separado (`git worktree add <caminho> -b <branch>`), nunca no diretório `/home/pedro/vtres60-blog` enquanto o PM2 estiver ativo nele.
2. Antes de qualquer commit, confirmar `pwd`/`process.cwd()` esperado e que nenhuma alteração foi feita no diretório original.
3. `leads.json` e `logs.json` nunca entram em `git add` explícito (arquivos de runtime real, mutados pelo processo ao vivo) — ver `feedback_vtres60_runtime_files_in_repo`.
4. Build de validação (lint/typecheck/testes/Playwright/Lighthouse) roda **sempre** em cópia isolada (worktree ou rsync para diretório temporário), nunca `npm run build` direto em `/home/pedro/vtres60-blog` com o processo ativo — ver `feedback_deploy_build_restart_atomic`.

## Produção alterada acidentalmente nesta fase?

**Não.** Todo o trabalho da Fase 8C, incluindo este documento, foi feito em `/home/pedro/vtres60-blog-fase8c` (branch `fase8c-dev`). Nenhum arquivo em `/home/pedro/vtres60-blog` foi tocado desde o início desta fase.
