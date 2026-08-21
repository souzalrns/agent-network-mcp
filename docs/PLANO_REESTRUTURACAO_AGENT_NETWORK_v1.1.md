# Plano de Reestruturação Arquitetural — Agent Network Core (v1.1)

**De rede acoplada a plataforma cognitiva genérica: um núcleo que qualquer pessoa pode rodar.**

> v1.1 — revisão de 21/08/2026. Incorpora avaliação crítica de 4 fontes independentes sobre a v1.0 (`docs/PLANO_REESTRUTURACAO_AGENT_NETWORK.md`, commit `8e0decb`). A v1.0 permanece no histórico como registro do diagnóstico original; este documento a substitui como plano de execução.
>
> Escrito para ser lido por um agente executor (Claude Code ou equivalente) como instrução de trabalho, e por Luiz como registro de decisão. Cada fase tem critério de aceitação verificável e explícito — nada é "concluído" sem prova.

---

## PARTE 0 — O Que Mudou da v1.0 para a v1.1 (e por quê)

| Mudança | Motivo |
|---|---|
| Reordenação de fases: log de eventos e verificação vêm **antes** da migração do enum | Três revisores independentes convergiram: observabilidade deve existir antes de mexer no mecanismo que já funciona. Ataca o problema raiz (retrabalho por falta de verificação) sem esperar a migração de dados terminar. |
| Nova Fase 0.5 — Contrato do Núcleo | Evitar migrar tabelas e descobrir depois que o modelo conceitual ainda estava mudando. |
| `agents` deixa de ser tabela única — vira `agents` + `capabilities` + `agent_capabilities` | Agente ≠ Capacidade. Um agente *executa*; uma capacidade é *algo que pode ser feito*. Modelar como uma coisa só limita o roteador a pensar em "qual agente chamar" em vez de "que capacidade a tarefa exige, quem a possui". |
| Migração do enum para tabela passa a ser **em modo compatível** (coexistência temporária), não substituição imediata | Reduz risco: permite comparar comportamento antigo vs novo antes de remover o que já funciona. |
| Definição de "roda para qualquer pessoa" agora tem dois níveis explícitos (Local Mínimo vs Produção) | A v1.0 prometia "sem nenhuma credencial" na Fase 6 mas dependia de Supabase desde a Fase 1. Contradição real, corrigida. |
| Verificação (Fase 2) exige evidência de **fonte externa**, nunca o mesmo sistema confirmando a si mesmo | Uma segunda chamada ao mesmo lugar que fez a afirmação original não é prova — é eco. |
| `session_events` ganha campos de controle (`sequence_number`, `run_id`, `status`) e política de retenção | Tabela append-only sem esses campos não sustenta replay real nem evita crescimento descontrolado. |
| `ToolRegistry` (agora Fase 5) ganha modelo de segurança explícito | Sem isso, vira "roteador configurável com permissões insuficientes" — pior que o hardcoded atual em um sentido. |
| Ingestão de conhecimento movida para depois do núcleo estar sólido, com critério de qualidade (dedup, estados, teste de recuperação) | "Cresceu" não é critério de sucesso — uma base maior pode ser uma base pior. |
| Fase de publicação dividida em 4 marcos, não 1 | "Isolado", "reproduzível", "operável" e "publicável" são coisas diferentes. Publicar antes de estabilizar é promessa difícil de sustentar. |

---

## PARTE 1 — Estrutura Atual (Diagnóstico Verificado, inalterado da v1.0)

*Confirmado por leitura direta de código e execuções reais em 19–21/08/2026.*

### 1.1 — `agent-network-mcp` (produção)

| Aspecto | Estado real |
|---|---|
| Hospedagem | Vercel (Hobby), repositório público `souzalrns/agent-network-mcp` |
| Definição dos agentes | Enum Zod fixo no código do servidor MCP |
| Roteamento | Hardcoded (switch/if). Sem descoberta dinâmica em runtime |
| Adicionar um agente | Editar enum → deploy → inserir linha manual em `projects` no Supabase |
| Modelo | Gemini Flash Lite (custo zero) |
| Memória/estado | Supabase (`mpsuurqilnhsvbnjmrpm`): `projects`, `project_state`, `transcripts`, `agent_log` |
| Log de execução | `transcripts` — histórico simples, sem replay nem fork |
| Camada de plugin | Inexistente |
| Catálogo de capacidades | Tabela `capabilities` existe (`agent_id`, `nome`, `descricao`, `gatilhos`, `custo_estimado_tokens`, `status`) — **38 linhas, 0 ativas** |
| Ingestão de conhecimento | `knowledge_chunks` — 46 chunks, parado desde julho/2026 |
| Agentes atuais | 33, horizontalizados parcialmente (organização, não motor) |

### 1.2 — `network-agents-setup` (protótipo paralelo, nunca conectado)

Padrões reais e reaproveitáveis: `ToolRegistry` (registro plugável), `agents.config.ts` (agente como dado), `Orchestrator`/`Router`/`Planner`/`Executor` (loop decomposto). Stack incompatível com o objetivo: Kubernetes, Postgres dedicado, Redis. CI verde, mas **zero secrets configurados** — nunca rodou com IA real. Escopo inflado com módulos aspiracionais (`ComplianceManager`, `ImmunologicalMemory`, `TokenEconomy`, `OrganizationalSimulator`). **Decisão mantida: extrair padrão, descartar stack e escopo.**

### 1.3 — O problema raiz (evidência concreta, não opinião)

> "Diagnóstico acontece, ação não é verificada, e o item nunca é fechado nem reaberto formalmente."

- PR #3 do `mesaflow-api` (fix de IDOR) reportado resolvido, confirmado `merged: false` semanas depois.
- Tabela `capabilities`: 38 linhas cadastradas, 0 ativadas — diagnosticado e nunca ativado.
- Vercel `BLOCKED` do vianna-gestao tratado como pendência viva quando já estava resolvido.
- `network-agents-setup` apresentado como "implementado" (tabela P-001 a P-025) sem nunca ter rodado com IA real.

**Padrão comum a todos os quatro casos:** uma afirmação foi feita sem evidência de fonte independente, e nada no sistema forçou a diferença entre "alguém disse que terminou" e "está confirmado que terminou".

---

## PARTE 2 — Estado-Alvo

### 2.1 — Princípio organizador (reformulado)

> **Código define comportamento genérico e componentes executáveis. Dados definem identidade, especialização e configuração.**

| Camada | O que é | Onde vive |
|---|---|---|
| Agente | identidade, prompt, gatilhos, vínculo de projeto | dado |
| Capacidade | algo que *pode* ser feito, com custo e status | dado, mas a *implementação* é código registrado por interface estável |
| Ferramenta genérica | motor de execução, verificação, persistência | código |
| Regra vertical (ViannaLegal, MesaFlow, SST) | prompt e configuração de domínio | dado |

**Correção sobre a v1.0:** "configuração como dado" não significa "qualquer comportamento nasce de um INSERT". Uma capacidade nova ainda exige um componente de código registrado, testado, com permissões — o `INSERT` na tabela é o que a *ativa* para um agente, não o que a *cria do nada*.

### 2.2 — Diagrama revisado

```
┌───────────────────────────────────────────────────────────┐
│  NÚCLEO GENÉRICO — roda para QUALQUER PESSOA                 │
│                                                               │
│  Contrato: Agent · Capability · Tool · Task · Session ·      │
│            Event · Verification · Project                    │
│                                                               │
│  Motor de Capacidades → Roteador → Agentes-Executores          │
│  Log de Sessão (append-only, imutável)                        │
│  Verificação Obrigatória (evidência de fonte externa)          │
└───────────────────────────────────────────────────────────┘
                          ▲  plugam-se como DADO
        ┌─────────────────┼─────────────────┐
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  ViannaLegal   │ │   MesaFlow    │ │  SST Portugal │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Teste de conformidade (mantido, é a melhor parte do documento original):** *"Se eu apagasse todos os dados verticais agora, o núcleo ainda funcionaria e faria sentido para um estranho?"*

### 2.3 — "Roda para qualquer pessoa" — definição corrigida (dois níveis)

| Nível | Dependências | Objetivo | Quando existe |
|---|---|---|---|
| **Local Mínimo** | Nenhuma credencial externa. Armazenamento local (SQLite ou equivalente), modelo simulado (`mock`), agente de teste | Provar que roteamento, registro de capacidade, log de eventos e verificação funcionam sem infraestrutura nenhuma | Definido como contrato desde a Fase 0.5; implementado como modo `dry-run`/local na Fase 7 |
| **Produção** | Supabase + Vercel + provedor de modelo | Executar agentes reais, ações externas reais | Já existe hoje, evolui nas Fases 1–6 |

Isso resolve a contradição da v1.0 sem prometer "zero infraestrutura" onde não é honesto prometer isso.

---

## PARTE 3 — Plano de Execução (v1.1, resequenciado)

> Nenhuma fase introduz Kubernetes, Redis ou Postgres dedicado. Tudo roda sobre Vercel + Supabase, já em produção. Nenhuma fase é "concluída" sem a prova descrita.

### FASE 0 — Congelamento, Inventário e Rollback **Testado**

**Objetivo:** ter retrato exato do estado atual e — diferente da v1.0 — uma prova de que dá para voltar atrás, não só um dump.

1. Exportar o enum Zod atual para `docs/snapshot-pre-refactor/agents-enum.ts`, com data.
2. Dump de schema + contagem de `projects`, `capabilities`, `transcripts` para `docs/snapshot-pre-refactor/supabase-state.md`.
3. Tag git `pre-refactor-v0` no commit atual.
4. **Novo:** documentar o commit exato em produção na Vercel, o procedimento de rollback de deploy (reverter para esse commit), e a lista de variáveis de ambiente/integrações necessárias (nomes, não valores).
5. **Novo:** executar um teste de restauração real — não apenas criar o dump, mas confirmar que ele é suficiente para recriar o estado num ambiente de teste.

**Prova de aceitação:** (a) os artefatos de 1–4 commitados; (b) tag confirmável via API; (c) teste de restauração documentado com resultado (passou/não passou).

---

### FASE 0.5 — Contrato do Núcleo (nova)

**Objetivo:** fixar o modelo conceitual antes de tocar em qualquer tabela.

Definir, em uma página (`docs/CONTRATO_NUCLEO.md`), as entidades e relações:

```
Project → Task → Capability → Agent → Tool → Result → Verification
```

Com a distinção explícita: **Agent** (quem executa) ≠ **Capability** (o que pode ser feito) ≠ **Tool** (o componente de código que implementa a capacidade). Um agente possui um conjunto de capacidades; uma capacidade é implementada por uma ou mais ferramentas.

**Prova de aceitação:** documento de uma página, revisado e aprovado por Luiz antes de qualquer migração de banco começar.

---

### FASE 1 — Log de Sessão Append-Only + Consulta de Trajetória

*(era Fase 3 na v1.0 — adiantada porque dá observabilidade imediata sem depender da migração de agentes.)*

**Objetivo:** parar de depender de memória de conversa para saber o que aconteceu.

1. Criar tabela `session_events`:
   ```sql
   CREATE TABLE session_events (
     id bigserial PRIMARY KEY,
     session_id uuid NOT NULL,
     sequence_number int NOT NULL,
     run_id uuid NOT NULL,
     parent_event_id bigint REFERENCES session_events(id),
     agent_id text,
     step_type text NOT NULL,   -- 'tool_call' | 'decision' | 'verification' | 'final_answer'
     payload jsonb NOT NULL,     -- decisão, ferramenta, parâmetros relevantes, resultado — NUNCA raciocínio interno bruto
     status text NOT NULL,
     duration_ms int,
     created_at timestamptz DEFAULT now()
   );
   CREATE INDEX ON session_events (session_id, sequence_number);
   -- Imutabilidade real, não só de nome:
   REVOKE UPDATE, DELETE ON session_events FROM PUBLIC, authenticated, anon;
   -- Só a role de aplicação tem INSERT; nenhuma role tem UPDATE/DELETE.
   ```
2. Todo passo relevante grava um evento — decisão tomada, ferramenta chamada, resultado, mas **resumo operacional, não cadeia de raciocínio bruta** (evita custo, ruído e exposição desnecessária).
3. `run_id` identifica reexecuções da mesma tarefa; `parent_event_id` permite bifurcações (retry, fork).
4. Endpoint de leitura (`GET /sessions/:id/trajectory`) reconstrói a execução completa a partir dos eventos.
5. Política de retenção: reter 90 dias em tabela quente, arquivar o resto (decisão de onde arquivar fica em aberto — não bloqueia a fase).

**Prova de aceitação:** rodar uma tarefa real de ponta a ponta e reconstruir, evento por evento, todas as decisões — sem depender de memória de conversa; confirmar via `UPDATE`/`DELETE` recusados pelo banco que a imutabilidade é real, não nominal.

---

### FASE 2 — Verificação Obrigatória (a fase mais importante do plano inteiro)

*(era Fase 4 na v1.0 — adiantada, ataca o problema raiz diretamente, antes mesmo da migração de agentes.)*

**Objetivo:** transformar "o agente disse que fez" em "o sistema possui evidência de que foi feito". Este é o antídoto direto para o caso PR #3.

**Modelo de estados (novo, formalizado):**

```
planned → running → completed → verified
                  ↘ failed
                  ↘ not_confirmed
                  ↘ blocked
```

**`completed ≠ verified`.** Uma ação só é `verified` depois de uma checagem por **fonte de evidência externa e específica ao tipo de ação** — nunca o mesmo sistema/canal que fez a ação original confirmando a si mesmo.

| Ação | Evidência exigida (fonte externa) |
|---|---|
| Merge de PR | GitHub API: `merged: true` + `merge_commit_sha` |
| Deploy | Status do deployment na Vercel + URL respondendo 200, verificado em T+30s |
| Escrita no Supabase | `SELECT` posterior confirmando o registro com os valores esperados |
| Agente adicionado | Confirmar que aparece na tabela `agents` **e** responde a uma chamada real |
| Ação sem evidência possível | `not_confirmed` — nunca `success` silencioso |

**Schema do evento de verificação** (registrado em `session_events`, `step_type='verification'`):
```json
{
  "step_type": "verification",
  "action_claimed": "merge_pr",
  "target": "mesaflow-api#3",
  "evidence": {
    "source": "github_api",
    "merged": true,
    "merge_commit_sha": "abc123...",
    "checked_at": "2026-08-21T..."
  },
  "status": "confirmed" | "not_confirmed" | "inconclusive",
  "confidence": 0.95
}
```

**Regra do motor:** cada ferramenta declara, em seu próprio contrato de registro, se possui método de verificação e que tipo de evidência produz. Uma ferramenta sem esse contrato não pode marcar `verified` — só `completed` (que fica visivelmente diferente de `verified` em qualquer consulta).

**Prova de aceitação:** reproduzir o caso PR #3 deliberadamente (ação que "parece" feita mas não é) e confirmar que o sistema grava `not_confirmed`, nunca `verified`. Este teste é o critério de sucesso de todo o plano — se ele passar, o problema raiz está resolvido, mesmo antes de qualquer outra fase.

---

### FASE 3 — Tabela `agents` em Modo Compatível

*(era Fase 1 na v1.0 — agora vem depois de observabilidade e verificação existirem, e é explicitamente uma migração **gradual**, não uma substituição imediata.)*

**Objetivo:** matar o enum Zod — mas só depois de comparar comportamento, não antes.

1. Criar as três tabelas (modelo relacional, não arrays — correção da v1.0):
   ```sql
   CREATE TABLE agents (
     id text PRIMARY KEY,
     nome text NOT NULL,
     layer text NOT NULL,
     descricao text NOT NULL,
     system_prompt text NOT NULL,
     modelo text DEFAULT 'gemini-flash-lite',
     status text NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'disabled'
     config_version int NOT NULL DEFAULT 1,
     is_vertical boolean DEFAULT false,
     created_by text,
     updated_by text,
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );

   CREATE TABLE agent_projects (   -- substitui projeto_vinculado text solto
     agent_id text REFERENCES agents(id),
     project_slug text NOT NULL,
     PRIMARY KEY (agent_id, project_slug)
   );

   CREATE TABLE agent_capabilities (  -- join, substitui ferramentas_permitidas text[]
     agent_id text REFERENCES agents(id),
     capability_id text REFERENCES capabilities(id),
     permitido boolean DEFAULT true,
     configuracao jsonb,
     PRIMARY KEY (agent_id, capability_id)
   );
   ```
2. Migrar os 33 agentes para `agents` com `status='active'`, mantendo o enum Zod **funcionando em paralelo** — o roteador consulta a tabela nova, mas o enum antigo continua existindo como fallback.
3. Rodar os dois caminhos lado a lado por um período determinado (ex: 1 semana de uso real), comparando decisões de roteamento.
4. **Só depois da comparação sem divergência relevante** — remover o enum Zod do código-fonte.

**Prova de aceitação:** (a) `SELECT count(*) FROM agents WHERE status='active'` = 33; (b) inserir agente de teste via `INSERT` puro e confirmar resposta real na próxima chamada, **dentro de um limite máximo definido (ex: 60s)**, sem novo deploy; (c) log comparativo do período de coexistência sem divergência; (d) grep confirmando ausência do enum antigo **só após** (c).

---

### FASE 4 — Migração Gradual e Remoção Definitiva do Enum

Formalizada como fase própria (estava implícita no passo 5 da Fase 1 da v1.0). Existe para deixar explícito que remover o enum é uma decisão separada, tomada com dados do período de coexistência, não um passo automático.

**Prova de aceitação:** relatório do período de coexistência anexado ao commit que remove o enum.

---

### FASE 5 — `ToolRegistry` com Modelo de Segurança

*(era Fase 2 na v1.0.)*

**Objetivo:** trazer o padrão de registro plugável do `network-agents-setup`, sobre a stack leve, **com fronteira de segurança explícita** — sem isso, vira roteador configurável permissivo demais.

1. `src/core/tool-registry.ts` — interface `registerTool`/`unregisterTool`/`getTool`, persistência na tabela `capabilities` (reaproveitada).
2. Ativar as 38 capacidades **em lotes de 5–10**, com teste real de cada lote antes do próximo — não tudo de uma vez (catálogo inflado degrada seleção de ferramenta, mesmo problema que afeta modelos com muitas tools carregadas).
3. Modelo de segurança obrigatório por capacidade:
   - autorização por agente **e** por projeto (via `agent_capabilities`);
   - validação de argumentos antes da chamada;
   - separação explícita leitura vs escrita;
   - confirmação humana para ações destrutivas ou irreversíveis;
   - limites de tempo, custo e número de chamadas por sessão;
   - idempotência para operações repetíveis;
   - registro em `session_events` de quem (agente/sessão) autorizou cada chamada.

**Prova de aceitação:** (a) capacidades ativas documentadas por lote, com justificativa; (b) teste de agente tentando usar ferramenta fora de sua lista → recusado e registrado; (c) teste de ação destrutiva sem confirmação humana → bloqueada.

---

### FASE 6 — Ingestão de Conhecimento Controlada

*(era Fase 5 na v1.0 — movida para depois do núcleo estar sólido, com critério de qualidade.)*

1. Job agendado (padrão `transcribe.yml`) que gera chunks candidatos a partir de decisões `concluído` em `pendencias_negocio` e documentos de arquitetura commitados.
2. Cada chunk carrega: hash do conteúdo (dedup), origem, versão, estado (`candidate` → `approved` → `deprecated`).
3. Nenhum chunk `candidate` é usado em produção sem revisão para `approved`.
4. Teste de recuperação com perguntas conhecidas antes de considerar a fase madura.
5. Scrubbing de segredos/dados pessoais antes da ingestão.

**Prova de aceitação:** não é só `count(*)` crescendo — é uma pergunta de teste conhecida recuperando o chunk correto, e uma decisão obsoleta **não** aparecendo mais como vigente após ser marcada `deprecated`.

---

### FASE 7 — Empacotamento (quatro marcos, não um)

*(era Fase 6 na v1.0, agora dividida — publicar não é o mesmo que desacoplar.)*

| Marco | Resultado | Prova de aceitação |
|---|---|---|
| **Núcleo isolado** | Zero menção a ViannaLegal/MesaFlow/SST em `/core` | CI falha se `/core` importar qualquer coisa de `/verticals` |
| **Núcleo reproduzível** | Modo Local Mínimo funcional (SQLite, modelo `mock`, agente de teste) | Roda em sandbox limpo, sem nenhuma credencial, roteamento+capacidade+evento+verificação funcionando |
| **Núcleo operável** | Migração, logs, verificação e rollback testados em conjunto | Simulação de falha (Fase 0) executada contra o núcleo novo, não só o antigo |
| **Núcleo publicável** | README, licença MIT, exemplos, testes, documentação pública | Estranho em sandbox consegue seguir o quickstart sem ajuda |

Nome do núcleo publicável fica em aberto — decisão separada, não bloqueia a fase técnica.

---

## PARTE 4 — O Que Não Fazer (Restrições, mantidas e reforçadas)

- Não introduzir Kubernetes, Redis, ou Postgres dedicado.
- Não copiar código do `network-agents-setup` — reimplementar o padrão sobre a stack leve.
- Não adicionar módulos aspiracionais (compliance, simulação organizacional, economia de tokens como sistema) antes das Fases 0–4 fechadas com prova.
- Não declarar fase concluída sem a prova descrita.
- **Novo:** não tratar `completed` como sinônimo de `verified` em nenhuma consulta, relatório ou conversa — a distinção é o núcleo do que este plano resolve.
- **Novo:** não remover o enum Zod (Fase 3→4) sem o período de coexistência documentado.
- **Novo:** não ativar mais de um lote de capacidades por vez sem teste do lote anterior.

---

## PARTE 5 — Sequenciamento e Momento

**Plano aprovado, execução não iniciada** — vianna-gestao continua prioridade.

**Quando começar, a primeira sessão cobre apenas Fase 0 + Fase 0.5 + Fase 1 (log de eventos).** Isso é intencionalmente menor que a Fase 0+1 originalmente proposta — não toca no roteamento, não migra nada arriscado, e já entrega observabilidade real.

**Teste de sucesso do primeiro ciclo (Fases 0–2), antes de prosseguir para qualquer migração de dados:** reproduzir deliberadamente um caso do tipo PR #3 — uma ação que parece concluída mas não é — e confirmar que o sistema grava `not_confirmed`, nunca `verified`, de forma automática. Se esse teste passar, o problema raiz que motivou todo este documento está resolvido, independentemente de quanto das Fases 3–7 ainda restar.
