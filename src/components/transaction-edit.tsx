import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { CategoryPicker } from "@/components/category-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { findTransferCandidate } from "@/lib/integrity";
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
  const setTransfer = useFinanceStore((s) => s.setTransactionTransfer);
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const transactions = useFinanceStore((s) => s.transactions);
  const live = useFinanceStore((s) => s.transactions.find((t) => t.id === tx.id)) ?? tx;

  const [merchant, setMerchant] = useState(live.merchant);
  const [description, setDescription] = useState(live.description);
  const [date, setDate] = useState(live.date);
  const [amountText, setAmountText] = useState(formatEditAmount(live.amount));

  const account = accounts.find((a) => a.id === live.accountId);
  const transferAccount = accounts.find((a) => a.id === live.transferAccountId);
  const candidate = !live.transferId ? findTransferCandidate(live, transactions) : null;
  const candidateAccount = candidate ? accounts.find((a) => a.id === candidate.accountId) : null;

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

          {live.transferId ? (
            <div className="mt-4 rounded-xl bg-primary-soft p-4 text-primary">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="size-4" />
                <p className="font-medium">Transferência entre contas</p>
              </div>
              <p className="mt-1 text-sm text-primary/80">
                {account?.name ?? "Conta"} ↔ {transferAccount?.name ?? "outra conta"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-primary/75">
                Movimenta os saldos das contas, mas não entra como renda, gasto, categoria ou análise do Consultor.
              </p>
              <button
                type="button"
                className="mt-3 h-9 rounded-full bg-elevated px-3 text-xs font-medium text-primary shadow-[var(--shadow-border)]"
                onClick={() => {
                  setTransfer(live.id, null);
                  onClose();
                }}
              >
                Desfazer transferência
              </button>
            </div>
          ) : (
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
          )}

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

          {!live.transferId ? (
            <>
              <p className="mt-4 mb-2 text-xs font-medium text-muted">Categoria</p>
              <CategoryPicker
                value={live.category}
                group={live.type === "income" ? "entrada" : "gasto"}
                onChange={(id) => update(live.id, { category: id })}
              />

              <p className="mt-4 mb-2 text-xs font-medium text-muted">Conta</p>
              <div className="mb-1 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => update(live.id, { accountId: null })}
                  className={cn(
                    "h-9 rounded-full px-3 text-xs font-medium",
                    !live.accountId ? "bg-primary text-primary-fg" : "bg-line text-fg",
                  )}
                >
                  Sem conta
                </button>
                {accounts.filter((a) => a.active || a.id === live.accountId).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update(live.id, { accountId: item.id })}
                    className={cn(
                      "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                      live.accountId === item.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              {accounts.length === 0 ? (
                <p className="mb-4 text-xs text-muted">Cadastre uma conta em Casa para vinculá-la aos lançamentos.</p>
              ) : (
                <p className="mb-4 text-xs text-muted">Lançamentos antigos continuam sem conta até você escolher uma.</p>
              )}

              <div className="mt-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="size-4 text-primary" />
                  <p className="text-sm font-medium">Foi entre suas contas?</p>
                </div>
                {candidate && candidateAccount ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Encontrei uma movimentação oposta de {formatBRL(candidate.amount)} em {candidateAccount.name}, próxima desta data. Se for sua, o Núcleo vincula as duas.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Marque PIX, TED ou transferência feita entre contas que pertencem a você. Isso evita contar o movimento como renda ou gasto.
                  </p>
                )}
                {live.accountId ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {accounts
                      .filter((item) => item.active && item.id !== live.accountId)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            saveCore();
                            setTransfer(live.id, item.id);
                          }}
                          className={cn(
                            "h-9 rounded-full px-3 text-xs font-medium",
                            candidate?.accountId === item.id
                              ? "bg-primary text-primary-fg"
                              : "bg-primary-soft text-primary",
                          )}
                        >
                          {live.type === "expense" ? `Para ${item.name}` : `De ${item.name}`}
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-medium text-warn">Escolha primeiro a conta deste lançamento.</p>
                )}
              </div>
            </>
          ) : null}

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
