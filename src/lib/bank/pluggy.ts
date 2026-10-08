/** Cliente mínimo da API da Pluggy (https://api.pluggy.ai). Somente servidor. */
import type { PluggyCredentials } from "./config";

const BASE = "https://api.pluggy.ai";

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  subtype?: string | null;
  number?: string | null;
  name?: string | null;
  marketingName?: string | null;
  balance?: number | null;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceDueDate?: string | null;
    balanceCloseDate?: string | null;
  } | null;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  date: string;
  description?: string | null;
  descriptionRaw?: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  status?: string | null;
  category?: string | null;
  operationType?: string | null;
  createdAt?: string | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
    billId?: string | null;
    billForecastDate?: string | null;
  } | null;
};

export type PluggyBill = {
  id: string;
  dueDate?: string | null;
  billClosingDate?: string | null;
  totalAmount?: number | null;
};

async function request<T>(apiKey: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "X-API-KEY": apiKey, accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const path = url.replace(BASE, "").split("?")[0];
    throw new Error(`Pluggy ${path} respondeu HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mostra só o formato de um valor secreto: tamanho e se parece um UUID. */
function shape(value: string) {
  return `${value.length} caracteres${UUID.test(value) ? ", formato UUID" : ", não é UUID"}`;
}

export async function createApiKey(credentials: PluggyCredentials): Promise<string> {
  const secrets = [credentials.clientSecret, ...(credentials.alternateSecrets ?? [])];
  let lastError: Error | null = null;
  for (const clientSecret of secrets) {
    try {
      return await requestApiKey(credentials.clientId, clientSecret);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("A Pluggy não devolveu a chave de acesso.");
}

async function requestApiKey(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const body = JSON.parse(text) as { message?: string; code?: number | string };
      detail = [body.code, body.message].filter(Boolean).join(" ");
    } catch {
      // resposta sem JSON: usa o texto
    }
    detail = detail.replaceAll(clientSecret, "***").slice(0, 200);
    throw new Error(
      res.status === 401 || res.status === 403
        ? "A Pluggy recusou as chaves. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel " +
          `(Client ID: ${shape(clientId)}; Client Secret: ${shape(clientSecret)}).`
        : `Pluggy /auth respondeu HTTP ${res.status}${detail ? `: ${detail}` : ""} ` +
          `(Client ID: ${shape(clientId)}; Client Secret: ${shape(clientSecret)})`,
    );
  }
  const json = (await res.json()) as { apiKey?: string };
  if (!json.apiKey) throw new Error("A Pluggy não devolveu a chave de acesso.");
  return json.apiKey;
}

export async function listAccounts(apiKey: string, itemId: string) {
  const page = await request<{ results?: PluggyAccount[] }>(
    apiKey,
    withQuery("/accounts", { itemId }),
  );
  return page.results ?? [];
}

/** Lista transações pela API v2 (cursor). A v1 paginada será desligada pela Pluggy. */
export async function listTransactions(apiKey: string, accountId: string, dateFrom: string) {
  const all: PluggyTransaction[] = [];
  let url: string | null = withQuery("/v2/transactions", { accountId, dateFrom });
  for (let guard = 0; url && guard < 200; guard += 1) {
    const page: { results?: PluggyTransaction[]; next?: string | null } = await request(
      apiKey,
      url,
    );
    all.push(...(page.results ?? []));
    const next = page.next?.trim();
    if (!next) break;
    // `next` é a query string pronta para a próxima página (ex.: "?accountId=…&after=…").
    url = next.startsWith("http")
      ? next
      : next.startsWith("/")
        ? `${BASE}${next}`
        : `${BASE}/v2/transactions${next.startsWith("?") ? next : `?${next}`}`;
  }
  return all;
}

export async function listBills(apiKey: string, accountId: string) {
  const page = await request<{ results?: PluggyBill[] }>(
    apiKey,
    withQuery("/bills", { accountId, pageSize: "500" }),
  );
  return page.results ?? [];
}
