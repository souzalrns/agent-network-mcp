# STATUS — agent-network-mcp

> Última atualização: 19/08/2026.
> Este ficheiro é o índice **deste repositório** (camada privada / produção LRNSdigital).
> Visão geral do ecossistema: Supabase `system_inventory` + `pendencias_negocio`,
> e o espelho Git em `network-agents-setup` → `docs/STATUS-ECOSSISTEMA.md` / `STATUS-PROJETOS.md`.

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
| Agentes em `lib/agents.js` | Operacionais (30+) |
| Memória Supabase + pgvector | Em produção |
| Router LLM (Gemini Flash Lite) | Em produção |
| Dashboard / grafo UI | Implementado |
| Graphify (código) | Instalado; `graphify-out/` **gitignored**; update local |
| GitHub Actions (heartbeat, etc.) | **Desligado / não integrado** — premissa custo zero |

## O que NÃO está aqui

- Motor genérico / demo pública → `network-agents-setup`
- Código dos produtos → repos respectivos

## Documentação automática

```bash
node scripts/document-agents.js
```

## Como retomar

1. Ler este `docs/STATUS.md`
2. Graphify local se existir grafo
3. Supabase `system_inventory` / `pendencias_negocio`
4. PCU → `network-agents-setup`

## Changelog curto

| Data | Nota |
|------|------|
| 19/08/2026 | STATUS inicial + document-agents |
| 19/08/2026 | Graphify local; Actions desligados documentados |
