import { createClient } from "@supabase/supabase-js";
import {
  verificarPassword,
  assinarSessao,
  SESSION_MAX_AGE_SECONDS,
} from "../_lib/session.js";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  if (!password) {
    return Response.json({ error: "Password em falta" }, { status: 400 });
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("dashboard_auth")
    .select("password_hash")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data || !verificarPassword(password, data.password_hash)) {
    return Response.json({ error: "Password incorreta" }, { status: 401 });
  }

  const expiraEm = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = assinarSessao(expiraEm);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `dash_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    },
  });
}
