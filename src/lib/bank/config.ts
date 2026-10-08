/**
 * Configuração do Open Finance lida das variáveis de ambiente (somente servidor).
 *
 *   PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET   credenciais do painel da Pluggy
 *   PLUGGY_ITEMS                              itens do MeuPluggy: "itemId:you,itemId:partner"
 *   PLUGGY_PARTNER_CLIENT_ID / _SECRET        opcional: conta Pluggy da outra pessoa da casa
 */
import type { BankOwnerRole } from "./types";

export type BankItemConfig = { itemId: string; ownerRole: BankOwnerRole };
export type PluggyCredentials = {
  clientId: string;
  clientSecret: string;
  /** Outros segredos a tentar se a Pluggy recusar o primeiro. */
  alternateSecrets?: string[];
};

function env(name: string) {
  // Tolera aspas ou espaços colados junto ao valor no painel da Vercel.
  const value = process.env[name]?.trim().replace(/^["']+|["']+$/g, "").trim();
  return value ? value : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function configuredItems(): BankItemConfig[] {
  return (env("PLUGGY_ITEMS") ?? "")
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((entry) => {
      const [itemId = "", role = ""] = entry.split(":");
      return {
        itemId: itemId.trim(),
        ownerRole: role.trim() === "partner" ? ("partner" as const) : ("you" as const),
      };
    })
    .filter((item) => UUID.test(item.itemId));
}

export function credentialsFor(role: BankOwnerRole): PluggyCredentials | null {
  if (role === "partner") {
    const clientId = env("PLUGGY_PARTNER_CLIENT_ID");
    const clientSecret = env("PLUGGY_PARTNER_CLIENT_SECRET");
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  // O nome com "CLIENTE" também é aceito porque foi assim que a variável foi criada na Vercel.
  const clientId = env("PLUGGY_CLIENT_ID") ?? env("PLUGGY_CLIENTE_ID");
  // O segredo também pode estar em "PLUGGY_CLIENT_SECRET_id" (nome usado no painel da
  // Vercel). Os dois são tentados; vale o que a Pluggy aceitar.
  const secrets = [env("PLUGGY_CLIENT_SECRET_id"), env("PLUGGY_CLIENT_SECRET")].filter(
    (value, index, all): value is string =>
      Boolean(value) && value !== clientId && all.indexOf(value) === index,
  );
  if (!clientId || secrets.length === 0) return null;
  const [clientSecret, ...alternateSecrets] = secrets;
  return { clientId, clientSecret, alternateSecrets };
}
