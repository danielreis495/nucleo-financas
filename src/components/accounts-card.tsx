import { useState } from "react";
import { Building2, CreditCard, Landmark, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { accountBalance, accountMovement, monthTransactions } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: { id: AccountType; label: string; icon: typeof Wallet }[] = [
  { id: "checking", label: "Conta corrente", icon: Landmark },
  { id: "savings", label: "Poupança", icon: Building2 },
  { id: "cash", label: "Dinheiro", icon: Wallet },
  { id: "investment", label: "Investimento", icon: CreditCard },
  { id: "other", label: "Outra", icon: MoreHorizontal },
];

export function AccountsCard() {
  const state = useFinanceStore();
  const accounts = state.accounts;
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const removeAccount = useFinanceStore((s) => s.removeAccount);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [balance, setBalance] = useState("");

  const activeAccounts = accounts.filter((account) => account.active);
  const total = activeAccounts.reduce((sum, account) => sum + accountBalance(state, account), 0);
  const monthRows = monthTransactions(state, state.viewMonth, false, true);

  return (
    <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Landmark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Contas</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">Saldos acompanhados</h2>
            <p className="shrink-0 font-display text-lg tabular-nums">{formatBRL(total)}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Adicionar conta"
          onClick={() => setOpen((value) => !value)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"
        >
          <Plus className={cn("size-4 transition-transform", open && "rotate-45")} />
        </button>
      </div>

      {accounts.length ? (
        <div className="mt-3 divide-y divide-line rounded-xl bg-surface px-3 shadow-[var(--shadow-border)]">
          {accounts.map((account) => {
            const typeInfo = TYPES.find((item) => item.id === account.type) ?? TYPES[4];
            const Icon = typeInfo.icon;
            const movement = accountMovement(state, account);
            const calculatedBalance = accountBalance(state, account);
            const monthMovement = monthRows
              .filter((row) => row.accountId === account.id)
              .reduce((sum, row) => sum + (row.type === "income" ? row.amount : -row.amount), 0);

            return (
              <div key={account.id} className={cn("py-3", !account.active && "opacity-55")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated shadow-[var(--shadow-border)]">
                    <Icon className="size-4 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {account.institution || typeInfo.label} · mês {monthMovement >= 0 ? "+" : "−"}{formatBRLCompact(Math.abs(monthMovement))}
                    </p>
                  </div>
                  <p className="shrink-0 font-display text-sm tabular-nums">{formatBRL(calculatedBalance)}</p>
                </div>

                <details className="mt-2 pl-12">
                  <summary className="cursor-pointer text-[10px] font-medium text-muted">Gerenciar conta</summary>
                  <p className="mt-2 text-[10px] text-muted">
                    Movimento desde a base: {movement >= 0 ? "+" : "−"}{formatBRL(Math.abs(movement))}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-primary"
                      onClick={() => updateAccount(account.id, { active: !account.active })}
                    >
                      {account.active ? "Desativar" : "Reativar"}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-danger"
                      onClick={() => {
                        removeAccount(account.id);
                        toast.success("Conta removida");
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-surface p-3 text-sm text-muted">
          Nenhuma conta cadastrada. Adicione apenas as contas que você quer acompanhar.
        </p>
      )}

      {open ? (
        <div className="mt-3 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-medium">Nova conta</p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da conta"
            className="mt-3 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <input
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            placeholder="Banco / instituição"
            className="mt-2 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
                  type === item.id ? "bg-primary text-primary-fg" : "bg-line",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            inputMode="decimal"
            placeholder="Saldo inicial"
            className="mt-2 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                const normalized = balance.replace(/\./g, "").replace(",", ".");
                const value = Number(normalized);
                addAccount({
                  name,
                  institution,
                  type,
                  openingBalance: Number.isFinite(value) ? value : 0,
                });
                setName("");
                setInstitution("");
                setBalance("");
                setType("checking");
                setOpen(false);
                toast.success("Conta adicionada");
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
