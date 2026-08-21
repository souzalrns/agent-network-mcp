# Plano de Reestruturação Arquitetural — Agent Network Core

**De rede acoplada a plataforma cognitiva genérica: um núcleo que qualquer pessoa pode rodar.**

> Este documento é escrito para ser lido por um agente executor (Claude Code ou equivalente) como instrução de trabalho, e por Luiz como registro de decisão. Cada fase tem critério de aceitação verificável — nada é "concluído" sem prova, conforme a norma de verificação já adotada neste projeto.

---

## PARTE 0 — Preâmbulo: por que este documento existe

Luiz vem articulando, em múltiplas sessões e textos próprios, um princípio arquitetural não-negociável:

> **O núcleo deve rodar para qualquer pessoa.** Regras, conceitos, workflows e infraestrutura genérica são públicos e comuns. Só o que está vinculado a um projeto específico (ViannaLegal, MesaFlow, SST, HVAC, Canidelo) é pessoal — e isso deve ser **dado de configuração**, nunca código ou infraestrutura própria.

Esse princípio foi repetidamente perdido de vista — inclusive por mim — em favor de soluções que *parecem* mais sofisticadas (stacks pesadas, arquiteturas com muitos módulos) mas que na prática aumentam a barreira de entrada, o que é o oposto do objetivo. Este plano corrige essa deriva: define o que é **núcleo genérico** (publicável, MIT, zero dependência de negócio) e o que é **camada vertical** (dado, não código), e traça o caminho técnico de um para o outro a partir do que já existe rodando hoje.

Não é um redesign do zero. É uma extração e consolidação do que já foi construído em três lugares diferentes — `agent-network-mcp` (produção), `network-agents-setup` (protótipo paralelo nunca conectado), e os textos/constituições de Luiz — para um único núcleo coerente.

---

## PARTE 1 — Estrutura Atual (Diagnóstico Verificado)

*Tudo abaixo foi confirmado por leitura direta do código-fonte e de execuções reais em 19–21/08/2026, não por memória de sessões anteriores.*

### 1.1 — `agent-network-mcp` (o sistema em produção)

| Aspecto | Estado real |
|---|---|
| Hospedagem | Vercel (Hobby), repositório público `souzalrns/agent-network-mcp` |
| Definição dos agentes | **Enum Zod fixo** dentro do código-fonte do servidor MCP (tools `run_specific_agent`, `save_project_state`) |
| Roteamento | **Hardcoded** — switch/if no código do servidor. Não existe descoberta dinâmica em runtime |
| Adicionar um agente | Editar enum → deploy → inserir linha manual na tabela `projects` do Supabase (passo manual, sujeito a esquecimento) |
| Modelo | Google Gemini Flash Lite (custo zero), prompts injetados por agente |
| Memória/estado | Supabase (`mpsuurqilnhsvbnjmrpm`): tabelas `projects`, `project_state`, `transcripts`, `agent_log` |
| Log de execução | `transcripts` — histórico simples de interação, **não é event log append-only**, não tem replay nem fork |
| Camada de plugin | **Inexistente** — tudo acoplado num único codebase |
| Catálogo de capacidades | Tabela `capabilities` existe (schema: `agent_id`, `nome`, `descricao`, `gatilhos`, `custo_estimado_tokens`, `status`) — **38 linhas, 0 marcadas como `ativo`**. Construída, nunca ativada. |
| Ingestão de conhecimento (RAG) | Tabela `knowledge_chunks` — 46 chunks de 8 arquivos (dado de julho/2026). Pipeline existe, uso é mínimo. |
| Agentes atuais | 33, reorganizados de um modelo fragmentado (28 verticais) para um modelo horizontal parcial: `revisor-codigo`, `arquitetura-agentes`, `guia-tdd`, `radar-ferramentas`, `marketing`, `comunicacoes-atendimento`, `produto-tech-transversal`, `direito-br-pt`, `refrigeracao-hvac`, `design`, `viannalegal`, `mesaflow`, `sst`, `construtora`, `hvac`, entre outros |

**Diagnóstico:** o sistema funciona e está em produção — isso tem valor real, não deve ser descartado. Mas a "horizontalização" foi feita apenas na *organização dos agentes*, não na *arquitetura do motor*. O motor (roteador, sessão, ferramentas) continua monolítico e acoplado.

### 1.2 — `network-agents-setup` (protótipo paralelo, nunca conectado)

| Aspecto | Estado real |
|---|---|
| Repositório | `souzalrns/network-agents-setup` (público), pushed 19/08/2026 |
| Stack | TypeScript monorepo (pnpm workspaces), Prisma + PostgreSQL + pgvector, Redis, **Kubernetes** (`k8s/` com namespace, ingress, configmap, postgres, redis, services) |
| Padrões presentes | `ToolRegistry` (registro plugável real: `registerTool`/`unregisterTool`), `agents.config.ts` (agente = dado estruturado, não switch), `Orchestrator`/`Router`/`Planner`/`Executor` (loop decomposto em peças), `MemoryManager` (Prisma + Redis), `ChatController` (ponto de entrada HTTP que invoca o Orchestrator) |
| Validação | CI verde (`ci.yml`) — mas **zero secrets configurados**, `OPENAI_API_KEY` ausente, smoke test roda em modo "parcial" (o próprio código admite isso em comentário). **Nunca executou uma decisão de roteamento com IA real.** |
| Conexão com produção | **Nenhuma.** Nunca foi ligado aos 33 agentes reais nem a nenhum negócio de Luiz |
| Escopo | Inflado — inclui `ComplianceManager`, `ImmunologicalMemory`, `TokenEconomy`, `OrganizationalSimulator`, `OpportunityRadar`, `AttentionEconomy`: módulos aspiracionais derivados de um documento de "Constituição" de 18.551 linhas, já sinalizado em sessão anterior como over-engineering para execução solo |

**Diagnóstico:** os *padrões* de código são tecnicamente sólidos e reutilizáveis. A *stack* e o *escopo* são o oposto do princípio "roda para qualquer pessoa" — exigem Kubernetes, Postgres dedicado e Redis, e resolvem problemas (compliance corporativo, simulação organizacional) que não existem para um operador solo. **Extrair o padrão, descartar a stack e o escopo.**

### 1.3 — O problema raiz (nas palavras de Luiz, confirmado por evidência concreta)

> "Um dos nossos maiores problemas é a falta de procedimento de verificação, consulta automatizada de agentes, observação de um passo a passo em projetos, planejamento. Por isso por vezes estamos a refazer trabalhos."

Evidências concretas coletadas nesta mesma sessão:
- **PR #3 do `mesaflow-api`** (fix de IDOR em reservas) reportado como resolvido, mas confirmado `merged: false` — semanas depois.
- **Tabela `capabilities`** construída em sessão anterior, 38 linhas cadastradas, **0 ativadas** — diagnosticado e nunca ativado.
- **Vercel `BLOCKED`** do vianna-gestao tratado como pendência viva quando já estava resolvido havia tempo — nunca fechado na tabela.
- **`network-agents-setup`** apresentado como "implementado" (tabela P-001 a P-025) quando na verdade nunca rodou com IA real.

O padrão comum: **diagnóstico acontece, ação não é verificada, e o item nunca é fechado nem reaberto formalmente** — fica num limbo que consome memória (humana e de agente) sem gerar progresso confiável.

---

## PARTE 2 — O Que Queremos Construir (Estado-Alvo)

### 2.1 — Princípio organizador

```
┌─────────────────────────────────────────────────────────┐
│  NÚCLEO GENÉRICO (transversal, público, MIT, sem          │
│  dependência de negócio) — roda para QUALQUER PESSOA       │
│                                                             │
│  • Catálogo de Capacidades (o que um agente PODE fazer)    │
│  • Registro de Agentes como DADO (não código)               │
│  • Roteador dinâmico (lê da tabela, não do enum)             │
│  • Loop de execução decomposto (Router → Planner →           │
│    Executor → Verificador)                                   │
│  • Log de sessão append-only (trajetória completa)           │
│  • Motor de consulta/verificação automatizada                │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │  plugam-se como DADO,
                          │  nunca como código novo
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  ViannaLegal   │ │   MesaFlow    │ │  SST Portugal │
│  (vertical)    │ │  (vertical)   │ │  (vertical)   │
│  prompt+regras │ │ prompt+regras │ │ prompt+regras │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Teste de conformidade para qualquer decisão futura:** *"Se eu apagasse todos os dados de ViannaLegal/MesaFlow/SST agora, o núcleo ainda funcionaria e ainda faria sentido para um estranho que nunca ouviu falar de LRNSdigital?"* Se a resposta for não, o que foi construído está no lugar errado.

### 2.2 — O que muda de fato (não é reescrita, é extração + consolidação)

| Hoje | Alvo |
|---|---|
| Agente = linha de código no enum Zod | Agente = linha de dado na tabela `agents` (schema já existe em `agents.config.ts` do protótipo — reaproveitar o *schema*, não o repositório) |
| Adicionar agente = editar código + deploy | Adicionar agente = `INSERT` na tabela, efetivo na próxima chamada |
| Ferramentas fixas por agente, hardcoded | `ToolRegistry` plugável (padrão do `network-agents-setup`, reimplementado sem Kubernetes/Redis — puro TypeScript + Supabase) |
| Log = histórico de texto | Log = evento append-only por passo (prompt, decisão, ferramenta chamada, resultado) — permite replay e auditoria real |
| Verificação = eu dizendo "feito" | Verificação = passo obrigatório no loop que checa prova antes de marcar como concluído (a norma já adotada, agora embutida no motor, não só na minha disciplina de conversa) |
| Consulta entre agentes = eu decidindo manualmente quando chamar outro agente | Roteador consulta o catálogo de capacidades automaticamente antes de agir, delega quando a capacidade não é do agente atual |

---

## PARTE 3 — Plano de Execução (Passo a Passo, para Claude Code)

> Cada fase abaixo é uma unidade de trabalho independente, com critério de aceitação verificável. **Nenhuma fase é marcada concluída sem a prova descrita.** Nenhuma fase depende de infraestrutura nova (Kubernetes, Redis, Postgres dedicado) — tudo roda sobre Vercel + Supabase, que já está em produção.

### FASE 0 — Congelamento e Inventário (pré-requisito, 1 sessão)

**Objetivo:** ter um retrato exato do estado antes de mexer em qualquer coisa, para que rollback seja possível.

1. Exportar o enum Zod atual de agentes (`run_specific_agent`) para um arquivo `docs/snapshot-pre-refactor/agents-enum.ts` no repositório, com data.
2. Dump da tabela `projects`, `capabilities`, `transcripts` (schema + contagem de linhas) para `docs/snapshot-pre-refactor/supabase-state.md`.
3. Tag git `pre-refactor-v0` no commit atual de `agent-network-mcp`.

**Prova de aceitação:** commit visível no GitHub com os 3 arquivos + tag criada (`git tag` confirmável via API).

---

### FASE 1 — Tabela `agents` como fonte única de verdade

**Objetivo:** matar o enum Zod. Roteamento passa a ler dado, não código.

1. Criar tabela `agents` no Supabase (`mpsuurqilnhsvbnjmrpm`) com schema mínimo genérico:
   ```sql
   CREATE TABLE agents (
     id text PRIMARY KEY,
     nome text NOT NULL,
     layer text NOT NULL,              -- 'meta' | 'domain' | 'vertical'
     descricao text NOT NULL,
     system_prompt text NOT NULL,
     gatilhos text[],                  -- palavras/padrões que ativam este agente
     ferramentas_permitidas text[],    -- referencia capabilities.id
     modelo text DEFAULT 'gemini-flash-lite',
     ativo boolean DEFAULT true,
     is_vertical boolean DEFAULT false, -- true = específico de negócio, false = genérico
     projeto_vinculado text,            -- NULL se genérico; nome do projeto se vertical
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );
   ```
2. Migrar os 33 agentes atuais do enum para linhas nesta tabela (script único, idempotente, com `ON CONFLICT DO NOTHING`).
3. Marcar `is_vertical=true` e `projeto_vinculado` para os agentes de domínio (viannalegal, mesaflow, sst, hvac, construtora); os demais (revisor-codigo, arquitetura-agentes, guia-tdd, radar-ferramentas, marketing, comunicacoes-atendimento, produto-tech-transversal) ficam `is_vertical=false`.
4. Reescrever o handler de roteamento em `agent-network-mcp` para consultar `SELECT * FROM agents WHERE ativo=true` em vez do enum Zod. Cache em memória com invalidação por webhook Supabase (ou polling de 60s — decisão de implementação, não bloqueia a fase).
5. **Só depois de 1 e 4 confirmados** — remover o enum Zod do código-fonte.

**Prova de aceitação:** (a) query `SELECT count(*) FROM agents` retornando 33; (b) inserir um agente de teste via `INSERT` puro (sem deploy) e confirmar que ele responde a uma chamada real na hora seguinte; (c) grep no código confirmando ausência do enum antigo.

---

### FASE 2 — `ToolRegistry` genérico (sem Kubernetes, sem Redis)

**Objetivo:** trazer o padrão de registro plugável do `network-agents-setup`, reimplementado sobre a stack leve atual.

1. Criar `src/core/tool-registry.ts` em `agent-network-mcp` — mesma interface conceitual do protótipo (`registerTool`/`unregisterTool`/`getTool`), mas com persistência na tabela `capabilities` já existente (reaproveitar, não recriar) em vez de estado em memória Redis.
2. Ativar as 38 linhas da tabela `capabilities` hoje com `status != 'ativo'` — decidir por linha: ativar, descartar, ou fundir com outra. Nenhuma linha fica em limbo.
3. Ligar `ToolRegistry` ao roteador da Fase 1: um agente só pode chamar ferramentas listadas no seu `ferramentas_permitidas`.

**Prova de aceitação:** (a) `SELECT count(*) FROM capabilities WHERE status='ativo'` maior que 0 e documentado por que cada uma ficou ativa/inativa; (b) teste real de um agente tentando usar ferramenta fora de sua lista permitida → deve ser recusado, com log do evento.

---

### FASE 3 — Log de sessão append-only

**Objetivo:** trocar "histórico de texto" por trajetória auditável e replayável — a base técnica que resolve a queixa "não sei se você realmente fez".

1. Criar tabela `session_events`:
   ```sql
   CREATE TABLE session_events (
     id bigserial PRIMARY KEY,
     session_id uuid NOT NULL,
     agent_id text REFERENCES agents(id),
     step_type text NOT NULL,   -- 'prompt' | 'reasoning' | 'tool_call' | 'tool_result' | 'verification' | 'final_answer'
     payload jsonb NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   CREATE INDEX ON session_events (session_id, created_at);
   ```
2. Todo passo do loop de execução grava um evento — não só o resultado final. Isso é o que o `network-agents-setup` fazia certo conceitualmente (trajectory log) sem precisar da stack pesada dele.
3. Endpoint simples de leitura (`GET /sessions/:id/trajectory`) que reconstrói a execução completa a partir dos eventos — usável tanto por mim quanto por Luiz para auditar sem ler código.

**Prova de aceitação:** rodar uma tarefa real de ponta a ponta e conseguir reconstruir, evento por evento, todas as decisões tomadas — sem depender de memória de conversa.

---

### FASE 4 — Passo de verificação obrigatório no loop

**Objetivo:** embutir a "norma de verificação" no motor, não deixá-la depender só da minha disciplina em texto.

1. Todo `tool_call` que afirme ter concluído uma ação externa (merge de PR, deploy, escrita em banco) dispara automaticamente uma chamada de confirmação (a mesma API/ferramenta, em modo leitura) antes de gravar `step_type='verification'` como sucesso.
2. Se a verificação falhar ou não for possível, o evento é gravado como `step_type='verification', payload.status='nao_confirmado'` — nunca como sucesso silencioso.
3. Esse é o mecanismo técnico que evita a repetição do caso PR #3.

**Prova de aceitação:** simular uma ação que falha silenciosamente (ex: PR criado mas não merged) e confirmar que o sistema grava `nao_confirmado`, não `sucesso`.

---

### FASE 5 — Ingestão de conhecimento contínua

**Objetivo:** parar de ter uma tabela `knowledge_chunks` com 46 chunks estáticos de julho.

1. Job agendado (GitHub Actions, mesmo padrão do `transcribe.yml` já funcionando) que varre os textos/decisões de Luiz (incluindo `PADROES_ERROS_IA.md` e futuras "diretrizes de ordens") e gera chunks novos automaticamente.
2. Critério do que entra: qualquer decisão registrada em `pendencias_negocio` com `status='concluido'` e qualquer documento de arquitetura commitado vira candidato a chunk.

**Prova de aceitação:** `SELECT count(*), max(created_at) FROM knowledge_chunks` mostrando crescimento real, não um número parado desde julho.

---

### FASE 6 — Empacotamento como núcleo publicável

**Objetivo:** o teste final do princípio "roda para qualquer pessoa" — se o núcleo não sobrevive a virar público, ele não está genérico de verdade.

1. Separar fisicamente, dentro do mesmo repositório ou em repositório próprio: `/core` (tudo das Fases 1–5, zero menção a ViannaLegal/MesaFlow/SST) e `/verticals` (seeds de dados dos projetos de Luiz, carregados via `INSERT`, nunca via import de código).
2. README no padrão de projeto open-source real: o que é, quickstart em 3 comandos, licença (MIT, mesma linha do que já se pratica nos outros repos), sem qualquer menção obrigatória a LRNSdigital para alguém rodar o núcleo puro.
3. Um estranho lendo o repositório pela primeira vez deve conseguir rodar `/core` com um Supabase vazio e nenhum dado vertical, e ter um sistema funcional (vazio de agentes de negócio, mas funcional).

**Prova de aceitação:** clonar o repositório num ambiente limpo (sandbox), rodar sem nenhuma credencial ou dado de LRNSdigital, e confirmar que o roteador, o `ToolRegistry` e o log de sessão funcionam com um agente de teste genérico.

---

## PARTE 4 — O Que Não Fazer (Restrições Explícitas)

- **Não introduzir Kubernetes, Redis, ou Postgres dedicado.** Tudo roda sobre Supabase + Vercel, que já são gratuitos e amplamente replicáveis por qualquer pessoa.
- **Não copiar código do `network-agents-setup`.** Reimplementar os padrões (interface, forma) sobre a stack leve — o código-fonte daquele repositório carrega dependências (Prisma, Redis client) incompatíveis com o objetivo de leveza.
- **Não adicionar módulos aspiracionais** (compliance, simulação organizacional, economia de tokens como sistema separado) enquanto as Fases 0–6 não estiverem com prova de aceitação fechada. Escopo novo só entra depois do núcleo estar sólido, nunca em paralelo.
- **Não declarar nenhuma fase concluída sem a prova de aceitação descrita.** Isso é o próprio objeto da Fase 4 — o motor deve impor isso, mas até a Fase 4 existir, é responsabilidade explícita de quem executa.

---

## PARTE 5 — Sequenciamento e Momento

Este plano fica **aprovado e registrado**, execução **não iniciada** — conforme decisão de Luiz de priorizar o fechamento do vianna-gestao primeiro. Cada fase é desenhada para ser executável isoladamente, em qualquer sessão futura, sem precisar reler todo o histórico — este documento é a memória externa que substitui a dependência de eu lembrar sozinho.

**Ordem recomendada quando o momento chegar:** Fase 0 → 1 → 2 → 3 → 4 → 5 → 6, sem pular etapas. Fases 1–4 são as que resolvem o problema raiz (retrabalho por falta de verificação); Fases 5–6 são consolidação e abertura.
