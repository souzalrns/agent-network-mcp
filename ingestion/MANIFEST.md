# Manifesto de ingestão pendente

> **LEGADO (AU-06, D-EP9 = A, 2026-10-03).** A ingestão canónica do RAG é o T6 do `network-agents-setup` (`scripts/ingest_apply.py`). Este manifesto e a tool MCP `ingest_knowledge` / `.github/workflows/ingest.yml` ficam como adaptador legado e não recebem conhecimento novo.
> Exemplo do que daqui saiu: os 8 chunks "ECC security-reviewer + database-reviewer" que o F0.2 encontrou com `source ILIKE '%security%'`. Registo: `network-agents-setup/docs/initiatives/PENDENCIAS.md`.

Gerado em 06/08/2026. Cada linha = uma chamada à ferramenta MCP
`ingest_knowledge(agent, source, text)`, onde `text` é o conteúdo do
arquivo correspondente. Origem: 262 skills/agentes do repositório
`souzalrns/ECC` (mirror de `affaan-m/ECC`), curados manualmente para
enriquecer os agentes já existentes da rede em vez de criar agentes novos
por assunto de código.

**Como executar**: abrir uma conversa nova (para o cache de ferramentas
MCP pegar `ingest_knowledge`, adicionado no commit 48edd5d), ler cada
arquivo abaixo e chamar `ingest_knowledge` com o `agent` e `source`
indicados.

| Arquivo | agent (destino) | source (nome curto) |
|---|---|---|
| `revisor-codigo-security-database.md` | `revisor-codigo` | ECC security-reviewer + database-reviewer |
| `arquitetura-agentes-planejamento-rede-docs.md` | `arquitetura-agentes` | ECC planner+architect+code-architect+network-*+doc-updater+docs-lookup |
| `guia-tdd-testes.md` | `guia-tdd` | ECC tdd-guide+pr-test-analyzer+e2e-runner |
| `radar-ferramentas-opensource.md` | `radar-ferramentas` | ECC opensource-forker+packager+sanitizer |
| `marketing-base.md` | `marketing` | ECC marketing-agent |
| `comunicacoes-atendimento-base.md` | `comunicacoes-atendimento` | ECC chief-of-staff |
| `produto-tech-transversal-a11y-seo.md` | `produto-tech-transversal` | ECC a11y-architect+seo-specialist |
| `direito-br-pt-usucapiao.json` | `direito-br-pt` | (já preparado antes, ainda pendente também) |

Os 3 agentes novos (`marketing`, `comunicacoes-atendimento`,
`produto-tech-transversal`) foram adicionados em `lib/agents.js` no mesmo
commit deste manifesto — são pools horizontais que atendem qualquer
negócio da rede, não donos de um negócio específico. Critério usado para
decidir o que vira pool novo vs. o que entra em agente já existente:
"isto ainda seria útil se amanhã surgisse um 11º negócio totalmente
diferente?" — se sim e não havia agente equivalente, virou pool novo; se
sim e já havia agente com função equivalente (ex: security-reviewer →
revisor-codigo), o conteúdo entra nesse agente existente em vez de criar
um novo.
