export const FINANCE_STORAGE_KEY = "nucleo-finance-v1";
export const FINANCE_BACKUP_VERSION = 1;

export type FinanceBackup = {
  app: "nucleo-financas";
  backupVersion: number;
  createdAt: string;
  storageKey: string;
  data: {
    state: Record<string, unknown>;
    version?: number;
  };
};

export function parseFinanceBackup(raw: string): FinanceBackup {
  const backup = JSON.parse(raw) as FinanceBackup;
  const state = backup?.data?.state;

  if (
    backup?.app !== "nucleo-financas" ||
    backup.backupVersion !== FINANCE_BACKUP_VERSION ||
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.people) ||
    !Array.isArray(state.transactions) ||
    !Array.isArray(state.plans) ||
    !Array.isArray(state.budgets) ||
    !Array.isArray(state.customCategories)
  ) {
    throw new Error("Esse arquivo não é um backup válido do Núcleo.");
  }

  return backup;
}

export function buildFinanceBackup(raw: string): FinanceBackup {
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
  if (!parsed?.state || typeof parsed.state !== "object") {
    throw new Error("Não encontrei os dados financeiros neste aparelho.");
  }

  const state = { ...parsed.state };
  delete state.geminiKey;

  return {
    app: "nucleo-financas",
    backupVersion: FINANCE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    storageKey: FINANCE_STORAGE_KEY,
    data: {
      ...parsed,
      state,
    },
  };
}
