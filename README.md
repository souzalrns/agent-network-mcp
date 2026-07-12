# agent-network-mcp

Servidor MCP da rede de agentes LRNSdigital, pronto para deploy no Vercel.
Este é o "segundo cérebro" acessível diretamente do claude.ai — depois de
publicado e ligado como conector, escreves normalmente no chat e a estrutura
de router + agentes + memória corre por trás, sem precisares de terminal.

## Deploy no Vercel

1. No dashboard do Vercel: **Add New → Project** → importa este repositório.
2. Em **Environment Variables**, adiciona (ver `.env.example`):
   - `GEMINI_API_KEY` — chave **gratuita** do Google AI Studio, sem cartão de
     crédito. Cria em https://aistudio.google.com/apikey
   - `AGENT_MODEL` (opcional, default `gemini-2.5-flash`)
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (opcionais — sem isto os
     agentes funcionam mas sem memória persistente entre sessões)
3. Deploy. O Vercel dá-te uma URL tipo `https://agent-network-mcp.vercel.app`.
4. Se fores usar memória, corre o `memory/schema.sql` do protótipo anterior
   no teu projeto Supabase (mesmas tabelas `project_state` e `agent_log`).

## Ligar ao claude.ai

1. claude.ai → **Definições → Conectores → Adicionar conector personalizado**.
2. URL: `https://<o-teu-projeto>.vercel.app/api/mcp`
3. Depois de ligado, passas a poder pedir aqui no chat, por exemplo:
   *"Usa a rede de agentes para verificar o estado do MesaFlow"* — e eu
   chamo a ferramenta `ask_agent_network` deste servidor automaticamente.

## Ferramentas expostas

- **`list_agents`** — lista os agentes de projeto disponíveis.
- **`ask_agent_network`** — pedido em linguagem natural; o router escolhe o
  agente certo automaticamente (fluxo principal).
- **`run_specific_agent`** — chama diretamente um agente conhecido,
  ignorando o router.

## Estrutura

```
app/
├── layout.js         # layout raiz (exigido pelo Next.js)
├── page.js           # página de confirmação (só texto)
└── api/mcp/route.js  # o servidor MCP em si (GET/POST)
lib/
├── agents.js         # contexto fixo de cada agente (mesaflow, viannalegal)
└── memory.js         # cliente Supabase (opcional)
```

## Adicionar um novo agente

Edita `lib/agents.js` e acrescenta uma entrada ao objeto `AGENTS` — não é
preciso mexer no `route.js`, ele lê a lista dinamicamente.

## Limitações desta primeira versão

- Sem autenticação no endpoint MCP — qualquer pessoa com a URL consegue
  chamar as ferramentas. Para uso pessoal é aceitável, mas se partilhares o
  link ou ligares dados sensíveis, vale a pena adicionar OAuth (o pacote
  `mcp-handler` suporta isto nativamente — ver docs do Vercel sobre MCP).
- Sem loop de tool-use para ferramentas externas (GitHub, Vercel) ainda —
  os agentes respondem e sugerem, mas não executam ações fora deste servidor.
- Um pedido = uma chamada de router + uma chamada de agente. Sem paralelismo
  nem consenso entre agentes (não é necessário para o teu volume de uso).
