#!/usr/bin/env node
/**
 * Documentação automática dos agentes a partir de lib/agents.js.
 * Saída: docs/generated/AGENTS.md
 *
 * Uso: node scripts/document-agents.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENTS_FILE = path.join(ROOT, 'lib/agents.js');
const OUT_DIR = path.join(ROOT, 'docs/generated');
const OUT_FILE = path.join(OUT_DIR, 'AGENTS.md');

function extractAgents(source) {
  const agents = [];
  // Chaves de topo do objeto AGENTS: mesaflow: { id: "mesaflow", description: "..."
  const keyRe = /\n\s*["']?([a-z0-9-]+)["']?\s*:\s*\{\s*\n\s*id:\s*["']([^"']+)["']/g;
  let m;
  const ids = new Set();
  while ((m = keyRe.exec(source)) !== null) {
    const id = m[2];
    if (ids.has(id)) continue;
    ids.add(id);
    // description na mesma vizinhança
    const slice = source.slice(m.index, m.index + 800);
    const descMatch = slice.match(/description:\s*\n?\s*["'`]([\s\S]*?)["'`],/);
    let description = '';
    if (descMatch) {
      description = descMatch[1].replace(/\s*\+\s*\n\s*["'`]/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      const d2 = slice.match(/description:\s*["']([^"']+)["']/);
      description = d2 ? d2[1] : '';
    }
    agents.push({ id, description });
  }
  return agents.sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  if (!fs.existsSync(AGENTS_FILE)) {
    console.error('lib/agents.js não encontrado');
    process.exit(1);
  }
  const source = fs.readFileSync(AGENTS_FILE, 'utf8');
  const agents = extractAgents(source);
  const now = new Date().toISOString().slice(0, 10);

  let md = `# AGENTS — catálogo gerado automaticamente\n\n`;
  md += `> **Não editar à mão.** Regenerar com: \`node scripts/document-agents.js\`\n`;
  md += `>\n> Gerado em: ${now}\n`;
  md += `> Fonte: \`lib/agents.js\`\n`;
  md += `> Total: **${agents.length}** agentes\n\n`;
  md += `| ID | Descrição |\n|----|-----------|\n`;
  for (const a of agents) {
    const d = (a.description || '—').replace(/\|/g, '\\|').slice(0, 200);
    md += `| \`${a.id}\` | ${d} |\n`;
  }
  md += `\n---\n*Camada privada/produção — agent-network-mcp.*\n`;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, md, 'utf8');
  console.log(`✅ ${agents.length} agentes → ${path.relative(ROOT, OUT_FILE)}`);
}

main();
