// S20 (network-agents-setup, decisão do maestro 2026-10-25): a execução remota via
// bridge-worker está DESLIGADA. A chave SSH da VM Oracle perdeu-se e não há capacidade
// na Oracle para outro servidor, por isso ninguém apanha a fila `code_tasks`. Falhar
// fechado: o dispatch_code_task não cria tarefas que nunca correriam. Só volta a aceitar
// trabalho com CODE_TASKS_ENABLED=1, quando existir um executor novo (decisão à parte).
export const CODE_TASKS_DISABLED_MESSAGE =
  "Execução remota indisponível: o bridge-worker foi desligado (S20: a chave SSH da VM " +
  "perdeu-se e não há capacidade na Oracle para outro servidor). Nenhuma tarefa foi criada. " +
  "Faz a tarefa numa sessão local do Claude Code.";

export function codeTasksEnabled(env = process.env) {
  return env.CODE_TASKS_ENABLED === "1";
}
