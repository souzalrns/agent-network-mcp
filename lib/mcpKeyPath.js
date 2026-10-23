// F0.6 (decisão do maestro, 2026-10-23: opção A): o conector do Claude.ai não
// envia cabeçalhos próprios, por isso não consegue mandar o
// "Authorization: Bearer <MCP_API_KEY>" que o /api/mcp exige. Aceita-se a mesma
// chave no caminho, /api/mcp/k/<chave>: o proxy.js passa-a para o cabeçalho e
// reescreve o pedido para /api/mcp, onde o withAuth a compara em tempo
// constante como sempre. Nada aqui valida a chave; só a extrai.
//
// Custo assumido: o caminho fica nos logs de pedidos da Vercel (só o dono do
// projeto os vê). Rodar a MCP_API_KEY invalida o URL antigo do conector.

const PREFIXO = "/api/mcp/k/";
const MIN = 16;
const MAX = 512;

export function chaveDoCaminho(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith(PREFIXO)) return null;
  const resto = pathname.slice(PREFIXO.length).replace(/\/+$/, "");
  if (!resto || resto.includes("/")) return null;
  let chave;
  try {
    chave = decodeURIComponent(resto);
  } catch {
    return null;
  }
  if (chave.length < MIN || chave.length > MAX || /[\s\r\n]/.test(chave)) return null;
  return chave;
}
