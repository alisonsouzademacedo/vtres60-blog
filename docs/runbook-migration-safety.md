# Runbook — Proteção de Destino para Scripts de Escrita (Supabase)

Guia operacional para qualquer script em `scripts/` que possa escrever em Supabase/Postgres/Storage. Criado no fechamento da Fase 9B.1 (2026-08-05) depois de um incidente real: um script de migração escreveu 6 empresas reais na tabela `companies` de **produção** por engano durante a validação (ver `docs/implementacao-fase9b1-supabase-dominios.md`, seção "Incidente").

## O que aconteceu e por quê

`dotenv.config({override:true})` — presente em todo script de escrita deste projeto até este fechamento — faz o arquivo `.env.local` sempre vencer sobre qualquer variável já definida no processo. Um operador que passa `NEXT_PUBLIC_SUPABASE_URL=http://localhost:...` na linha de comando, esperando que isso redirecione o script para um ambiente de teste, na verdade não muda nada se `.env.local` já define a mesma chave — o arquivo sempre prevalece. Foi exatamente isso que aconteceu: `.env.local` tinha sido restaurado para as credenciais reais de produção, um comando ainda passava variáveis apontando para um stack isolado, e o script rodou contra produção sem que ninguém pretendesse isso.

## A correção: `scripts/lib/safe-target.ts`

Módulo compartilhado, usado por todo script de escrita. Três peças:

1. **`loadEnvSafely(envFile?)`** — carrega o arquivo indicado (`.env.local` por padrão) **sem** `override:true`. Uma variável já presente no processo nunca é sobrescrita. Se o processo e o arquivo definirem valores **diferentes** para a mesma chave, a função lança `EnvDestinationConflictError` (código `ENV_DESTINATION_CONFLICT`) — nunca escolhe um dos dois valores silenciosamente.

2. **`resolveDestination()`** — identifica o destino a partir de `NEXT_PUBLIC_SUPABASE_URL`, sem nunca ler a service role key. Retorna um dos 5 tipos exigidos: `LOCAL` (localhost), `PRODUCTION` (project ref exato `fdsojpwznvephwdoghbn`), `TEST`/`STAGING` (só quando declarados explicitamente via `SAFE_TARGET_ENV_LABEL=TEST|STAGING` — nunca inferidos por padrão de hostname, e nunca sobrepõem o project ref real de produção) ou `UNKNOWN` (qualquer outra coisa, inclusive URL ausente ou malformada).

3. **`assertSafeToWrite(destination, options)`** — chamada logo antes da primeira mutação real. `UNKNOWN` sempre bloqueia (`FAIL_CLOSED`). `PRODUCTION` exige simultaneamente: `--allow-production`, project ref exato, `--apply`, dry-run desativado, manifest gerado, idempotency key e ator registrado — a ausência de qualquer um bloqueia antes de qualquer escrita. `LOCAL`/`TEST`/`STAGING` não têm essas exigências.

4. **`buildManifest()`/`writeManifest()`** — todo `--apply` (mesmo fora de produção) gera um manifest com timestamp, script, commit, destino sanitizado, modo, entidades, quantidade, ids, hash, idempotency key, ator e plano de rollback, gravado em `.migration-manifests/` (fora do controle de versão, nunca contém secrets).

## Como rodar um script de escrita com segurança

```bash
# 1. Preview (padrão, nunca escreve) — sempre rodar primeiro:
npx tsx scripts/migrate-operations-to-supabase.ts

# 2. Confirmar o destino resolvido ANTES de aplicar, sempre:
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"

# 3a. Aplicar contra LOCAL/TEST/STAGING — não precisa de flags extras:
npx tsx scripts/migrate-operations-to-supabase.ts --apply

# 3b. Aplicar contra PRODUÇÃO — exige a flag explícita, só depois de revisar o preview com Pedro:
npx tsx scripts/migrate-operations-to-supabase.ts --apply --allow-production
```

**Nunca** editar `.env.local` para apontar a um stack de teste e depois confiar em variáveis de linha de comando para "voltar" a produção no mesmo terminal — o padrão seguro é sempre editar `.env.local` para o destino pretendido e verificar o destino resolvido antes de qualquer `--apply` (passo 2 acima), toda vez, mesmo que pareça repetitivo.

## Scripts protegidos (auditoria confirmada, 2026-08-05)

| Script | Escreve em | Proteção |
|---|---|---|
| `scripts/migrate-operations-to-supabase.ts` | Supabase (`companies`) | Completa — foi o script do incidente |
| `scripts/migrate-to-supabase.ts` | Supabase (posts/categories/tags/authors/educational) | Completa — antes não tinha NENHUM gate `--apply`, escrevia sempre |
| `scripts/backfill-excerpt-impact.ts` | Supabase (`posts`, lista fechada de ids) | Completa |
| `scripts/fase5-dry-run.mts` | Supabase Storage (delete de smoke-test) | Completa |
| `scripts/backfill-segmentos.ts` | Nenhum (só leitura + relatório `.md` local) | Resolução segura de env, sem guard de escrita (não escreve no banco) |
| `scripts/refresh-commodities-reference.py` | Nenhum (arquivo local, Python standalone) | N/A — não usa dotenv nem Supabase |

Um teste automático (`scripts/lib/scripts-safety-audit.test.ts`) escaneia `scripts/` a cada execução da suíte e falha se um script novo com método de escrita (`insert`/`update`/`upsert`/`delete`/`rpc`/Storage `upload`/`remove`/`move`/`copy`) não importar `scripts/lib/safe-target`, ou se qualquer script voltar a usar `dotenv.config({override:true})` em código real (não em comentário). Ao criar um script novo de escrita, rodar a suíte já revela se ele precisa da proteção.

## Se `assertSafeToWrite` bloquear inesperadamente

A mensagem de erro lista exatamente o(s) requisito(s) ausente(s) (ex: `FAIL_CLOSED: escrita em produção bloqueada — requisito(s) ausente(s): --allow-production`). Não existe forma de contornar isso por variável de ambiente ou configuração — é intencional. Se o destino pretendido era realmente produção, adicionar `--allow-production` conscientemente, depois de revisar o preview. Se o destino pretendido NÃO era produção, o bloqueio pegou exatamente o tipo de erro operacional que causou o incidente original — parar e conferir `.env.local`/variáveis de ambiente antes de qualquer outra tentativa.
