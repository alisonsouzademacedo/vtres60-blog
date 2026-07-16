# Handoff — Estado Consolidado do Projeto VTRES60 Blog

Última atualização: 2026-07-13 (fim da Fase 5 — deploy + publicação no GitHub)

## 1. Projeto e produção

- Blog VTRES60 em produção e funcionando.
- Projeto Supabase correto: `fdsojpwznvephwdoghbn`.
- Processos PM2 deste projeto:
  - `vtres60-blog`
  - `vtres60-agent-worker`
- Processos de **outros** projetos na mesma máquina — não pertencem a este escopo, não alterar:
  - `vtres60` (site institucional)
  - `v360-dashboard`
- Cron do agente: **05:00 e 17:00, America/Sao_Paulo**.

## 2. Fases concluídas

**Fase 1** — remoção dos 9 posts seed artificiais; remoção do draft RIMA duplicado; correção da falsa parceria da RIMA; hero e feed corrigidos por `created_at`; `compareByRecency`/`resolveLeadArticle` implementados.

**Fase 2** — `excerpt` e `impact` separados; fim do corte destrutivo de palavras; remoção do CTA comercial automático do corpo do texto; Publisher sem `ensureV360ClosingParagraph`; backfill controlado dos posts existentes; bloco de impact condicional (não aparece se `impact` vazio).

**Fase 3** — `categoryId` dinâmico (`public.categories`); tags de `public.tags`; `companies` associadas somente a hubs existentes e a empresas centrais (não menção secundária, não só por `companyDomain`); `ExactDedupeGate`; `NewsworthinessGate`; `SemanticDedupeGate`; deduplicação por `source_url`; janela semântica de 7 dias; validação literal de citações diretas.

**Fase 4** — pipeline de imagens: `source_og → Replicate/Flux → Pexels → image_pipeline_failed` (sem publicação se nenhum tier aprovar); remoção total de `via.placeholder.com`; processamento com `sharp`; master 2150×1000; WebP qualidade 82; Supabase Storage, bucket `editorial-images`; novos campos em `public.posts`: `image_source_url`, `image_credit`, `image_origin`, `image_hash`, `image_width`, `image_height`; hash SHA-256; deduplicação exata de imagens (janela de 30 dias); assinatura VTRES60 somente em imagens geradas (`generated_replicate`); crédito de imagem exibido na página interna da notícia.

**Fase 5** — migrations aplicadas em produção (metadata + Storage); bucket e policies aplicados; Storage smoke test aprovado; build implantado; `vtres60-blog` e `vtres60-agent-worker` reiniciados separadamente; nenhum rollback necessário; nenhum backfill histórico feito; **Fases 1-4 efetivamente ativas em produção**.

## 3. Validações

- 227 testes automatizados aprovados.
- 2 testes reais com LLM (gate de empresa secundária/companyDomain) mantidos fora da suíte padrão por custo e não-determinismo — rodados manualmente antes do deploy, 3/3 aprovados.
- Lint aprovado. Typecheck aprovado. Build aprovado.
- Dry-run completo do agente em produção aprovado (Supabase/LLM/Storage reais, Publisher nunca chamado).
- Nenhum post criado durante os testes. Nenhum objeto temporário residual no Storage.

## 4. GitHub

- Repositório: `https://github.com/alisonsouzademacedo/vtres60-blog`
- Branch: `main`
- HEAD remoto: `fd854a1b38b7d1cb61bbecf8d0e62c581cfbef90`
- 297 arquivos versionados, 26 arquivos de teste.
- Nenhum secret publicado (varredura por padrão + por valor exato de cada credencial real desta sessão, ambas limpas).
- Ignorados: `.env*` (exceto `.env.example`), `node_modules/`, `.next/`, diretórios de backup de deploy, artefatos temporários, e o script pessoal `conectar_VTRES60_v2.bat` (expõe porta/usuário SSH real do servidor).
- O repositório local (`/home/pedro/vtres60-blog/.git`) está inicializado e conectado ao `origin` correto.

## 5. Documentação e backups relevantes

- `docs/deploy-fases-1-4-20260711T170351Z.md` — registro completo do deploy da Fase 5.
- `docs/rollback-fase5-20260711T170351Z.md` — plano de rollback (não executado).
- `/home/pedro/vtres60-blog-deploy-backup-20260711T170351Z/` — backup local completo pré-deploy (`.next` anterior, código, configs, `.env.*` com permissão restrita).
- `docs/agente-v360-arquitetura.md` — documento de arquitetura mais antigo (anterior às Fases 1-5); pode estar parcialmente desatualizado, não foi revisado nesta atualização.

## 6. Pendência operacional não confirmada como bug

Na execução da manhã posterior ao deploy, **nenhuma notícia nova foi publicada**. Isso ainda **não foi investigado**.

**Não tratar como falha confirmada** — o agente pode ter encerrado corretamente por: `exact_duplicate`, `not_newsworthy`, `same_event_no_material_update`, `classification_failed`, reprovação editorial, ou `image_pipeline_failed`.

A próxima investigação deve começar pelos **logs da execução correspondente** (`pm2 logs vtres60-agent-worker` / `vtres60-blog` em torno do horário agendado), **sem disparar manualmente uma nova notícia** e **sem alterar dados** antes de identificar o motivo real.

## 7. Segurança / credenciais

Todas as credenciais (Supabase `service_role`/`anon`, OpenAI, Replicate, Pexels, GNews, `AGENT_API_KEY`, PAT do GitHub) estão configuradas corretamente nos ambientes apropriados (`.env.local` para desenvolvimento, `.env.production` para produção, injetadas pelo `ecosystem.config.js`). Nenhum valor de credencial é registrado neste documento, na memória do Claude Code, ou em qualquer arquivo do projeto além dos próprios `.env.*` (que estão fora do controle de versão).
