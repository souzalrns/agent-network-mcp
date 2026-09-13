import crypto from "crypto";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

/**
 * Comprimento minimo do segredo HMAC. Abaixo disto, consideramos a
 * configuracao invalida (fail-closed). O SUPABASE_SERVICE_ROLE_KEY real
 * tem ~200 chars; 16 e o minimo para nao aceitar strings obviamente erradas.
 */
const MIN_SECRET_LENGTH = 16;

/**
 * Fail-closed: recusa-se a operar se o segredo nao estiver configurado
 * corretamente. Evita o cenario em que SUPABASE_SERVICE_ROLE_KEY="" produz
 * HMACs com chave vazia que um atacante pode forjar.
 *
 * Lanca em vez de devolver false, para que o caller possa distinguir
 * "mal configurado" (503) de "sessao invalida" (401).
 */
export function assertSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente, vazia ou demasiado curta. " +
        "Autenticacao do dashboard indisponivel (fail-closed)."
    );
  }
  return secret;
}

export function verificarPassword(password, armazenado) {
  const [salt, hashHex] = armazenado.split(":");
  const derivado = crypto.scryptSync(password, salt, 64);
  const esperado = Buffer.from(hashHex, "hex");
  if (derivado.length !== esperado.length) return false;
  return crypto.timingSafeEqual(derivado, esperado);
}

export function assinarSessao(expiraEm) {
  const hmac = crypto
    .createHmac("sha256", assertSecret())
    .update(String(expiraEm))
    .digest("hex");
  return `${expiraEm}.${hmac}`;
}

export function sessaoValida(cookieHeader) {
  // Fail-closed: falha cedo se o segredo nao existe.
  const secret = assertSecret();

  if (!cookieHeader) return false;
  const match = cookieHeader.match(/dash_session=([^;]+)/);
  if (!match) return false;
  const [expiraStr, hmacRecebido] = decodeURIComponent(match[1]).split(".");
  const expiraEm = Number(expiraStr);
  if (!expiraEm || Date.now() > expiraEm) return false;
  const esperado = crypto
    .createHmac("sha256", secret)
    .update(String(expiraEm))
    .digest("hex");
  const a = Buffer.from(hmacRecebido || "", "hex");
  const b = Buffer.from(esperado, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}