// J6: sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (memória opcional) o ledger
// não faz nada e a resposta chega igual. Ficheiro à parte porque o node --test
// corre cada ficheiro num processo próprio (o getClient() guarda o cliente).
import { test } from "node:test";
import assert from "node:assert/strict";

import { state } from "./_fakes.mjs";

process.env.GEMINI_API_KEY = "test-key";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { callGemini } = await import("../lib/agentRuntime.js");
const { embedText } = await import("../lib/knowledge.js");

test("sem Supabase configurado: resposta igual e nenhum pedido ao Supabase", async () => {
  assert.equal(await callGemini("sys", "olá"), "resposta do modelo");
  assert.equal((await embedText("x")).length, 768);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(state.rows.length, 0);
});
