# CLAUDE.md — vtres60-blog

## Obrigação de início de sessão

**Antes de qualquer ação neste projeto, em toda nova conversa (especialmente após `/clear`), leia primeiro:**

```
/home/pedro/.claude/projects/-home-pedro-vtres60-blog/memory/project_vtres60_timeline.md
```

Esse arquivo é a linha do tempo completa do projeto (auditoria inicial → Fase 3 → Fase 4 → Fase 5 deploy → GitHub → Fase 6), com links para o detalhe de cada fase. Sem lê-lo primeiro, é fácil repetir investigações já feitas, re-perguntar coisas já respondidas, ou — pior — assumir um estado de produção que já mudou (migrations aplicadas, deploy feito, bug corrigido).

Depois da timeline, o índice completo de memória está em:

```
/home/pedro/.claude/projects/-home-pedro-vtres60-blog/memory/MEMORY.md
```

Esse índice é carregado automaticamente pelo sistema de memória a cada sessão — mas a timeline acima é o ponto de entrada certo para entender a ORDEM dos eventos antes de mergulhar nos arquivos individuais.

## Regras específicas deste projeto

- **`src/content/leads.json` e `src/content/logs.json` são dados de runtime reais**, mutados pelo processo PM2 (`vtres60-blog`) que roda ao vivo neste mesmo diretório. Nunca usar `git add -A`/`git add .` — sempre listar arquivos explicitamente e verificar `git status` antes de commitar. Ver `feedback_vtres60_runtime_files_in_repo.md`.
- **Nunca rodar `npm run build` direto neste diretório enquanto o processo `vtres60-blog` estiver ativo** — ele lê `.next` deste mesmo caminho e um build in-place corrompe o processo ao vivo. Para validar um build sem deploy, usar um git worktree isolado (técnica documentada em `project_vtres60_deploy_runbook.md`).
- **Deploy (build + `pm2 restart` + `pm2 save`) é sempre uma sequência atômica**, nunca dividida entre turnos. Ver `feedback_deploy_build_restart_atomic.md`.
- **Nunca declarar algo "corrigido" sem testar de verdade** (chamada HTTP real, leitura real do banco, execução real do agente). Ver `feedback_verify_before_claiming_fixed.md`.
- Pedro especifica trabalho substancial como specs prescritivas longas e numeradas — cumprimento literal item a item é esperado, com PARE explícito se um pressuposto do estado atual divergir. Ver `feedback_vtres60_prescriptive_phases.md`.
