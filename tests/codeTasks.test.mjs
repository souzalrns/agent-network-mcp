// S20: a execução remota está desligada por omissão (falha fechada).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_TASKS_DISABLED_MESSAGE, codeTasksEnabled } from "../lib/codeTasks.js";

test("desligada por omissão; só liga com CODE_TASKS_ENABLED=1", () => {
  assert.equal(codeTasksEnabled({}), false);
  assert.equal(codeTasksEnabled({ CODE_TASKS_ENABLED: "true" }), false);
  assert.equal(codeTasksEnabled({ CODE_TASKS_ENABLED: "0" }), false);
  assert.equal(codeTasksEnabled({ CODE_TASKS_ENABLED: "1" }), true);
});

test("a mensagem diz que nada foi criado e o que fazer", () => {
  assert.match(CODE_TASKS_DISABLED_MESSAGE, /Nenhuma tarefa foi criada/);
  assert.match(CODE_TASKS_DISABLED_MESSAGE, /S20/);
});
