import { useState } from "react";
import { Building2, CreditCard, Landmark, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
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
  const accounts = useFinanceStore((s) => s.accounts);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const removeAccount = useFinanceStore((s) => s.removeAccount);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [balance, setBalance] = useState("");

  const total = accounts.filter((a) => a.active).reduce((sum, a) => sum + a.openingBalance, 0);

  return (
    <section className="mt-6 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Contas e saldos</p>
          <h2 className="mt-1 font-display text-2xl">{formatBRL(total)}</h2>
          <p className="mt-1 text-xs text-muted">
            Saldo informado das contas ativas. Nesta etapa, os lançamentos ainda não alteram esse valor.
          </p>
        </div>
        <Button variant="secondary" size="icon" aria-label="Adicionar conta" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" />
        </Button>
      </div>

      {accounts.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {accounts.map((account) => {
            const typeInfo = TYPES.find((t) => t.id === account.type) ?? TYPES[4];
            const Icon = typeInfo.icon;
            return (
              <div key={account.id} className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-line">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate text-xs text-muted">{account.institution || typeInfo.label}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatBRL(account.openingBalance)}</p>
                </div>
                <div className="mt-2 flex gap-3">
                  <button
                    className={cn("text-xs", account.active ? "text-muted" : "text-danger")}
                    onClick={() => updateAccount(account.id, { active: !account.active })}
                  >
                    {account.active ? "Desativar" : "Reativar"}
                  </button>
                  <button
                    className="text-xs text-danger"
                    onClick={() => {
                      removeAccount(account.id);
                      toast.success("Conta removida");
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-muted">
          Nenhuma conta cadastrada ainda. Adicione apenas os saldos que você quer acompanhar.
        </p>
      )}

      {open ? (
        <div className="mt-4 rounded-lg bg-surface p-3">
          <h3 className="text-sm font-medium">Nova conta</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Conta principal)"
            className="mt-3 h-11 w-full rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Banco / instituição"
            className="mt-2 h-11 w-full rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TYPES.map((item) => (
              <button
                key={item.id}
                onClick={() => setType(item.id)}
                className={cn(
                  "h-9 rounded-full px-3 text-xs font-medium",
                  type === item.id ? "bg-primary text-primary-fg" : "bg-line",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            inputMode="decimal"
            placeholder="Saldo atual (ex.: 1250,50)"
            className="mt-2 h-11 w-full rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
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
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
