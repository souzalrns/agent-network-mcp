import { createClient } from "@supabase/supabase-js";
import { sessaoValida } from "../_lib/session.js";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  if (!sessaoValida(request.headers.get("cookie"))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await request.json().catch(() => ({}));
  if (!id) {
    return Response.json({ error: "id em falta" }, { status: 400 });
  }

  const supabase = getClient();

  // Só permite aprovar por este caminho pendências do tipo 'autorizacao' —
  // decisões e bloqueios externos não são um clique de checkbox.
  const { data: existente, error: erroLeitura } = await supabase
    .from("pendencias_negocio")
    .select("id, tipo, status")
    .eq("id", id)
    .maybeSingle();

  if (erroLeitura || !existente) {
    return Response.json({ error: "Pendência não encontrada" }, { status: 404 });
  }
  if (existente.tipo !== "autorizacao") {
    return Response.json({ error: "Só é possível aprovar pendências do tipo 'autorizacao' por aqui" }, { status: 400 });
  }

  const { error } = await supabase
    .from("pendencias_negocio")
    .update({ status: "concluido", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return Response.json({ error: "Falha ao gravar" }, { status: 500 });
  }

  return Response.json({ ok: true, id });
}
