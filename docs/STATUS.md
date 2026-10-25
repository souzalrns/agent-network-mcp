# STATUS — agent-network-mcp

> Última atualização: 25/10/2026 (limpeza H-01).
> Este ficheiro é o índice **deste repositório** (camada privada / produção LRNSdigital; o repo no GitHub é público).
> Estado vivo do ecossistema e pendências: `network-agents-setup` → `docs/STATUS.md` e `docs/initiatives/PENDENCIAS.md`.
> Os números (agentes, testes) vêm do código: `docs/generated/AGENTS.md` e `npm test` (`tests/docsNumbers.test.mjs` falha se o README divergir).

## Identidade

| Campo | Valor |
|-------|--------|
| **Repo** | `souzalrns/agent-network-mcp` |
| **Camada** | `private-production` |
| **Papel** | Servidor MCP em produção: router + agentes de negócio com memória Supabase |
| **Deploy** | Vercel — https://agent-network-mcp-oddn.vercel.app |
| **Relaciona-se com** | `network-agents-setup` (PCU genérico / portfólio); produtos mesaflow, viannalegal, etc. |

## O que é este repo

Instância de produção da rede de agentes LRNSdigital. Expõe ferramentas MCP
com agentes de projeto que têm **systemPrompt + contexto real de negócio**.

## Estado real

| Peça | Estado |
|------|--------|
| MCP server (Next.js / Vercel) | Em produção |
| Agentes em `lib/agents.js` | Operacionais (34; `vianna-gestao` entrou a 19/10/2026) |
| Memória Supabase + pgvector | Em produção |
| Router LLM (Gemini Flash Lite) | Em produção |
| Dashboard / grafo UI | Implementado |
| Execução remota (`dispatch_code_task` + bridge-worker na VM) | **Desligada** (S20): a chave SSH da VM perdeu-se e não há capacidade na Oracle para outro servidor. A tool falha fechada e não cria tarefas; só liga com `CODE_TASKS_ENABLED=1` e um worker novo |
| Graphify (código) | Instalado; `graphify-out/` **gitignored**; update local |
| GitHub Actions (heartbeat, etc.) | **Activo, agendado:** `heartbeat.yml` (de 3 em 3 dias) e `audit-tools.yml` (dias 1 e 15). A premissa custo zero mantém-se: o repo é público e os minutos são gratuitos (corrigido a 2026-10-05, H-005) |

## O que NÃO está aqui

- Motor genérico / demo pública → `network-agents-setup`
- Código dos produtos → repos respectivos

## Documentação automática

```bash
node scripts/document-agents.js
```

## Como retomar

1. Ler este `docs/STATUS.md`
2. Pendências e decisões → `network-agents-setup` `docs/initiatives/PENDENCIAS.md` (o único documento de estado)
3. Graphify local se existir grafo
4. Planos antigos (reestruturação v1.0–v1.2, addendum, diagnóstico da VM) → `docs/archive/` (histórico, não executar)

## Changelog curto

| Data | Nota |
|------|------|
| 19/08/2026 | STATUS inicial + document-agents |
| 19/08/2026 | Graphify local; Actions desligados documentados |
| 30/09/2026 | Fix das 9 tools MCP (PR #9): recebiam `undefined` desde 27/09 (`024e0ee`); agora `registerTool`; e2e em `tests/e2e/` |
| 30/09/2026 | J6: ledger de tokens em produção (PR #8): tabela `token_usage` criada pelo DEV, 1 linha por chamada Gemini — ver `docs/ops/TOKEN-LEDGER.md` (falta confirmar a 1.ª linha real) |
| 30/09/2026 | Fix do `log_execution`: 4 campos opcionais passam a chegar ao `agent_log` (PR `fix/log-execution-meta`) |
| 05/10/2026 | H-005/H-006 (PENDENCIAS do `network-agents-setup`): as Actions agendadas estão activas, e a linha "desligado" foi corrigida; o README perdeu os links mortos e a nota de TODO; `LICENSE` MIT; `diagnostico-vm.txt` → `docs/ops/diagnostico-vm-2026.txt` (hoje em `docs/archive/ops/`); actions pinadas por SHA em versões Node 24 (H-003) |
| 25/10/2026 | H-01: `dispatch_code_task` falha fechada (S20, `lib/codeTasks.js`); README com 34 agentes e sem prometer execução remota; números verificados por teste; planos antigos → `docs/archive/` |
