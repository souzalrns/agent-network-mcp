# Rede de Agentes LRNSdigital

> Servidor MCP com 33 agentes especializados, roteamento automático via LLM, memória vetorial persistente e execução remota de código — tudo a custo zero.

[🔗 Ver Aplicação em Produção](https://agent-network-mcp-oddn.vercel.app)

![Status](https://img.shields.io/badge/Status-Em%20Produção-brightgreen)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)
![Supabase](https://img.shields.io/badge/DB-Supabase%20pgvector-3ECF8E)
![Gemini](https://img.shields.io/badge/LLM-Gemini%20Flash%20Lite-4285F4)

---

## O Problema

Gerir ~10 negócios em simultâneo significa contexto técnico e de domínio disperso por dezenas de conversas — cada nova sessão de IA começa do zero, sem memória do que já foi decidido, testado ou construído. Este sistema resolve isso: uma rede de agentes especializados com memória persistente e partilhada, acessível diretamente de qualquer cliente MCP (incluindo claude.ai), sem custo de infraestrutura.

## Principais Funcionalidades

- **33 agentes especializados** por domínio de negócio (jurídico, engenharia, design, dados, marketing, entre outros) — roteados automaticamente por linguagem natural
- **Memória vetorial (RAG)** por agente + conhecimento `global` partilhado por toda a rede
- **Execução remota de código** numa VM própria via fila assíncrona (Claude Code local, sem SSH manual). *Estado por confirmar: está registado um 401 no bridge-worker da VM (item S20 do `network-agents-setup`).*
- **Registo automático de execuções** (`agent_log`) para auditoria e aprendizagem futura

**Repositório irmão:** [`network-agents-setup`](https://github.com/souzalrns/network-agents-setup), com o motor de execução (`plan_runner`), a governação (HITL, orçamentos de tokens) e os domain packs. Este repo é a superfície MCP de produção.

## Stack Técnica

- **Runtime:** Node.js, Vercel Serverless Functions (protocolo MCP)
- **LLM de roteamento:** Google Gemini Flash Lite (tier gratuito, sem cartão de crédito)
- **Base de dados:** Supabase (PostgreSQL + extensão pgvector para busca semântica)
- **Automação:** GitHub Actions (transcrição de vídeo, scraping, heartbeat)

## Dados e privacidade

- **Transcrições vivem no Supabase, não no git.** O workflow `transcribe.yml` grava cada transcrição na tabela `public.transcripts`. A pasta `transcripts/` está no `.gitignore`.
- **O repo público não tem conteúdo de terceiros.** Também não tem dados de clientes nem segredos: as chaves só existem como variáveis de ambiente (Vercel, GitHub Actions).
- Política de privacidade (LGPD + GDPR), inventário de dados e separação repo público/privado: [`network-agents-setup/docs/governance/PRIVACY-POLICY.md`](https://github.com/souzalrns/network-agents-setup/blob/main/docs/governance/PRIVACY-POLICY.md).

## Destaques Técnicos

1. **Custo zero por desenho, não por sorte:** todo o roteamento corre em Gemini Flash Lite gratuito — a arquitetura foi pensada desde o início para nunca depender de créditos pagos para operação normal.
2. **Conhecimento global vs. por agente:** a busca semântica filtra por `agent_id` específico OU `agent_id = 'global'` na mesma função SQL — conhecimento fundamental (metodologia, princípios) fica visível a todos os 33 agentes sem duplicação manual em cada um.
3. **Onboarding de agente à prova de falha silenciosa (em progresso):** todo agente novo devia exigir linha correspondente na tabela `projects` antes de aceitar `save_project_state`. Na prática, esta regra continua a ser esquecida — os 3 agentes horizontais mais recentes (comunicações, marketing, produto/tech) ficaram sem essa linha até serem detetados numa auditoria de rotina. A correção é sempre rápida; o processo de onboarding que a previna de acontecer de todo ainda não existe.

## Como Rodar Localmente

```bash
git clone https://github.com/souzalrns/agent-network-mcp.git
cd agent-network-mcp
npm install
# Configurar GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ver .env.example)
npm run dev
```

**Deploy:**
- O projecto Vercel está ligado a este repositório: cada merge na `main` faz um deploy de produção.
- As variáveis de ambiente estão descritas no [`.env.example`](./.env.example) e configuram-se em Vercel → Project → Settings → Environment Variables.

**Ligação como conector MCP:**
- O endpoint é `/api/mcp` e exige `Authorization: Bearer <MCP_API_KEY>`.
- Sem a chave configurada, o endpoint responde 503 (fail-closed).

## Estado do Projeto

**Em produção**, servindo pedidos reais diariamente. Evolução ativa — arquitetura horizontal consolidada em agosto de 2026, conhecimento global adicionado na mesma altura.

---

Feito por Luiz Souza • [GitHub](https://github.com/souzalrns) • [Portfólio](https://github.com/souzalrns/network-agents-setup/blob/main/docs/PORTFOLIO.md) • Licença [MIT](./LICENSE)
