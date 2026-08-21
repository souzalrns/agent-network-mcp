# Addendum — Padrões Extraídos de Orquestradores Open Source

**Complementa `PLANO_REESTRUTURACAO_AGENT_NETWORK_v1.1.md`. Regra de quarentena mantida: padrões arquiteturais podem ser estudados e adotados antes do código-fonte de origem sair de quarentena — ideia e implementação são avaliadas separadamente, conforme já praticado com Ruflo e Hermes Agent em sessões anteriores.**

---

## Sistemas avaliados

| Sistema | Licença | Segurança | O que oferece de único |
|---|---|---|---|
| DeepSeek Harness (dsh) | MIT | Sem CVEs conhecidas — mas developer preview, sem PRs externos aceitos ainda | "Tudo é plugin" via kernel Cordis |
| Hermes Agent (NousResearch) | MIT | **6 CVEs conhecidas, fabricante sem resposta a disclosures** (avaliado antes) | Resolvedor de modelo multi-provedor, memória em camadas, criação de skill pós-execução |
| OpenClaw | — | Não avaliado em profundidade | Loop duplo (planejamento cognitivo separado de execução de ferramenta), roteamento semântico entre sessões |
| LangGraph DeepAgents | — | Não avaliado em profundidade | Grafo (DAG) persistente e explícito, planejamento como ferramenta de primeira classe (`write_todos`), execução totalmente rastreável |

**Regra aplicada a todos os quatro:** nenhum código é importado. Cada linha abaixo é um padrão descrito em texto, a ser reimplementado do zero sobre a stack leve (Vercel+Supabase), nunca copiado.

---

## Padrões adotados (entram no núcleo)

### 1. Resolvedor de Modelo (multi-IA) — **novo componente do Fase 0.5**

Do Hermes Agent: um resolvedor único mapeia `(provedor, modelo)` → configuração de execução (modo de API, chave, endpoint, alias). Todo o resto do sistema — roteador, agentes, ferramentas — chama o resolvedor, nunca fala com um provedor de IA diretamente.

```sql
CREATE TABLE model_providers (
  id text PRIMARY KEY,        -- 'gemini-flash-lite' | 'claude-sonnet' | 'deepseek-v4' | ...
  provider text NOT NULL,     -- 'google' | 'anthropic' | 'deepseek' | 'openrouter' | ...
  api_mode text NOT NULL,     -- formato de chamada (varia por provedor)
  base_url text,
  credential_ref text,        -- referência ao segredo, nunca o valor em claro
  custo_estimado_por_1k_tokens numeric,
  ativo boolean DEFAULT true
);
```

- Trocar o modelo de um agente vira `UPDATE agents SET modelo='deepseek-v4' WHERE id=...` — sem deploy, sem tocar em código.
- Permite o que o Hermes chama de fallback: se o modelo primário falhar ou estourar limite, o resolvedor tenta o próximo da lista, de forma transparente ao agente.
- **Isso é o que responde diretamente à tua pergunta:** sim, o sistema plugável passa a suportar qualquer provedor de IA (Gemini, Claude, DeepSeek, modelos locais) — trocar ou combinar não exige reescrever nada, só configurar.

### 2. Prompt em camadas (estável → contexto → volátil)

Do Hermes: o prompt de sistema é montado em tiers — identidade/instruções fixas primeiro (cacheável), depois contexto do projeto, depois o que muda a cada chamada (timestamp, estado da sessão). Isso permite cache de prefixo no provedor de IA, reduzindo custo real de tokens repetidos — relevante mesmo em modelo gratuito (Gemini Flash Lite), porque throughput/latência também melhoram.

### 3. Compressão de contexto sob limiar

Quando a conversa/sessão ultrapassa um tamanho definido, resumir os turnos do meio automaticamente em vez de deixar crescer sem limite. Padrão simples, encaixa direto na Fase 1 (log de sessão) — resumo entra como um tipo de evento próprio (`step_type='context_compression'`), nunca apaga o log original.

### 4. Extração de skill pós-execução (aplicar com cautela)

Do Hermes: depois de uma tarefa bem-sucedida, o sistema pode propor um resumo reutilizável do caminho que funcionou. **Adotar em versão reduzida:** gerar um **rascunho** de conhecimento candidato (liga direto com a Fase 6 — ingestão controlada, estado `candidate`), nunca auto-aprovar. Extração automática de skill sem revisão humana é exatamente o tipo de "auto-evolução sem verificação" que o problema raiz deste plano existe para evitar.

### 5. Planejamento como ferramenta de primeira classe

Do LangGraph DeepAgents: forçar o agente a escrever um plano explícito (`write_todos`-like) antes de agir em tarefas de múltiplos passos, e esse plano vira parte do log de sessão, auditável. Baixo custo de implementação, alto valor de auditoria — encaixa bem na Fase 2 (verificação), como um `step_type='plan'` que precede os `tool_call`.

---

## Padrões estudados e conscientemente **não** adotados agora

| Padrão | Por que fica de fora |
|---|---|
| Ambientes de execução isolados (Docker/SSH/Daytona/Modal, do Hermes) | Contradiz a premissa de custo zero e o princípio de stack leve — exige infraestrutura de sandbox que não temos motivo pra manter |
| Gateway multicanal (Telegram/Discord/Slack/WhatsApp, do Hermes/OpenClaw) | Fora de escopo — o núcleo é sobre orquestração de agentes de negócio, não sobre superfícies de mensagem. Pode ser avaliado depois como *vertical* de um projeto específico, nunca como núcleo |
| Loop duplo cognição/execução (OpenClaw) | Interessante, mas a Fase 2 (verificação obrigatória) já ataca o mesmo problema (afirmação vs. evidência) por outro caminho, mais simples de implementar com o que já existe |
| Multi-agente com DAG completo (Hermes issue #344, "Gas Town roda 50+ agentes concorrentes") | Escala que não existe aqui — 33 agentes, um de cada vez, é a realidade. Adotar DAG completo agora é o mesmo tipo de over-engineering já identificado no `network-agents-setup` |
| Kernel de plugin dedicado tipo Cordis (DeepSeek Harness) | Já decidido: extrair o *padrão* (registro plugável), não importar um kernel externo inteiro |

---

## Onde isso entra no plano v1.1

- **Fase 0.5 (Contrato do Núcleo):** adicionar `ModelProvider` à lista de entidades, ao lado de `Agent`, `Capability`, `Tool`.
- **Fase 3 (tabela `agents`):** campo `modelo` passa a referenciar `model_providers.id`, com fallback opcional.
- **Fase 6 (ingestão de conhecimento):** skills extraídas automaticamente entram sempre como `candidate`, nunca `approved` sem revisão.

Nenhuma fase nova é criada — os padrões acima encaixam nas fases já existentes, reforçando (não inflando) o escopo.
