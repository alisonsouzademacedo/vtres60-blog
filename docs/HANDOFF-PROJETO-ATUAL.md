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

---

## 8. Atualização — Fase 8E (2026-07-23): deploy final do portal funcional

Este documento descreve o estado da **Fase 5** (2026-07-13) e ficou estático desde então — as Seções 1-7 acima estão desatualizadas (HEAD remoto, pendência operacional da Seção 6 já resolvida na Fase 6). Esta seção registra o estado real e atual; para a fonte de verdade viva, ver `project_vtres60_timeline.md` e `project_vtres60_pending_work.md` (memória do Claude Code, não versionados neste repo).

**O que mudou desde a Fase 5:** Fases 6, 7, 8A-8D foram implementadas em branches separadas ao longo de 2026-07-13 a 2026-07-22 (telemetria do agente, custos/APIs, WhatsApp/segmentação real, clima/mercado/agenda reais, Radar Industrial/Inteligência VTRES60/Hubs de empresas evidence-gated). Nenhuma delas havia sido mergeada em `main` até esta fase — `main` ficou parada em `fd854a1` (placeholder do merge inicial do GitHub) até a Fase 7 (fast-forward para `ba27bf3`/deploy real), e depois parada de novo em `d95cbee` até este merge.

**Fase 8E — deploy executado nesta sessão:**
- Migrations aplicadas em produção (Supabase `fdsojpwznvephwdoghbn`): `agenda_events`, `companies`, `radar_signals`, `intelligence_items` — schema apenas (DDL), nenhum dado inserido. RLS habilitado, sem policies (deny-all), consistente com todas as outras tabelas do projeto. **Importante:** a fonte de verdade real de Agenda/Empresas/Radar/Inteligência continua sendo `src/content/*.json` via `operationsRepository` — o código da aplicação não lê/escreve nessas tabelas Supabase hoje; elas existem como schema de referência para uma migração futura explícita.
- `main` atualizada via merge (`d95cbee` → `a4bfd08`, sem force), incorporando Fases 8B+8C+8D.
- Build de produção + restart controlado de `vtres60-blog` e `vtres60-agent-worker`. `vtres60` e `v360-dashboard` nunca tocados (PID e restart count idênticos do início ao fim).
- **Incidente real encontrado e corrigido durante o deploy**: `pm2 restart --update-env` usa o ambiente do shell que executa o comando, não o bloco `env` do `ecosystem.config.js` — como o shell desta sessão tinha `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (sem prefixo `NEXT_PUBLIC_`) herdados de uma configuração de outro projeto Supabase, o restart inicial quebrou `/noticias`, `/agenda`, `/empresas/[slug]` e `/radar` com "Invalid API key" (500) por alguns minutos. Corrigido reiniciando via `pm2 restart ecosystem.config.js --only vtres60-blog --update-env`, que força a releitura do `.env.production` real. Ver detalhe completo no relatório da Fase 8E (memória do Claude Code).
- Arquivos de runtime (`leads.json`, `logs.json`, `seo.json`) preservados intactos através do checkout de `main` (git manteve as modificações locais automaticamente, sem necessidade de restauração manual) — incluindo o `googleTagManagerId` real (`GTM-TNKDZ8DC`) que um admin configurou depois que a branch de desenvolvimento havia divergido.
- Backup completo pré-deploy em `/home/pedro/vtres60-blog-deploy-backup-20260722T210824Z/` (build anterior, configs, `.env.*` chmod 600, manifest, plano de rollback).

**Estado funcional confirmado por smoke test real (HTTPS) após o deploy:** home, notícias, agenda, segmentos, `/radar`, hubs de empresas, admin (login/segmentos/configurações/agenda/empresas/radar/inteligência/leads) — todos 200, sem erros residuais. Radar/Inteligência/Hubs mostram estado vazio honesto (nenhum sinal/item/empresa-com-cobertura real existe ainda — comportamento esperado, não um bug). Agenda mostra apenas Fenasucro (publicada/verificada); Febrava e Mercopar permanecem candidatas, não aparecem publicamente, ano da Febrava não foi alterado.

**Pendências reais, documentadas não escondidas:** nenhum sinal do Radar ou item de Inteligência foi publicado ainda (requer ação editorial de um admin via `/admin/radar`/`/admin/inteligencia`); nenhuma empresa tem cobertura real ainda (0 de 30 posts com empresa associada); monitoramento automático por empresa via NewsFetcher foi avaliado e não implementado (falta enforcement real de orçamento no pipeline); backfill de segmentos históricos não foi aplicado (permanece dry-run only, por decisão deliberada).
