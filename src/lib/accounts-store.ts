import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Account, AccountType } from "./types";
import { uid } from "./utils";

type AccountActions = {
  addAccount: (input: { name: string; institution: string; type: AccountType; openingBalance: number }) => void;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string) => void;
};

type AccountsState = {
  accounts: Account[];
} & AccountActions;

export const ACCOUNTS_STORAGE_KEY = "nucleo-finance-accounts-v1";

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set, get) => ({
      accounts: [],
      addAccount: ({ name, institution, type, openingBalance }) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        set({
          accounts: [
            {
              id: uid(),
              name: trimmedName,
              institution: institution.trim(),
              type,
              openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
              createdAt: new Date().toISOString(),
              active: true,
            },
            ...get().accounts,
          ],
        });
      },
      updateAccount: (id, patch) =>
        set({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
      removeAccount: (id) =>
        set({ accounts: get().accounts.filter((a) => a.id !== id) }),
    }),
    { name: ACCOUNTS_STORAGE_KEY },
  ),
);
