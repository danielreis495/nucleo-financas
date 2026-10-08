/**
 * Funções de servidor do Open Finance, chamadas pelo app.
 * Os módulos de servidor (sessão, banco de dados, Pluggy) são importados dentro dos
 * handlers para nunca entrarem no pacote do navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import type { BankEditInput, BankSnapshot, BankSyncResult } from "./types";

/** Sincroniza sozinho ao abrir o app quando a última atualização tem mais de 6 horas. */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;

type Denied = { ok: false; needsLogin?: boolean; setupMissing?: boolean; error: string };
type SnapshotResult =
  | { ok: true; snapshot: BankSnapshot; sync: BankSyncResult | null }
  | Denied;

const SETUP_MESSAGE =
  "Falta configurar a senha da casa (APP_PASSWORD) nas variáveis de ambiente da Vercel.";

async function guard(): Promise<Denied | null> {
  const session = await import("./session");
  if (!session.appPasswordConfigured()) {
    return { ok: false, setupMissing: true, error: SETUP_MESSAGE };
  }
  if (!(await session.hasSession())) {
    return { ok: false, needsLogin: true, error: "Digite a senha da casa para continuar." };
  }
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const bankLogin = createServerFn({ method: "POST" })
  .validator((input: { password: string }) => ({
    password: String(input?.password ?? "").slice(0, 200),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Denied> => {
    const session = await import("./session");
    if (!session.appPasswordConfigured()) {
      return { ok: false, setupMissing: true, error: SETUP_MESSAGE };
    }
    if (!(await session.passwordMatches(data.password))) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { ok: false, needsLogin: true, error: "Senha incorreta." };
    }
    await session.startSession();
    return { ok: true };
  });

export const bankLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await import("./session");
  session.endSession();
  return { ok: true as const };
});

export const loadBankSnapshot = createServerFn({ method: "POST" })
  .validator((input: { autoSync?: boolean } | undefined) => ({
    autoSync: Boolean(input?.autoSync),
  }))
  .handler(async ({ data }): Promise<SnapshotResult> => {
    const denied = await guard();
    if (denied) return denied;
    try {
      const sync = await import("./sync");
      let result: BankSyncResult | null = null;
      if (data.autoSync) {
        const last = await sync.lastSuccessfulSyncAt();
        if (!last || Date.now() - last > AUTO_SYNC_AFTER_MS) result = await sync.syncAll("auto");
      }
      return { ok: true, snapshot: await sync.readSnapshot(), sync: result };
    } catch (error) {
      console.error("[bank] falha ao carregar", error);
      return { ok: false, error: `Não consegui ler os dados do banco: ${errorMessage(error)}` };
    }
  });

export const syncBankNow = createServerFn({ method: "POST" }).handler(
  async (): Promise<SnapshotResult> => {
    const denied = await guard();
    if (denied) return denied;
    try {
      const sync = await import("./sync");
      const result = await sync.syncAll("manual");
      return { ok: true, snapshot: await sync.readSnapshot(), sync: result };
    } catch (error) {
      console.error("[bank] falha ao sincronizar", error);
      return { ok: false, error: `A sincronização falhou: ${errorMessage(error)}` };
    }
  },
);

export const saveBankEdit = createServerFn({ method: "POST" })
  .validator((input: BankEditInput) => ({
    txId: String(input?.txId ?? "").slice(0, 100),
    category: input?.category ? String(input.category).slice(0, 60) : undefined,
    personId: input?.personId ? String(input.personId).slice(0, 100) : undefined,
    nature: input?.nature ? String(input.nature).slice(0, 30) : undefined,
    merchantKey: input?.merchantKey ? String(input.merchantKey).slice(0, 120) : undefined,
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Denied> => {
    const denied = await guard();
    if (denied) return denied;
    if (!data.txId) return { ok: false, error: "Movimento inválido." };
    try {
      const sync = await import("./sync");
      await sync.saveEdit(data);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Não salvei o ajuste: ${errorMessage(error)}` };
    }
  });
