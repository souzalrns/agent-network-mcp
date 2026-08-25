# Skills externos — addyosmani/agent-skills

Espelho local (não submodule) do pack de 24 skills de engenharia de
https://github.com/addyosmani/agent-skills (MIT, 89k+ estrelas, verificado
25/08/2026). Copiado direto porque o Luiz trabalha 100% remoto — o comando
`/plugin marketplace add` só existe no Claude Code CLI local, então isto
substitui a instalação via plugin nesta forma de trabalho.

## Como usar

Antes de trabalhar em algo que bata com uma das linhas abaixo, ler o
`SKILL.md` correspondente primeiro — mesmo padrão dos skills nativos do
Claude (`/mnt/skills/public/...`), só que aplicado a este repo.

| Você vai... | Leia primeiro |
|---|---|
| Especificar uma feature/projeto novo antes de codar | `skills/spec-driven-development/SKILL.md` |
| Quebrar um spec em tarefas pequenas | `skills/planning-and-task-breakdown/SKILL.md` |
| Implementar qualquer mudança que toque mais de 1 arquivo | `skills/incremental-implementation/SKILL.md` |
| Escrever lógica nova ou corrigir bug | `skills/test-driven-development/SKILL.md` |
| Desenhar uma API ou contrato entre módulos | `skills/api-and-interface-design/SKILL.md` |
| Construir ou mexer em UI | `skills/frontend-ui-engineering/SKILL.md` |
| Revisar código antes de mergear (SEMPRE, sem exceção) | `skills/code-review-and-quality/SKILL.md` |
| Mexer em autenticação, dados de utilizador, input externo | `skills/security-and-hardening/SKILL.md` |
| Simplificar código que funciona mas está confuso | `skills/code-simplification/SKILL.md` |
| Fazer qualquer commit | `skills/git-workflow-and-versioning/SKILL.md` |
| Configurar ou mexer em pipeline de deploy | `skills/ci-cd-and-automation/SKILL.md` |
| Preparar para produção | `skills/shipping-and-launch/SKILL.md` |
| Investigar teste quebrado ou comportamento inesperado | `skills/debugging-and-error-recovery/SKILL.md` |
| Documentar uma decisão de arquitetura | `skills/documentation-and-adrs/SKILL.md` |

Checklists de apoio (`references/`): `security-checklist.md`,
`performance-checklist.md`, `accessibility-checklist.md`,
`testing-patterns.md`, `observability-checklist.md`.

Atualizar este espelho: `git clone --depth 1 https://github.com/addyosmani/agent-skills.git /tmp/as && cp -r /tmp/as/{skills,references,agents} skills-external/` — não é submodule de propósito (evita depender de rede externa em todo checkout).
