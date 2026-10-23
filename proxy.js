import { NextResponse } from "next/server";
import { chaveDoCaminho } from "./lib/mcpKeyPath.js";

// /api/mcp/k/<chave> -> /api/mcp com "Authorization: Bearer <chave>" (F0.6).
// A validação continua no withAuth de app/api/mcp/route.js.
export default function proxy(request) {
  const chave = chaveDoCaminho(request.nextUrl.pathname);
  if (!chave) return new NextResponse(null, { status: 404 });
  const url = request.nextUrl.clone();
  url.pathname = "/api/mcp";
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${chave}`);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: "/api/mcp/k/:path*" };
