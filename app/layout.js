export const metadata = {
  title: "agent-network-mcp",
  description: "Servidor MCP da rede de agentes LRNSdigital",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
