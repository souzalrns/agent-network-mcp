#!/usr/bin/env node
// bridge-worker.js — corre na máquina LOCAL do Luiz, nunca no servidor.
//
// Faz polling (pergunta, nunca recebe ligações — sem portas abertas) à
// tabela code_tasks no Supabase. Quando encontra uma tarefa "pending",
// corre `claude -p` localmente (com todos os MCPs/skills instalados —
// Orca, Graphify, Glyph, etc.) no diretório do projeto indicado, e grava
// o resultado de volta. Isto é a ponte entre o chat (que só cria a
// tarefa) e o Claude Code real na tua máquina (que a executa).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node bridge-worker.js
//
// Mantém isto a correr em segundo plano (ex: com pm2, ou num terminal
// dedicado). Só executa tarefas para diretórios que já existem na tua
// máquina — nunca cria projetos novos por si.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = 5000;
// Permite apontar directamente para o executável se o PATH não estiver
// configurado (comum logo após instalar o Claude Code no Windows,
// que instala em ~/.local/bin sem adicionar ao PATH automaticamente).
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de correr.");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function fetchNextTask() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/code_tasks?status=eq.pending&order=created_at.asc&limit=1`,
    { headers }
  );
  const rows = await res.json();
  return rows[0] || null;
}

async function updateTask(id, fields) {
  await fetch(`${SUPABASE_URL}/rest/v1/code_tasks?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
}

async function runTask(task) {
  console.log(`\n▶ A correr tarefa ${task.id} em ${task.project_path}`);
  console.log(`  Pedido: ${task.prompt.slice(0, 120)}...`);

  if (!existsSync(task.project_path)) {
    await updateTask(task.id, {
      status: "error",
      error_message: `Diretório não existe: ${task.project_path}`,
      completed_at: new Date().toISOString(),
    });
    console.log(`  ❌ Diretório não existe, a saltar.`);
    return;
  }

  await updateTask(task.id, { status: "running", started_at: new Date().toISOString() });

  const allowedTools = task.allowed_tools || "Bash,Read,Write,Edit,Grep,Glob";

  try {
    const { stdout } = await execFileAsync(
      CLAUDE_BIN,
      [
        "-p", task.prompt,
        "--permission-mode", "acceptEdits",
        "--allowedTools", allowedTools,
        "--output-format", "json",
      ],
      {
        cwd: task.project_path,
        timeout: 15 * 60 * 1000,
        maxBuffer: 20 * 1024 * 1024,
        // No Windows, `claude` é instalado como .cmd/.ps1 — execFile sem
        // shell:true dá ENOENT mesmo que o comando funcione normalmente
        // no terminal. shell:true resolve isso em qualquer SO.
        shell: true,
      }
    );

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { result: stdout };
    }

    await updateTask(task.id, {
      status: "done",
      result: parsed.result || stdout,
      cost_usd: parsed.total_cost_usd || null,
      completed_at: new Date().toISOString(),
    });
    console.log(`  ✅ Concluída.`);
  } catch (err) {
    await updateTask(task.id, {
      status: "error",
      error_message: String(err.stderr || err.message).slice(0, 4000),
      completed_at: new Date().toISOString(),
    });
    console.log(`  ❌ Erro: ${err.message}`);
  }
}

async function loop() {
  console.log(`🌉 bridge-worker.js a correr — a verificar tarefas a cada ${POLL_INTERVAL_MS / 1000}s...`);
  while (true) {
    try {
      const task = await fetchNextTask();
      if (task) await runTask(task);
    } catch (err) {
      console.error("Erro no ciclo de polling:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

loop();
