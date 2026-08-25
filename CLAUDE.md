# CLAUDE.md — agent-network-mcp

## Bootstrap obrigatório (sempre, sem o utilizador pedir)

No **início de cada sessão** ou antes da **primeira alteração de código**:

1. Ler `docs/STATUS.md`.
2. Para visão do conjunto LRNSdigital, ler:
   https://github.com/souzalrns/network-agents-setup/blob/main/docs/STATUS-ECOSSISTEMA.md
   (atalho “status dos projetos”: docs/STATUS-PROJETOS.md no mesmo repo PCU)
3. Se útil, correr ou consultar `docs/generated/AGENTS.md` (regenerar: `node scripts/document-agents.js`).
4. Resumir: o que está em produção, agentes relevantes, o que não partir.
5. Só depois propor ou executar trabalho.

Não esperar o utilizador dizer “lê o STATUS”.

## Identidade deste repo

- **Camada:** privada / produção.
- **Papel:** servidor MCP (Vercel) com router + agentes de negócio e memória Supabase.
- **Não é** o PCU genérico de portfólio → `network-agents-setup`.
- Agentes em `lib/agents.js` têm systemPrompt e contexto real; não substituir por templates vazios tipo ruflo.

## Graphify

Grafo de código local em `graphify-out/` (**gitignored** — gerar na máquina, não commitar artefactos).

Regras:
- Perguntas sobre o código deste repo: preferir `graphify query "..."` / `graphify path "A" "B"` / `graphify explain "..."` quando `graphify-out/graph.json` existir.
- Wiki: `graphify-out/wiki/index.md` se existir.
- `GRAPH_REPORT.md` só para visão ampla de arquitetura.
- Após mudanças relevantes de código: `graphify update .` (AST-only, sem custo de API).
- **Não** ligar Graphify a GitHub Actions pagos — premissa custo zero; atualização local/manual.

## Automação

```bash
node scripts/document-agents.js   # → docs/generated/AGENTS.md
```

Após adicionar/renomear agentes em `lib/agents.js`, regenerar o catálogo.

## Regras de trabalho

- Não expor dados sensíveis em commits ou respostas públicas.
- Novos agentes: alinhar com onboarding (ex.: linha em `projects` quando aplicável).
- Custo: preferir Gemini Flash Lite / caminhos já desenhados para tier gratuito quando possível.
- Não reativar workflows GitHub Actions que consumam minutos em repos privados sem decisão explícita.
- Alterações ao router e tools MCP: verificar impacto no Claude.ai connector.

## Onde está o resto

| Precisas de… | Vai a… |
|--------------|--------|
| PCU / demo pública | `network-agents-setup` |
| API MesaFlow | `mesaflow-api` |
| Site ViannaLegal | `viannalegal-site` |
| Inventário operacional | Supabase `system_inventory` / `pendencias_negocio` |
