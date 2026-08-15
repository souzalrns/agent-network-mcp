// Tipografia via stacks de sistema (sem next/font/google): o build do Vercel
// até teria internet para ir buscar fontes ao Google, mas mantemos zero
// dependência de rede externa no build para não arriscar quebrar produção
// por causa de fonte — o efeito "técnico" vem da mono, não de uma fonte rara.
const FONT_DISPLAY =
  'Inter, -apple-system, "Segoe UI", system-ui, sans-serif';
const FONT_MONO =
  'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace';

export default function DashboardLayout({ children }) {
  return (
    <div style={{ "--font-display": FONT_DISPLAY, "--font-mono": FONT_MONO }}>
      {children}
    </div>
  );
}
