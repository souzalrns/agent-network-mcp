# STATUS — agent-network-mcp

> Última atualização: 19/08/2026.
> Este ficheiro é o índice **deste repositório** (camada privada / produção LRNSdigital).
> Visão geral do ecossistema: Supabase `system_inventory` + `pendencias_negocio`,
> e o espelho Git em `network-agents-setup` → `docs/STATUS-ECOSSISTEMA.md`.

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
(`ask_agent_network`, `run_specific_agent`, ingestão, etc.) com agentes de projeto
que têm **systemPrompt + contexto real de negócio** (não templates vazios).

## Estado real

| Peça | Estado |
|------|--------|
| MCP server (Next.js / Vercel) | Em produção |
| Agentes em `lib/agents.js` | Operacionais (30+) |
| Memória Supabase + pgvector | Em produção |
| Router LLM (Gemini Flash Lite) | Em produção |
| Dashboard / grafo | Implementado |
| GitHub Actions (heartbeat, ingest, scrape) | Ativos |

## O que NÃO está aqui

- Motor genérico / demo pública de portfólio → `network-agents-setup`
- Código dos produtos (API MesaFlow, site ViannaLegal) → repos respectivos
- Conteúdo jurídico demo curado sem dados privados → seeds do PCU

## Documentação automática

```bash
node scripts/document-agents.js
```

Gera `docs/generated/AGENTS.md` a partir de `lib/agents.js` (ids + descriptions).
Não editar `docs/generated/` à mão.

## Como uma sessão futura deve retomar

1. Ler este `docs/STATUS.md`
2. Correr `node scripts/document-agents.js` se precisar da lista atual de agentes
3. Consultar Supabase `system_inventory` / `pendencias_negocio`
4. Para arquitetura genérica / PCU, ver `network-agents-setup`

## Changelog curto

| Data | Nota |
|------|------|
| 19/08/2026 | STATUS inicial + script document-agents |
