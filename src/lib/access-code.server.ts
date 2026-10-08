import { createHash, timingSafeEqual } from "node:crypto";
import {
  ACCESS_CODE_INVALID_MESSAGE,
  ACCESS_CODE_MISSING_MESSAGE,
  ACCESS_CODE_NOT_CONFIGURED_MESSAGE,
} from "./access-code";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Retorna null quando o acesso é permitido, ou a mensagem para o usuário.
 * Sem NUCLEO_ACCESS_CODE configurado, só o ambiente de desenvolvimento passa:
 * em produção a IA fica bloqueada em vez de aberta para qualquer pessoa.
 */
export function accessCodeError(
  provided: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const expected = String(env.NUCLEO_ACCESS_CODE ?? "").trim();
  if (!expected) {
    return env.NODE_ENV === "production" || env.VERCEL_ENV ? ACCESS_CODE_NOT_CONFIGURED_MESSAGE : null;
  }
  const candidate = String(provided ?? "").trim();
  if (!candidate) return ACCESS_CODE_MISSING_MESSAGE;
  return timingSafeEqual(digest(candidate), digest(expected)) ? null : ACCESS_CODE_INVALID_MESSAGE;
}
