# SkillOpt

Otimizador oficial da Microsoft Research (`microsoft/SkillOpt`) que treina o
*texto* de um `SKILL.md` automaticamente, com base em execuções reais — não
mexe em pesos de modelo, edita e valida a instrução em si (rollout → reflexão
→ edição → validação → aceita só se melhorar).

Testado e confirmado a instalar/rodar em 09/08/2026 (comando real confirmado:
`skillopt-sleep`, não `skillopt` sozinho — ver nota abaixo).

## Por que isto importa pra nós

Temos várias skills instaladas (`ui-ux-pro-max-skill`, `taste-skill`,
`impeccable`, `emil-design-eng`, `huashu-design`, etc.) mas a maioria delas
nunca foi de fato usada o suficiente pra saber se estão bem escritas. O
SkillOpt-Sleep é literalmente uma ferramenta para isso: roda à noite, analisa
execuções reais das skills, e propõe edições (só aplicadas se passarem por
um portão de validação — nunca piora a skill).

## Instalação

```bash
pip install "skillopt[claude]"
```

O extra `[claude]` traz o `claude-agent-sdk`, dando suporte nativo pra
otimizar skills usadas via Claude Code/Claude Agent SDK — é o nosso caso.

## Comandos reais (CLI)

**Atenção:** o pacote se chama `skillopt` no PyPI, mas não instala um comando
`skillopt` — instala três comandos separados:

```bash
skillopt-sleep {run,dry-run,status,adopt,harvest,schedule,unschedule}
skillopt-eval
skillopt-train
```

Para o nosso caso de uso (evoluir skills já em produção), o relevante é o
`skillopt-sleep`:

```bash
skillopt-sleep dry-run   # harvest+mine+replay, só reporta, não aplica nada
skillopt-sleep status    # ver estado + última proposta pendente
skillopt-sleep run       # rodar o ciclo completo
skillopt-sleep adopt     # aplicar a última proposta em staging
skillopt-sleep schedule  # instalar entrada de cron noturno pro projeto
```

## Próximo passo (não feito ainda)

Ainda não configurámos nenhum ciclo real — falta escolher qual skill testar
primeiro (`dry-run` é seguro, só relatório) e definir onde rodar o cron
(`schedule`) — provavelmente na VM do Google Cloud, não no sandbox efêmero.
