import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/category-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { formatBRL, parseLooseAmount } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import type { Transaction, TxType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TransactionEdit({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const update = useFinanceStore((s) => s.updateTransaction);
  const people = useFinanceStore((s) => s.people);
  const live = useFinanceStore((s) => s.transactions.find((t) => t.id === tx.id)) ?? tx;

  const [merchant, setMerchant] = useState(live.merchant);
  const [description, setDescription] = useState(live.description);
  const [date, setDate] = useState(live.date);
  const [amountText, setAmountText] = useState(formatEditAmount(live.amount));

  useEffect(() => {
    setMerchant(live.merchant);
    setDescription(live.description);
    setDate(live.date);
    setAmountText(formatEditAmount(live.amount));
  }, [live.id]);

  function saveCore() {
    const amount = parseLooseAmount(amountText);
    update(live.id, {
      merchant: merchant.trim() || live.merchant,
      description: description.trim() || merchant.trim() || live.description,
      date,
      amount: amount > 0 ? amount : live.amount,
    });
  }

  function setType(type: TxType) {
    update(live.id, {
      type,
      category: type === "income" && live.type !== "income" ? "salario" : live.category,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        className="absolute inset-0 bg-ink/40"
        aria-label="Fechar"
        onClick={() => {
          saveCore();
          onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-[430px] flex-col rounded-t-2xl bg-elevated pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-border)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
        <div className="overflow-y-auto px-5 pt-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Editar lançamento</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{formatBRL(live.amount)}</p>

          <div className="mt-4 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={cn(
                "h-9 rounded-full text-xs font-medium",
                live.type === "expense" ? "bg-primary text-primary-fg" : "bg-line",
              )}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={cn(
                "h-9 rounded-full text-xs font-medium",
                live.type === "income" ? "bg-primary text-primary-fg" : "bg-line",
              )}
            >
              Entrada
            </button>
          </div>

          <label className="mt-4 block text-xs font-medium text-muted">Nome / loja</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />

          <label className="mt-3 block text-xs font-medium text-muted">Detalhe</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted">Valor</label>
              <input
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm tabular-nums shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
              />
            </div>
          </div>

          <p className="mt-4 mb-2 text-xs font-medium text-muted">Categoria</p>
          <CategoryPicker
            value={live.category}
            group={live.type === "income" ? "entrada" : "gasto"}
            onChange={(id) => update(live.id, { category: id })}
          />

          <p className="mt-4 mb-2 text-xs font-medium text-muted">Quem</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => update(live.id, { personId: p.id })}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                  live.personId === p.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
                )}
              >
                <PersonAvatar person={p} size="sm" />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pt-1">
          <Button
            className="w-full"
            onClick={() => {
              saveCore();
              onClose();
            }}
          >
            Pronto
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatEditAmount(n: number) {
  return n.toFixed(2).replace(".", ",");
}
