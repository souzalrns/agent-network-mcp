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

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = 5000;
// Permite apontar directamente para o executável se o PATH não estiver
// configurado (comum logo após instalar o Claude Code no Windows,
// que instala em ~/.local/bin sem adicionar ao PATH automaticamente).
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
// Limiar de alerta de memória: acima disto, grava um aviso de alta
// prioridade em pendencias_negocio (visível na próxima verificação do
// chat), em vez de deixar a VM chegar a OOM sem ninguém saber.
const MEM_ALERT_THRESHOLD_PCT = parseInt(process.env.MEM_ALERT_THRESHOLD_PCT || "80", 10);
// Não verifica a cada 5s (seria custo de rede à toa) — só de X em X ms.
const MEM_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let lastMemCheckAt = 0;
let memAlertActive = false;

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

  await new Promise((resolve) => {
    // spawn (em vez de execFile) + detached:true cria a tarefa no seu
    // próprio grupo de processo. Isto é o que permite, no timeout, matar
    // o `claude` E quaisquer subprocessos que ele tenha criado (ex: um
    // servidor MCP travado, ou um prompt interativo tipo `gh` à espera
    // de confirmação) — execFile com timeout só mata o processo direto,
    // deixando "netos" vivos a segurar o pipe aberto, o que fazia esta
    // promise nunca resolver e o worker inteiro travar para sempre.
    const child = spawn(
      CLAUDE_BIN,
      [
        "-p", task.prompt,
        "--permission-mode", "acceptEdits",
        "--allowedTools", allowedTools,
        "--output-format", "json",
      ],
      {
        cwd: task.project_path,
        // shell:true só é preciso no Windows (claude é instalado como
        // .cmd/.exe e spawn puro dá ENOENT). Em Linux/Mac o binário é
        // encontrado directamente.
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        // No Windows, detached tem semântica diferente e o kill de grupo
        // negativo não se aplica — mantém-se o comportamento anterior lá.
        detached: process.platform !== "win32",
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      console.log(`  ⏱️ Timeout de 15min — a matar grupo de processo (pid ${child.pid}).`);
      try {
        // pid negativo = mata o GRUPO inteiro (pai + subprocessos), não
        // só o processo direto.
        process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
      } catch (e) {
        console.log(`  (aviso ao matar grupo: ${e.message})`);
      }
    }, 15 * 60 * 1000);

    child.on("close", async (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (signal === "SIGKILL") {
        await updateTask(task.id, {
          status: "error",
          error_message:
            `Timeout de 15min — processo (e subprocessos) morto à força.\n` +
            `--- stdout ---\n${stdout.slice(0, 2000)}\n` +
            `--- stderr ---\n${stderr.slice(0, 2000)}`,
          completed_at: new Date().toISOString(),
        });
        console.log(`  ❌ Timeout — morto.`);
        return resolve();
      }

      if (code !== 0) {
        await updateTask(task.id, {
          status: "error",
          error_message:
            `code=${code} signal=${signal}\n` +
            `--- stdout ---\n${stdout.slice(0, 2000)}\n` +
            `--- stderr ---\n${stderr.slice(0, 2000)}`,
          completed_at: new Date().toISOString(),
        });
        console.log(`  ❌ Erro: exit code ${code}.`);
        return resolve();
      }

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
      resolve();
    });
  });
}

async function checkMemoryHealth() {
  const now = Date.now();
  if (now - lastMemCheckAt < MEM_CHECK_INTERVAL_MS) return;
  lastMemCheckAt = now;

  const totalMb = os.totalmem() / 1024 / 1024;
  const freeMb = os.freemem() / 1024 / 1024;
  const usedPct = ((totalMb - freeMb) / totalMb) * 100;

  if (usedPct < MEM_ALERT_THRESHOLD_PCT) {
    memAlertActive = false; // reseta para poder alertar de novo no futuro
    return;
  }
  if (memAlertActive) return; // já avisado, não duplica

  console.log(`  ⚠️ Memória em ${usedPct.toFixed(1)}% — a registar alerta.`);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pendencias_negocio`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        area: "infraestrutura",
        area_slug: "infraestrutura",
        area_label: "Infraestrutura",
        titulo: `Alerta: bridge-worker com memória em ${usedPct.toFixed(1)}% (hostname ${os.hostname()})`,
        detalhe:
          `Gravado automaticamente pelo bridge-worker.js em ${new Date().toISOString()}.\n` +
          `Memória total: ${totalMb.toFixed(0)}MB · livre: ${freeMb.toFixed(0)}MB · uso: ${usedPct.toFixed(1)}%.\n` +
          `Limiar configurado: ${MEM_ALERT_THRESHOLD_PCT}%. Isto é um aviso preventivo, não uma falha — ` +
          `mas vale investigar antes de chegar a OOM (histórico: a VM GCP anterior já sofreu isso com 1GB).`,
        status: "pendente",
        tipo: "acao",
        prioridade: "alta",
        requer_intervencao_humana: true,
      }),
    });
    if (res.ok) memAlertActive = true;
  } catch (err) {
    console.error("  (falha ao gravar alerta de memória, não é fatal):", err.message);
  }
}

async function loop() {
  console.log(`🌉 bridge-worker.js a correr — a verificar tarefas a cada ${POLL_INTERVAL_MS / 1000}s...`);
  while (true) {
    try {
      await checkMemoryHealth();
      const task = await fetchNextTask();
      if (task) await runTask(task);
    } catch (err) {
      console.error("Erro no ciclo de polling:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

loop();
