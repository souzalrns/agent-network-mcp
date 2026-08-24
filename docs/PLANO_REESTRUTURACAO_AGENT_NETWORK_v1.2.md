# Plano de Reestruturação Arquitetural — Agent Network Core (v1.2)

**De rede acoplada a plataforma cognitiva genérica: um núcleo que qualquer pessoa pode rodar.**

> v1.2 — 21/08/2026. Corrige 7 problemas encontrados em autorrevisão da v1.1 (a mesma fonte revisando o próprio trabalho — não é validação independente, é um segundo olhar). Muda o modelo de garantia da Fase de verificação: de "o motor impede o erro" para **"registro oportunístico (C) + auditoria retroativa independente (D)"** — mudança de escopo, não só de detalhe. v1.1 permanece no histórico.

---

## PARTE 0 — O Que Mudou da v1.1 para a v1.2

| # | Problema encontrado na v1.1 | Correção na v1.2 |
|---|---|---|
| 1 | Verificação vivia só dentro do MCP server — mas o caso PR #3 aconteceu **fora** dele (numa conversa, via curl direto). O plano prometia resolver o problema raiz sem cobrir onde ele realmente ocorre. | Escopo corrigido: **C** (`registrar_acao`, ferramenta de baixa fricção chamável de qualquer canal) para cobertura em tempo real onde há disciplina de registrar; **D** (auditor retroativo, job agendado) como rede de segurança para onde a disciplina falha — que é exatamente onde os 4 casos do diagnóstico aconteceram. |
| 2 | Fase 0 mandava criar um segundo projeto Supabase — mas os 2 slots gratuitos da organização já estão ocupados (`vianna-gestao`, `agent-network-memory`). Instrução inexecutável como escrita. | Isolamento passa a usar uma **segunda organização** Supabase (gratuita, sem limite conhecido de organizações por conta) para o projeto de teste. |
| 3 | `REVOKE UPDATE, DELETE` não garante imutabilidade — `service_role` e o dono da tabela ignoram essa restrição. Além disso, contradizia a política de retenção (que exige apagar/arquivar). | Trigger `BEFORE UPDATE OR DELETE` que recusa a operação para qualquer role, com uma função `security definer` própria e auditada como única via de arquivamento — a exceção fica explícita, não invisível. |
| 4 | Conflitos reais no modelo de dados: `capabilities.agent_id` (1:1) preexistente nunca removido ao introduzir `agent_capabilities` (N:N); `gatilhos` citado na Parte 2 mas ausente do DDL; `model_providers` referenciado no addendum mas nunca criado em fase nenhuma. | Modelo de dados unificado nesta versão (Fase 4), com passo explícito de migração de `capabilities.agent_id` e criação de `model_providers` na mesma fase da tabela `agents`. |
| 5 | Fase 4 da v1.1 ("Migração Gradual e Remoção do Enum") não adicionava trabalho novo — duplicava o que a Fase 3 já fazia. | Fundida de volta na fase de migração da tabela `agents` (agora Fase 4 única). |
| 6 | Nada definia o que acontece depois de um evento `not_confirmed` — um achado sem dono é um limbo novo com nome melhor, repetindo o problema original. | `not_confirmed` (de C ou de D) dispara automaticamente um `INSERT` em `pendencias_negocio` com `status='pendente'` — fechamento do ciclo é estrutural, não depende de alguém lembrar de agir. |
| 7 | Over-engineering residual: `parent_event_id` sem uso definido, `confidence` numérico sem fonte, `config_version`/`created_by`/`updated_by` desnecessários para operador solo, `agent_projects` como tabela de junção quando um agente pertence no máximo a um projeto. | Removidos ou simplificados (`projeto_slug` como coluna única em `agents`, sem tabela de junção). |

---

## PARTE 1 — Estrutura Atual (Diagnóstico Verificado, inalterado)

*Confirmado por leitura direta de código e execuções reais em 19–21/08/2026.*

### 1.1 — `agent-network-mcp` (produção)

| Aspecto | Estado real |
|---|---|
| Hospedagem | Vercel (Hobby), repositório público `souzalrns/agent-network-mcp` |
| Definição dos agentes | Enum Zod fixo no código do servidor MCP |
| Roteamento | Hardcoded (switch/if). Sem descoberta dinâmica em runtime |
| Modelo | Gemini Flash Lite (custo zero) |
| Memória/estado | Supabase (`mpsuurqilnhsvbnjmrpm`): `projects`, `project_state`, `transcripts`, `agent_log`, `capabilities` (38 linhas, 0 ativas), `knowledge_chunks` (46 chunks, parado desde julho) |
| Log de execução | `transcripts` — histórico simples, sem replay |
| Camada de plugin | Inexistente |

### 1.2 — `network-agents-setup` (protótipo paralelo, nunca conectado)

Padrões reaproveitáveis: `ToolRegistry`, `agents.config.ts` (agente como dado), `Orchestrator`/`Router`/`Planner`/`Executor`. Stack incompatível: Kubernetes, Postgres dedicado, Redis. CI verde mas zero secrets — nunca rodou com IA real. Escopo inflado (`ComplianceManager`, `ImmunologicalMemory`, `TokenEconomy`, `OrganizationalSimulator`). **Extrair padrão, descartar stack e escopo.**

### 1.3 — Onde as ações realmente acontecem (correção de escopo desta versão)

O problema raiz não vive num único lugar — vive em **cinco canais**: esta conversa (chamadas diretas via bash/API), sessões de Claude Code no terminal, o `agent-network-mcp` em si, GitHub Actions, e a VM `bridge-worker`. Dos quatro casos de evidência do diagnóstico original:

| Caso | Canal onde ocorreu |
|---|---|
| PR #3 não mesclado, reportado como resolvido | Esta conversa (curl direto à API do GitHub) |
| `capabilities` cadastradas, nunca ativadas | Sessão anterior não especificada |
| Vercel `BLOCKED` tratado como pendência viva já resolvida | Memória de conversa desatualizada |
| `network-agents-setup` apresentado como implementado | Sessão de Claude Code |

**Nenhum dos quatro passou pelo `agent-network-mcp`.** Um mecanismo de verificação construído só dentro do servidor MCP não teria pego nenhum dos quatro casos que motivaram este plano. Essa é a correção central da v1.2.

---

## PARTE 2 — Estado-Alvo

### 2.1 — Princípio organizador

> **Código define comportamento genérico e componentes executáveis. Dados definem identidade, especialização e configuração.**

| Camada | O que é | Onde vive |
|---|---|---|
| Agente | identidade, prompt, gatilhos, projeto vinculado | dado |
| Capacidade | algo que *pode* ser feito, com custo e status | dado; implementação é código registrado |
| Ferramenta genérica | motor de execução, registro, verificação | código |
| Regra vertical | prompt e configuração de domínio | dado |

"Configuração como dado" não significa que qualquer comportamento nasce de um `INSERT` — uma capacidade nova ainda exige componente de código testado; o `INSERT` a *ativa* para um agente, não a *cria do nada*.

### 2.2 — "Roda para qualquer pessoa" (dois níveis, mantido da v1.1)

| Nível | Dependências | Objetivo |
|---|---|---|
| **Local Mínimo** | Nenhuma credencial externa (SQLite, modelo `mock`) | Provar que roteamento, capacidade, evento e verificação funcionam sem infraestrutura |
| **Produção** | Supabase + Vercel + provedor de modelo | Executar agentes e ações reais |

### 2.3 — O que a verificação garante, dito com precisão (correção central desta versão)

A v1.1 implicava que o motor, sozinho, tornaria impossível repetir o caso PR #3. Isso não é verdade para ações fora do MCP server — e a maioria das ações de Luiz/Claude acontece fora dele. A garantia real é:

> **Registro oportunístico em tempo real (C)** onde alguém — humano ou agente — lembra de chamar `registrar_acao`, **mais auditoria retroativa independente (D)** que revalida evidência de tudo que foi declarado concluído, com detecção em até 24 horas (ciclo do job agendado), não em tempo real.

Isso é honesto sobre o que o plano entrega: não elimina a possibilidade de uma afirmação falsa por alguns instantes ou horas — elimina a possibilidade de ela **permanecer não detectada indefinidamente**, que é o que de fato aconteceu nos quatro casos.

---

## PARTE 3 — Plano de Execução (v1.2)

> Nenhuma fase introduz Kubernetes, Redis ou Postgres dedicado. Nenhuma fase é concluída sem a prova descrita.

### FASE 0 — Congelamento, Inventário e Rollback Testado

1. Exportar o enum Zod atual para `docs/snapshot-pre-refactor/agents-enum.ts`, com data.
2. Dump de schema + contagem de `projects`, `capabilities`, `transcripts` para `docs/snapshot-pre-refactor/supabase-state.md`.
3. Tag git `pre-refactor-v0` no commit atual.
4. Documentar o commit exato em produção na Vercel, procedimento de rollback de deploy, e lista de variáveis de ambiente/integrações (nomes, não valores).
5. Executar teste de restauração real, não só criar o dump.

**Isolamento (corrigido nesta versão):** os 2 slots de projeto Supabase gratuitos da organização atual já estão ocupados (`vianna-gestao`, `agent-network-memory`). Criar uma **segunda organização** Supabase (gratuita) e o projeto de teste lá — não um terceiro projeto na organização atual, que não é possível no free tier.

**Prova de aceitação:** (a) artefatos de 1–4 commitados; (b) tag confirmável via API; (c) teste de restauração documentado com resultado; (d) segunda organização e projeto de teste confirmados ativos, sem custo.

---

### FASE 0.5 — Contrato do Núcleo

Definir, em uma página (`docs/CONTRATO_NUCLEO.md`), as entidades e relações:

```
Project → Task → Capability → Agent → Tool → Result → Verification
                                              ↳ ModelProvider
```

Distinção explícita: **Agent** (quem executa) ≠ **Capability** (o que pode ser feito) ≠ **Tool** (componente de código). **ModelProvider** (novo nesta versão) é a entidade que resolve qual IA executa cada agente — ver Fase 4.

**Prova de aceitação:** documento de uma página, aprovado por Luiz antes de qualquer migração de banco.

---

### FASE 1 — Log de Sessão Append-Only + Consulta de Trajetória

1. Criar tabela `session_events`, com campos essenciais apenas (itens especulativos removidos nesta versão — ver Parte 0, item 7):
   ```sql
   CREATE TABLE session_events (
     id bigserial PRIMARY KEY,
     session_id uuid NOT NULL,
     sequence_number int NOT NULL,
     run_id uuid NOT NULL,
     agent_id text,
     canal text NOT NULL,       -- 'conversa' | 'claude_code' | 'mcp_server' | 'github_actions' | 'vm'
     step_type text NOT NULL,   -- 'tool_call' | 'decision' | 'verification' | 'final_answer'
     payload jsonb NOT NULL,    -- resumo operacional; NUNCA raciocínio interno bruto
     status text NOT NULL,
     duration_ms int,
     created_at timestamptz DEFAULT now()
   );
   CREATE INDEX ON session_events (session_id, sequence_number);
   ```
2. **Imutabilidade real (corrigida nesta versão):**
   ```sql
   CREATE OR REPLACE FUNCTION bloquear_alteracao_evento()
   RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'session_events é append-only: % não permitido', TG_OP;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   CREATE TRIGGER trg_bloquear_update_delete
     BEFORE UPDATE OR DELETE ON session_events
     FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_evento();
   ```
   Bloqueia qualquer role, incluindo `service_role` e o dono da tabela — a checagem está no gatilho, não no privilégio de acesso.
3. **Arquivamento (reconciliado com a imutabilidade):** uma função própria `arquivar_eventos_antigos()`, também `SECURITY DEFINER`, é a **única** via autorizada a mover eventos com mais de 90 dias para uma tabela `session_events_archive` (que não tem a mesma trigger) antes de removê-los da tabela quente — via `DELETE` explicitamente liberado *dentro dessa função*, nunca por acesso direto de aplicação.
4. `run_id` identifica reexecuções da mesma tarefa (campo `parent_event_id` da v1.1 removido — sem uso definido nesta fase).
5. Endpoint de leitura (`GET /sessions/:id/trajectory`) reconstrói a execução a partir dos eventos.

**Prova de aceitação:** (a) rodar uma tarefa real e reconstruir a trajetória sem depender de memória de conversa; (b) tentativa direta de `UPDATE`/`DELETE` fora da função de arquivamento é recusada pelo banco, testada contra `service_role`; (c) `arquivar_eventos_antigos()` move e remove corretamente eventos de teste com data forçada.

---

### FASE 2 — Registro Oportunístico (C) + Verificação com Evidência Externa

**Objetivo, dito com precisão:** dar a qualquer canal — esta conversa, Claude Code, GitHub Actions, VM — uma forma **de baixíssima fricção** de registrar uma ação e sua evidência, e nunca deixar completed passar por verified sem checagem externa.

1. Ferramenta `registrar_acao`, exposta como MCP tool consumível de qualquer canal (inclusive por mim, nesta conversa), com o mínimo de parâmetros obrigatórios possível:
   ```
   registrar_acao(acao_afirmada, alvo, fonte_evidencia?) 
   ```
   Se `fonte_evidencia` não for informada, o registro já entra como `not_confirmed` — nunca `verified` por omissão.
2. Modelo de estados:
   ```
   planned → running → completed → verified
                     ↘ failed
                     ↘ not_confirmed
                     ↘ blocked
   ```
   `completed ≠ verified`. Só vira `verified` com evidência de fonte externa e específica ao tipo de ação:

   | Ação | Evidência exigida |
   |---|---|
   | Merge de PR | GitHub API: `merged: true` + `merge_commit_sha` |
   | Deploy | Status do deployment na Vercel + URL respondendo 200 em T+30s |
   | Escrita no Supabase | `SELECT` posterior confirmando valores esperados |
   | Ativação de capacidade | Linha em `capabilities` com `status='ativo'` **e** teste real de uso pelo agente |
   | Sem evidência possível | `not_confirmed` — nunca `success` silencioso |

3. **Fechamento do ciclo (novo nesta versão, corrige o item 6 da autorrevisão):** todo evento gravado como `not_confirmed` dispara automaticamente um `INSERT` em `pendencias_negocio` (`status='pendente'`, `tipo='bloqueio_externo'`, referência ao `session_events.id`). Um achado sem dono deixa de ser possível por construção — não depende de alguém lembrar de agir sobre ele.
4. Schema do evento de verificação (sem o campo `confidence` da v1.1 — número sem fonte definida, removido):
   ```json
   {
     "step_type": "verification",
     "action_claimed": "merge_pr",
     "target": "mesaflow-api#3",
     "evidence": { "source": "github_api", "merged": true, "merge_commit_sha": "abc123...", "checked_at": "2026-08-21T..." },
     "status": "confirmed" | "not_confirmed" | "inconclusive"
   }
   ```

**Prova de aceitação:** (a) reproduzir o caso PR #3 chamando `registrar_acao` sem evidência real → grava `not_confirmed` → pendência criada automaticamente, verificável por `SELECT`; (b) confirmar que isso funciona chamado desta conversa **e** de uma sessão de Claude Code, não só de dentro do `agent-network-mcp`.

---

### FASE 3 — Auditor Retroativo (D) — fase própria

**Objetivo:** a rede de segurança que funciona mesmo quando ninguém chama `registrar_acao` — que é exatamente onde os 4 casos do diagnóstico aconteceram.

1. Job agendado (GitHub Actions, mesmo padrão de custo zero do `transcribe.yml`), rodando diariamente, focado nos quatro tipos de afirmação que já geraram problema real:
   - **PRs abertos declarados "resolvidos" em qualquer registro** (`pendencias_negocio`, `session_events`) → reconsulta a API do GitHub, confirma `merged`.
   - **Deploys** referenciados como concluídos → reconsulta status real na Vercel.
   - **Capacidades** com `status='ativo'` → confirma que pelo menos um agente as usou nos últimos N dias; capacidades "ativas" nunca usadas são sinalizadas.
   - **Itens `status='concluido'` em `pendencias_negocio`** → reconfirma a evidência original ainda é válida (ex: link de PR realmente mergeado, não só marcado).
2. Divergência encontrada → `INSERT` em `pendencias_negocio` (nova pendência, não reabre a antiga — preserva histórico) com o achado e a fonte da divergência.
3. **Expectativa explícita (correção desta versão):** este é detecção em até 24 horas (ciclo do job), não em tempo real. Isso é dito claramente em qualquer lugar que descreva a garantia do sistema.

**Prova de aceitação:** rodar o auditor contra um estado de teste com uma divergência plantada deliberadamente (ex: pendência marcada `concluido` com PR na verdade aberto) e confirmar que ele a encontra e registra dentro de uma execução do job.

---

### FASE 4 — Tabela `agents` em Modo Compatível (migração completa, unificada)

*(funde as antigas Fases 3 e 4 da v1.1 — a divisão não acrescentava trabalho real.)*

1. Criar as tabelas, com os conflitos da v1.1 corrigidos:
   ```sql
   CREATE TABLE agents (
     id text PRIMARY KEY,
     nome text NOT NULL,
     layer text NOT NULL,
     descricao text NOT NULL,
     system_prompt text NOT NULL,
     gatilhos text[],              -- corrige omissão da v1.1
     projeto_slug text,            -- coluna única; NULL se genérico (substitui a tabela de junção agent_projects)
     status text NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'disabled'
     is_vertical boolean DEFAULT false,
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );

   CREATE TABLE model_providers (   -- criada aqui, não apenas referenciada (corrige dessincronia com o addendum)
     id text PRIMARY KEY,
     provider text NOT NULL,
     api_mode text NOT NULL,
     base_url text,
     credential_ref text,
     ativo boolean DEFAULT true
   );

   ALTER TABLE agents ADD COLUMN modelo_provider_id text REFERENCES model_providers(id);

   CREATE TABLE agent_capabilities (
     agent_id text REFERENCES agents(id),
     capability_id text REFERENCES capabilities(id),
     permitido boolean DEFAULT true,
     configuracao jsonb,
     PRIMARY KEY (agent_id, capability_id)
   );
   ```
2. **Migrar `capabilities.agent_id` (corrige o conflito 1:1 vs N:N da v1.1):** para cada linha existente com `agent_id` preenchido, inserir a linha correspondente em `agent_capabilities`; depois `ALTER TABLE capabilities DROP COLUMN agent_id`. A coluna antiga não convive com a nova relação — remover é parte obrigatória da migração, não opcional.
3. Migrar os 33 agentes para `agents` com `status='active'`, mantendo o enum Zod **funcionando em paralelo**.
4. Rodar os dois caminhos lado a lado por um período determinado (ex: 1 semana), comparando decisões de roteamento.
5. Só depois da comparação sem divergência relevante — remover o enum Zod do código-fonte.

**Prova de aceitação:** (a) `SELECT count(*) FROM agents WHERE status='active'` = 33; (b) `SELECT count(*) FROM capabilities WHERE agent_id IS NOT NULL` (coluna removida — a query falhar confirma a migração); (c) inserir agente de teste via `INSERT` puro, resposta real na próxima chamada em até 60s, sem deploy; (d) log comparativo do período de coexistência sem divergência; (e) grep confirmando ausência do enum antigo só após (d).

---

### FASE 5 — `ToolRegistry` com Modelo de Segurança

1. `src/core/tool-registry.ts` — `registerTool`/`unregisterTool`/`getTool`, persistência em `capabilities`.
2. Ativar as 38 capacidades em lotes de 5–10, com teste real de cada lote antes do próximo.
3. Modelo de segurança obrigatório: autorização por agente e projeto (via `agent_capabilities`), validação de argumentos, separação leitura/escrita, confirmação humana para ações destrutivas, limites de tempo/custo/chamadas, idempotência, registro em `session_events` de quem autorizou.

**Prova de aceitação:** (a) capacidades ativas documentadas por lote; (b) agente tentando ferramenta fora de sua lista → recusado e registrado; (c) ação destrutiva sem confirmação humana → bloqueada.

---

### FASE 6 — Ingestão de Conhecimento Controlada

1. Job agendado gera chunks candidatos a partir de `pendencias_negocio` (`status='concluido'`, agora só após confirmação do Auditor na Fase 3) e documentos de arquitetura commitados.
2. Cada chunk: hash (dedup), origem, versão, estado (`candidate` → `approved` → `deprecated`).
3. Nenhum chunk `candidate` é usado em produção sem revisão para `approved`.
4. Teste de recuperação com perguntas conhecidas.
5. Scrubbing de segredos/dados pessoais antes da ingestão.

**Prova de aceitação:** pergunta de teste conhecida recuperando o chunk correto; decisão obsoleta não aparece mais como vigente após `deprecated`.

---

### FASE 7 — Empacotamento (quatro marcos)

| Marco | Resultado | Prova de aceitação |
|---|---|---|
| Núcleo isolado | Zero menção a projetos verticais em `/core` | CI falha se `/core` importar de `/verticals` |
| Núcleo reproduzível | Modo Local Mínimo funcional | Roda em sandbox limpo, sem credencial |
| Núcleo operável | Migração, logs, verificação, rollback e auditor testados juntos | Simulação de falha (Fase 0) contra o núcleo novo |
| Núcleo publicável | README, MIT, exemplos, testes | Estranho em sandbox segue o quickstart sem ajuda |

---

## PARTE 4 — O Que Não Fazer

- Não introduzir Kubernetes, Redis, ou Postgres dedicado.
- Não copiar código do `network-agents-setup`.
- Não adicionar módulos aspiracionais antes das Fases 0–4 fechadas com prova.
- Não tratar `completed` como sinônimo de `verified`.
- Não remover o enum Zod sem o período de coexistência documentado.
- Não ativar mais de um lote de capacidades por vez sem teste do lote anterior.
- **Novo:** não descrever a Fase 2 como prevenção em tempo real de afirmações falsas fora do MCP server — é registro oportunístico. A garantia de fundo é o Auditor (Fase 3), com janela de até 24h.
- **Novo:** não deixar um evento `not_confirmed` sem a pendência correspondente criada automaticamente.

---

## PARTE 5 — Sequenciamento e Momento

**Plano aprovado, execução não iniciada** — vianna-gestao continua prioridade.

**Primeira sessão, quando começar:** Fase 0 → 0.5 → 1 (log de eventos, sem tocar roteamento).

**Segunda sessão:** Fase 2 (registro oportunístico) + Fase 3 (auditor). Estas duas juntas são o núcleo real da proposta — entregam a garantia completa (tempo real onde há disciplina, retroativa onde não há) antes de qualquer migração de dados arriscada começar.

**Teste de sucesso do ciclo 0–3, antes de prosseguir para a Fase 4:** plantar deliberadamente um caso do tipo PR #3 — via `registrar_acao` sem evidência **e**, separadamente, sem chamar `registrar_acao` nenhuma — e confirmar que o primeiro caso gera `not_confirmed` imediato e o segundo é pego pelo Auditor dentro de um ciclo do job. Se os dois caminhos funcionarem, o problema raiz está coberto na medida do que é honesto prometer — o resto do plano (Fases 4–7) é consolidação, não mais o antídoto em si.
