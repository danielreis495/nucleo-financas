/**
 * Explica em português por que uma conexão da Pluggy não está trazendo dados novos.
 * Função pura: recebe o que a Pluggy informou e o momento atual.
 */
import type { BankItemInfo } from "./types";

export type ItemHealth = {
  /** ok: nada a fazer · wait: a Pluggy tenta de novo sozinha · action: você precisa agir. */
  level: "ok" | "wait" | "action";
  message: string | null;
};

const HOUR = 60 * 60 * 1000;
/** A Pluggy atualiza cada conexão uma vez por dia; acima disso, algo travou. */
const STALE_AFTER_MS = 36 * HOUR;
const CONSENT_WARNING_MS = 7 * 24 * HOUR;

const NEEDS_USER = new Set([
  "LOGIN_ERROR",
  "WAITING_USER_INPUT",
  "INVALID_CREDENTIALS",
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "USER_AUTHORIZATION_REVOKED",
  "USER_INPUT_TIMEOUT",
  "ACCOUNT_NEEDS_ACTION",
  "ACCOUNT_LOCKED",
  "CONSENT_EXPIRED",
  "CONSENT_REVOKED",
]);

const BANK_SIDE = new Set(["OUTDATED", "SITE_NOT_AVAILABLE", "ERROR", "CONNECTION_ERROR"]);

/**
 * Conexões feitas pelo MeuPluggy não aceitam pedido de atualização pela API (a Pluggy
 * responde "MeuPluggy item cant be updated"). Não é erro: elas atualizam sozinhas uma vez
 * por dia, ou na hora pelo botão de atualizar do meu.pluggy.ai.
 */
export function isMeuPluggyRefusal(updateResult: string | null | undefined) {
  return /meupluggy/i.test(updateResult ?? "");
}

function day(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function itemHealth(item: BankItemInfo, institution: string, now = Date.now()): ItemHealth {
  const codes = [item.status, item.executionStatus, item.errorCode].filter(
    (value): value is string => Boolean(value),
  );
  const since = item.lastUpdatedAt ? ` Dados de ${day(item.lastUpdatedAt)}.` : "";
  const detail = item.errorMessage ? ` A Pluggy diz: "${item.errorMessage}".` : "";
  const consentEnd = item.consentExpiresAt ? Date.parse(item.consentExpiresAt) : NaN;

  if (codes.some((code) => NEEDS_USER.has(code)) || (!Number.isNaN(consentEnd) && consentEnd <= now)) {
    return {
      level: "action",
      message:
        `${institution}: a autorização do Open Finance precisa ser renovada.${since}` +
        ` Abra meu.pluggy.ai, entre na conexão do ${institution} e reconecte.${detail}`,
    };
  }
  if (item.status === "UPDATING") {
    return { level: "wait", message: `${institution}: a Pluggy está buscando novidades agora.` };
  }
  if (codes.some((code) => BANK_SIDE.has(code))) {
    return {
      level: "wait",
      message:
        `${institution}: na última tentativa o banco não respondeu à Pluggy (${codes.join(", ")}).` +
        `${since} Ela tenta de novo sozinha uma vez por dia.${detail}`,
    };
  }
  const refused =
    item.updateResult && item.updateResult !== "ok" && !isMeuPluggyRefusal(item.updateResult)
      ? ` O pedido de atualização foi recusado (${item.updateResult}).`
      : "";
  const updated = item.lastUpdatedAt ? Date.parse(item.lastUpdatedAt) : NaN;
  if (!Number.isNaN(updated) && now - updated > STALE_AFTER_MS) {
    return {
      level: "action",
      message:
        `${institution}: a Pluggy não traz dados novos desde ${day(item.lastUpdatedAt!)}.` +
        ` Confira a conexão em meu.pluggy.ai.${refused}`,
    };
  }
  if (!Number.isNaN(consentEnd) && consentEnd - now < CONSENT_WARNING_MS) {
    return {
      level: "action",
      message: `${institution}: a autorização do Open Finance vence em ${day(item.consentExpiresAt!)}. Renove em meu.pluggy.ai.`,
    };
  }
  if (refused) return { level: "wait", message: `${institution}:${refused}` };
  return { level: "ok", message: null };
}
