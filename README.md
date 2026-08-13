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
- **Execução remota de código** numa VM própria via fila assíncrona (Claude Code local, sem SSH manual)
- **Registo automático de execuções** (`agent_log`) para auditoria e aprendizagem futura

## Stack Técnica

- **Runtime:** Node.js, Vercel Serverless Functions (protocolo MCP)
- **LLM de roteamento:** Google Gemini Flash Lite (tier gratuito, sem cartão de crédito)
- **Base de dados:** Supabase (PostgreSQL + extensão pgvector para busca semântica)
- **Automação:** GitHub Actions (transcrição de vídeo, scraping, heartbeat)

## Destaques Técnicos

1. **Custo zero por desenho, não por sorte:** todo o roteamento corre em Gemini Flash Lite gratuito — a arquitetura foi pensada desde o início para nunca depender de créditos pagos para operação normal.
2. **Conhecimento global vs. por agente:** a busca semântica filtra por `agent_id` específico OU `agent_id = 'global'` na mesma função SQL — conhecimento fundamental (metodologia, princípios) fica visível a todos os 32 agentes sem duplicação manual em cada um.
3. **Onboarding de agente à prova de falha silenciosa (em progresso):** todo agente novo devia exigir linha correspondente na tabela `projects` antes de aceitar `save_project_state`. Na prática, esta regra continua a ser esquecida — os 3 agentes horizontais mais recentes (comunicações, marketing, produto/tech) ficaram sem essa linha até serem detetados numa auditoria de rotina. A correção é sempre rápida; o processo de onboarding que a previna de acontecer de todo ainda não existe.

## Como Rodar Localmente

```bash
git clone https://github.com/souzalrns/agent-network-mcp.git
cd agent-network-mcp
npm install
# Configurar GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ver .env.example)
npm run dev
```

Deploy completo e ligação ao claude.ai como conector: ver instruções detalhadas em [`docs/DEPLOY.md`](./docs/DEPLOY.md) *(mover secção de deploy original para cá)*.

## Estado do Projeto

**Em produção**, servindo pedidos reais diariamente. Evolução ativa — arquitetura horizontal consolidada em agosto de 2026, conhecimento global adicionado na mesma altura.

---

Feito por Luiz Souza • [LinkedIn](#) • [Portfólio](#)
