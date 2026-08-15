import crypto from "crypto";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

export function verificarPassword(password, armazenado) {
  const [salt, hashHex] = armazenado.split(":");
  const derivado = crypto.scryptSync(password, salt, 64);
  const esperado = Buffer.from(hashHex, "hex");
  if (derivado.length !== esperado.length) return false;
  return crypto.timingSafeEqual(derivado, esperado);
}

export function assinarSessao(expiraEm) {
  const hmac = crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update(String(expiraEm))
    .digest("hex");
  return `${expiraEm}.${hmac}`;
}

export function sessaoValida(cookieHeader) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/dash_session=([^;]+)/);
  if (!match) return false;
  const [expiraStr, hmacRecebido] = decodeURIComponent(match[1]).split(".");
  const expiraEm = Number(expiraStr);
  if (!expiraEm || Date.now() > expiraEm) return false;
  const esperado = crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update(String(expiraEm))
    .digest("hex");
  const a = Buffer.from(hmacRecebido || "", "hex");
  const b = Buffer.from(esperado, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
