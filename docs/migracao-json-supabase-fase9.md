# Runbook — Migração JSON → Supabase (Radar, Inteligência, Empresas)

Guia operacional para migrar de fato os três domínios da Fase 9B.1 quando Pedro autorizar o corte para produção. Ver `docs/implementacao-fase9b1-supabase-dominios.md` para o racional arquitetural completo e `docs/runbook-migration-safety.md` para a proteção de destino aplicada a este script depois do incidente real de 2026-08-05.

## Estado atual (ao final da Fase 9B.1)

`COMPANIES_SUPABASE_SOURCE=false`, `RADAR_INTELLIGENCE_SUPABASE_SOURCE=false` — produção continua 100% em JSON. Nenhum flag foi ativado em `.env.production`/`ecosystem.config.js`. As tabelas `companies`/`radar_signals`/`intelligence_items` existem em produção (Fase 8E) mas estão vazias.

## Pré-requisitos antes de ativar em produção

1. Confirmar que a migration `supabase-radar-intelligence-companies-schema-fase8d.sql` já está aplicada em produção (já está, desde a Fase 8E — reconfirmar via `list_tables`).
2. Rodar `npm run migrate:operations -- --preview` **contra o `.env.production` real** (nunca contra `.env.local` de desenvolvimento) para conferir o mapa `legacy_id → uuid → slug → name` e o resumo de inserções/atualizações antes de aplicar.
3. Revisar o preview com Pedro — nenhuma migração de dado real deve rodar sem essa conferência.
4. Rodar `npm run migrate:operations -- --apply --allow-production` **uma única vez**, com `.env.production` carregado corretamente (mesma disciplina de `pm2 restart ecosystem.config.js --only <name> --update-env` — nunca confiar em variável de ambiente já presente no shell, sempre forçar o arquivo certo). `--allow-production` é obrigatório desde o fechamento de 2026-08-05: sem ele, `assertSafeToWrite` bloqueia a escrita antes de qualquer `upsert` (ver `docs/runbook-migration-safety.md`).
5. Confirmar via SQL real (`select count(*), count(distinct slug), count(distinct id) from companies`) que exatamente 6 linhas existem, sem duplicata.
6. Só depois disso, ativar as flags em `ecosystem.config.js`/`.env.production` e reiniciar `vtres60-blog` (`pm2 restart ecosystem.config.js --only vtres60-blog --update-env`).

## Ordem de corte recomendada

1. Ativar `COMPANIES_SUPABASE_SOURCE=true` primeiro (independente, sem FK, menor risco).
2. Validar `/empresas` e `/admin/empresas` em produção real por alguns dias.
3. Só depois ativar `RADAR_INTELLIGENCE_SUPABASE_SOURCE=true` (Radar e Inteligência sempre juntos, nunca separados — FK real entre as tabelas).

## Rollback

Reverter é uma mudança de configuração, não de código: `COMPANIES_SUPABASE_SOURCE=false`/`RADAR_INTELLIGENCE_SUPABASE_SOURCE=false` e reiniciar — a aplicação volta a ler/escrever em `src/content/*.json` imediatamente, sem migration nem deploy. As tabelas Supabase continuam existindo com os dados migrados, sem serem apagadas (rollback não é destrutivo).

## Compatibilidade de URLs administrativas antigas

`/admin/empresas/company-weg` (e os outros 5 ids legados) continuam resolvendo corretamente após o corte, via resolução determinística do id legado para o UUID correspondente (`src/services/operations/company-legacy-ids.ts`). Essa compatibilidade pode ser removida com segurança numa limpeza futura, quando não houver mais risco de link/bookmark antigo em uso — não é urgente, não bloqueia nada.

## O que NÃO fazer

- Não rodar `migrate:operations --apply` mais de uma vez sem necessidade — é idempotente, mas cada execução consulta o Supabase real antes de decidir; preferir confirmar o estado primeiro.
- Não ativar `RADAR_INTELLIGENCE_SUPABASE_SOURCE` sem `COMPANIES_SUPABASE_SOURCE` já validado — não há dependência técnica entre os dois, mas validar um de cada vez reduz superfície de diagnóstico caso algo dê errado.
- Não editar `.env.local`/`.env.production` deste worktree sem confirmar antes qual projeto Supabase está de fato configurado (`NEXT_PUBLIC_SUPABASE_URL`) — um erro exatamente nesse ponto causou um incidente real durante a validação desta fase (ver seção "Produção" em `docs/implementacao-fase9b1-supabase-dominios.md`).
