import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/category-picker";
import { MovementKindPicker } from "@/components/movement-kind-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { rememberCategoryRule } from "@/lib/category-rules";
import { rememberMerchantAlias } from "@/lib/merchant-aliases";
import { natureOf } from "@/lib/movement-nature";
import { formatBRL, parseLooseAmount } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { cn, monthKey } from "@/lib/utils";

export function TransactionEdit({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const update = useFinanceStore((s) => s.updateTransaction);
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const transactions = useFinanceStore((s) => s.transactions);
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

  function assignCreditCard(institution: "Nubank" | "Itaú") {
    const related = live.installmentId
      ? transactions.filter((row) => row.installmentId === live.installmentId)
      : [live];

    for (const row of related) {
      const rowDate = row.id === live.id ? date || row.date : row.date;
      update(row.id, {
        accountId: null,
        originKind: "credit_card",
        originInstitution: institution,
        originLabel: `Cartão ${institution}`,
        paymentMethod: "Cartão de crédito",
        competenceMonth:
          row.originKind === "credit_card" && row.competenceMonth
            ? row.competenceMonth
            : monthKey(rowDate),
      });
    }
  }

  function saveCore() {
    const amount = parseLooseAmount(amountText);
    const nextMerchant = merchant.trim() || live.merchant;
    if (live.source !== "manual" && nextMerchant !== live.merchant) {
      rememberMerchantAlias(live.merchant, nextMerchant);
    }
    update(live.id, {
      merchant: nextMerchant,
      description: description.trim() || nextMerchant || live.description,
      date,
      amount: amount > 0 ? amount : live.amount,
    });
  }

  const nature = natureOf(live);
  const originLabel = live.originLabel?.trim() || "Origem não identificada";

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

          <div className="mt-4 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Origem do lançamento</p>
            <p className="mt-1 text-sm font-medium">{originLabel}</p>
            <p className="mt-1 text-xs text-muted">
              {live.paymentMethod ? `Movimento: ${live.paymentMethod}` : "Forma do movimento não identificada"}
            </p>
            {live.originKind === "credit_card" && live.competenceMonth ? (
              <p className="mt-1 text-xs font-medium text-muted">
                Competência da fatura: {formatCompetenceMonth(live.competenceMonth)}
              </p>
            ) : null}
            {live.sourceFileName ? (
              <p className="mt-1 break-all text-[11px] text-muted">Arquivo: {live.sourceFileName}</p>
            ) : null}
            {!live.originLabel ? (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Este lançamento é anterior ao rastreamento de origem. Reimporte o documento correspondente para identificá-lo sem duplicar a despesa.
              </p>
            ) : null}
          </div>

          <p className="mt-4 mb-2 text-xs font-medium text-muted">Como entra no orçamento</p>
          <MovementKindPicker
            type={live.type}
            nature={live.nature}
            onChange={(next) =>
              update(live.id, {
                ...next,
                natureLocked: true,
                category: next.nature === "budget" && next.type === "income" ? "salario" : live.category,
              })
            }
          />

          <label className="mt-4 block text-xs font-medium text-muted">Nome / loja</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          {live.source !== "manual" ? (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Se você corrigir este nome, o Núcleo aprende a mesma correção para próximas importações. O detalhe abaixo permanece disponível para conferência.
            </p>
          ) : null}

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
              <label className="block text-xs font-medium text-muted">Data da compra/movimento</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
              />
            </div>
          </div>

          {nature === "budget" ? (
            <>
              <p className="mt-4 mb-2 text-xs font-medium text-muted">Categoria</p>
              <CategoryPicker
                value={live.category}
                group={live.type === "income" ? "entrada" : "gasto"}
                onChange={(id) => {
                  rememberCategoryRule(merchant.trim() || live.merchant, id);
                  update(live.id, { category: id });
                }}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Esta correção de categoria será reaplicada automaticamente quando o mesmo estabelecimento aparecer de novo.
              </p>
            </>
          ) : null}

          <p className="mt-4 mb-2 text-xs font-medium text-muted">Conta / cartão</p>
          <div className="mb-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                const patch: Partial<Transaction> = { accountId: null };
                if (live.originKind === "credit_card") {
                  patch.originKind = live.source === "manual" ? "manual" : "unknown";
                  patch.originInstitution = undefined;
                  patch.originLabel = live.source === "manual" ? "Lançamento manual" : undefined;
                  patch.paymentMethod = undefined;
                  patch.competenceMonth = undefined;
                }
                update(live.id, patch);
              }}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium",
                !live.accountId && live.originKind !== "credit_card"
                  ? "bg-primary text-primary-fg"
                  : "bg-line text-fg",
              )}
            >
              Sem conta
            </button>
            {accounts.filter((a) => a.active || a.id === live.accountId).map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() =>
                  update(live.id, {
                    accountId: account.id,
                    originKind: "bank_account",
                    originInstitution: account.institution || account.name,
                    originLabel: `Conta ${account.institution || account.name}`,
                    competenceMonth: undefined,
                    paymentMethod: live.originKind === "credit_card" ? undefined : live.paymentMethod,
                  })
                }
                className={cn(
                  "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                  live.accountId === account.id && live.originKind !== "credit_card"
                    ? "bg-primary text-primary-fg"
                    : "bg-line text-fg",
                )}
              >
                {account.name}
              </button>
            ))}
            {(["Nubank", "Itaú"] as const).map((institution) => (
              <button
                key={`card-${institution}`}
                type="button"
                onClick={() => assignCreditCard(institution)}
                className={cn(
                  "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                  live.originKind === "credit_card" && live.originInstitution === institution
                    ? "bg-primary text-primary-fg"
                    : "bg-line text-fg",
                )}
              >
                Cartão {institution}
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Conta bancária movimenta o saldo da conta. Cartão entra na fatura e não reduz o saldo bancário na hora.
            {live.installmentId ? " Ao escolher um cartão, as parcelas relacionadas também são vinculadas a ele." : ""}
          </p>

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

function formatCompetenceMonth(key: string) {
  const [year, month] = key.split("-");
  return month && year ? `${month}/${year}` : key;
}
