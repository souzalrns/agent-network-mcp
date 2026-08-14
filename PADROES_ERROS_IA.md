# Padrões de Erros Recorrentes — Código/Trabalho Gerado por IA

Registo vivo de erros reais já cometidos (por Claude) e apanhados nos projetos da LRNSdigital. Objetivo: revisões futuras serem mais rápidas porque já se sabe exatamente o que procurar — não é teoria, é histórico real.

**Como usar:** antes de aprovar qualquer PR/mudança gerada por IA, verificar se algum destes padrões se repete. Adicionar entrada nova sempre que um erro novo for identificado e corrigido.

---

## Segurança de dados

### 1. RLS ausente ou incompleta em tabela nova
- **O que aconteceu:** políticas de Row Level Security no Supabase criadas só com `USING` (o que se vê), sem `WITH CHECK` (o que se pode escrever) — permite alterar qualquer coluna desde que se consiga ver a linha.
- **Outros bugs da mesma família:** política sem `TO authenticated` explícito aplica-se também a `anon`; políticas com JOIN a tabelas relacionadas podem ser contornadas.
- **Verificação rápida:** `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='public';` — todas devem ter `rowsecurity = true`. Toda política de escrita precisa de `USING` E `WITH CHECK` juntos.

### 2. IDOR — endpoint que confia só no ID, não no dono do recurso
- **O que aconteceu:** MesaFlow (reservas) tinha endpoints que consultavam por ID sem confirmar que o recurso pertencia ao utilizador autenticado.
- **Verificação rápida:** todo endpoint que recebe um ID de recurso (reserva, processo, pedido) deve escopar a query pelo dono, não só pelo ID.

### 3. Credenciais/segredos hardcoded em vez de variável de ambiente
- **Verificação rápida:** correr Gitleaks sobre o histórico completo antes de assumir que "nunca aconteceu".

---

## Onboarding de infraestrutura

### 4. Agente novo sem linha correspondente na tabela `projects`
- **O que aconteceu:** aconteceu pelo menos DUAS vezes — primeiro com 26 de 28 agentes, depois de "corrigido", os 3 agentes horizontais mais recentes (`comunicacoes-atendimento`, `marketing`, `produto-tech-transversal`) voltaram a ficar sem linha. Causa falha silenciosa de foreign key em `save_project_state`.
- **Verificação rápida:** `SELECT p.id FROM projects p RIGHT JOIN (SELECT DISTINCT agent_id FROM knowledge_chunks) k ON p.id=k.agent_id WHERE p.id IS NULL` (ou comparar `lib/agents.js` contra a tabela `projects` diretamente) sempre que um agente novo for criado.

### 5. Formulário de contacto configurado para a plataforma errada
- **O que aconteceu:** site no Vercel usando `data-netlify="true"` (Netlify Forms) — nunca enviou um único email, silenciosamente, sem erro visível.
- **Verificação rápida:** confirmar que o mecanismo de submissão do formulário corresponde à plataforma de deploy real.

---

## Honestidade sobre dados/estado

### 6. Apresentar relatório antigo como estado atual
- **O que aconteceu:** `tool_scan_reports` (auditoria de 31/07 e 01/08) apresentado como "27 vulnerabilidades abertas agora" — verificação ao vivo mostrou só 2 ainda abertas.
- **Regra:** relatórios agendados são fotografias de um momento passado. Cruzar sempre com a fonte viva (ex: API do GitHub Dependabot) antes de reportar como problema atual.

### 7. Estimar tempo decorrido "de cabeça"
- **O que aconteceu:** disse "20 minutos" quando uma tarefa estava presa há 8 horas.
- **Regra:** para qualquer processo assíncrono, consultar sempre o timestamp real (`created_at`/`started_at`) e calcular a diferença — nunca estimar por sensação de quantas mensagens passaram.

### 8. Afirmar um número sem verificar
- **O que aconteceu:** README do agent-network-mcp escrito com "32 agentes" de memória — contagem real revelou 33 no código (e só 31 na tabela `projects`, ver item 4).
- **Regra:** qualquer número que vá para um documento público (README, portfólio) deve ser contado/consultado na fonte real no momento de escrever, nunca reutilizado de memória de uma conversa anterior.

---

## Infraestrutura/CI

### 9. Mudança de versão major quebra CI silenciosamente
- **O que aconteceu:** upgrade do Prisma para v7 mudou configuração de datasource (`prisma.config.ts` necessário, campo `url` removido do `schema.prisma`) — CI ficou partido desde 9 de julho sem ninguém notar até ser investigado ativamente.
- **Regra:** após qualquer upgrade de dependência major, confirmar que o CI corre verde antes de considerar a tarefa terminada — não assumir que "instalou sem erro" = "funciona".

---

*Última atualização: 13/08/2026. Adicionar entradas novas sempre que um padrão de erro real for identificado e corrigido — não é checklist teórica, é histórico vivo.*
