import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Layers } from "lucide-react";
import type { ExtractedItem, FinancialDocumentSummary } from "@/lib/types";
import type { ImportOrigin } from "@/lib/transaction-origin";
import { categoryLabel } from "@/lib/categories";
import { rememberCategoryRule } from "@/lib/category-rules";
import { rememberMerchantAlias } from "@/lib/merchant-aliases";
import { isExpenseRefund, NATURE_LABEL, natureOf } from "@/lib/movement-nature";
import { formatBRL, formatShortDate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useFinanceStore } from "@/lib/store";
import { PersonAvatar } from "./person-avatar";
import { CategoryPicker } from "./category-picker";
import { MovementKindPicker } from "./movement-kind-picker";
import { Button } from "./ui/button";

export function CaptureReview({
  items,
  accountId,
  duplicateSummary,
  documentSummary,
  importOrigin,
  onAccountChange,
  onCardOriginChange,
  onChange,
  onConfirm,
  onCancel,
}: {
  items: ExtractedItem[];
  accountId: string | null;
  duplicateSummary?: { possibleCount: number; exactCount: number } | null;
  documentSummary?: FinancialDocumentSummary | null;
  importOrigin?: ImportOrigin | null;
  onAccountChange: (accountId: string | null) => void;
  onCardOriginChange: (institution: "Itaú" | "Nubank") => void;
  onChange: (items: ExtractedItem[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const custom = useFinanceStore((s) => s.customCategories);
  const selected = items.filter((i) => i.selected);
  const selectedCount = selected.length;
  const excludedCount = selected.filter((i) => natureOf(i) !== "budget").length;
  const netOutflow = selected.reduce(
    (total, item) => total + (item.type === "income" ? -item.amount : item.amount),
    0,
  );
  const netLabel = netOutflow >= 0 ? "Saída líquida" : "Entrada líquida";
  const attentionCount = selected.filter((item) => {
    const merchant = item.merchant.trim().toLowerCase();
    return (
      merchant === "favorecido não identificado" ||
      merchant === "favorecido nao identificado" ||
      item.category === "outros"
    );
  }).length;

  const officialBillTotal =
    documentSummary?.kind === "credit_card_bill" && typeof documentSummary.billTotal === "number"
      ? documentSummary.billTotal
      : null;
  const billItems = selected.filter((item) => natureOf(item) === "budget");
  const billNetOutflow = billItems.reduce(
    (total, item) => total + (item.type === "income" ? -item.amount : item.amount),
    0,
  );
  const billDifference = officialBillTotal === null ? null : billNetOutflow - officialBillTotal;
  const billMatches = billDifference !== null && Math.abs(billDifference) <= 0.05;
  const billMismatch = officialBillTotal !== null && !billMatches;

  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmBillMismatch, setConfirmBillMismatch] = useState(false);

  function patch(id: string, next: Partial<ExtractedItem>) {
    setConfirmBillMismatch(false);
    onChange(items.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }

  const possibleLabel = duplicateSummary
    ? `${duplicateSummary.possibleCount} ${duplicateSummary.possibleCount === 1 ? "lançamento parece" : "lançamentos parecem"} já existir.`
    : "";
  const exactLabel = duplicateSummary?.exactCount
    ? `${duplicateSummary.exactCount} ${duplicateSummary.exactCount === 1 ? "correspondência exata foi desmarcada" : "correspondências exatas foram desmarcadas"}.`
    : "";

  function handleConfirm() {
    if (billMismatch && !confirmBillMismatch) {
      setConfirmBillMismatch(true);
      return;
    }
    onConfirm();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-3 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Conferência</p>
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Revise antes de salvar</h1>
            <p className="mt-1 text-sm text-muted">
              {items.length} encontrado{items.length === 1 ? "" : "s"} · {selectedCount} selecionado{selectedCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{netLabel}</p>
            <p className="font-display text-lg tabular-nums">{formatBRL(Math.abs(netOutflow))}</p>
          </div>
        </div>

        {officialBillTotal !== null ? (
          <div
            className={cn(
              "mt-4 rounded-xl px-3 py-2.5 text-sm",
              billMatches ? "bg-primary-soft text-primary" : "bg-warn-soft text-warn",
            )}
          >
            <div className="flex items-start gap-2">
              {billMatches ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {billMatches ? "Total da fatura confere" : "A fatura precisa de revisão"}
                </p>
                <p className="mt-1 text-xs leading-relaxed opacity-90">
                  Oficial: {formatBRL(officialBillTotal)} · Lido: {formatBRL(Math.abs(billNetOutflow))}
                  {!billMatches && billDifference !== null
                    ? ` · diferença de ${formatBRL(Math.abs(billDifference))}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {attentionCount > 0 || (duplicateSummary?.possibleCount ?? 0) > 0 ? (
          <div className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
            {attentionCount > 0 ? (
              <p className="font-medium">
                {attentionCount} {attentionCount === 1 ? "item precisa" : "itens precisam"} de revisão
              </p>
            ) : null}
            {duplicateSummary && duplicateSummary.possibleCount > 0 ? (
              <p className={cn("text-xs leading-relaxed", attentionCount > 0 && "mt-1")}>
                {possibleLabel} {exactLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed">
                Itens em “Outros” ou sem favorecido claro estão destacados na lista.
              </p>
            )}
          </div>
        ) : null}

        <details className="group mt-3 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            Origem e conta
            <span className="ml-2 text-xs font-normal text-muted">
              {importOrigin?.originLabel ?? "Não identificada"}
            </span>
          </summary>

          <div className="border-t border-line px-4 pb-4 pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Origem</p>
            <p className="mt-1 text-sm font-medium">{importOrigin?.originLabel ?? "Não identificada"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["Itaú", "Nubank"] as const).map((institution) => {
                const selectedCard =
                  importOrigin?.originKind === "credit_card" &&
                  importOrigin.originInstitution === institution;
                return (
                  <button
                    key={institution}
                    type="button"
                    onClick={() => {
                      onAccountChange(null);
                      onCardOriginChange(institution);
                    }}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs font-medium",
                      selectedCard ? "bg-primary text-primary-fg" : "bg-line text-fg",
                    )}
                  >
                    Cartão {institution}
                  </button>
                );
              })}
            </div>

            <p className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-wide text-muted">Conta</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onAccountChange(null)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium",
                  accountId === null ? "bg-primary text-primary-fg" : "bg-line text-fg",
                )}
              >
                Sem conta
              </button>
              {accounts.filter((a) => a.active).map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onAccountChange(account.id)}
                  className={cn(
                    "h-8 max-w-full truncate rounded-full px-3 text-xs font-medium",
                    accountId === account.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
                  )}
                >
                  {account.name}
                </button>
              ))}
            </div>
            {accounts.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Nenhuma conta cadastrada.</p>
            ) : null}
          </div>
        </details>
      </header>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4 pt-1">
        {items.map((item) => {
          const person = people.find((p) => p.id === item.personId) ?? people[0];
          const open = openId === item.id;
          const nature = natureOf(item);
          const refund = isExpenseRefund(item);
          const needsAttention =
            item.category === "outros" || /favorecido n[aã]o identificado/i.test(item.merchant);
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-xl bg-elevated p-3 shadow-[var(--shadow-border)] transition-opacity",
                !item.selected && "opacity-45",
                item.selected && needsAttention && "ring-1 ring-warn/35",
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                    item.selected
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border bg-surface text-transparent",
                  )}
                  aria-label={item.selected ? "Desmarcar" : "Marcar"}
                  onClick={() => patch(item.id, { selected: !item.selected })}
                >
                  <Check className="size-3.5" strokeWidth={2.5} />
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : item.id)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{item.merchant}</p>
                    <p
                      className={cn(
                        "font-display text-lg tabular-nums leading-none",
                        item.type === "income" ? "text-income" : "text-fg",
                      )}
                    >
                      {item.type === "income" ? "+" : "−"}
                      {formatBRL(item.amount)}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {item.description} · {formatShortDate(item.date)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {needsAttention ? (
                      <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                        Revisar
                      </span>
                    ) : null}
                    {refund ? (
                      <span className="rounded-full bg-line px-2.5 py-1 text-xs font-medium text-income">
                        Estorno / crédito
                      </span>
                    ) : null}
                    {nature === "budget" ? (
                      <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                        {categoryLabel(item.category, custom)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-line px-2.5 py-1 text-xs font-medium text-fg">
                        {NATURE_LABEL[nature]}
                      </span>
                    )}
                    {person ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-line px-2 py-1 text-xs font-medium">
                        <PersonAvatar person={person} size="sm" />
                        {person.name}
                      </span>
                    ) : null}
                    {item.installment ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                        <Layers className="size-3" />
                        {item.installment.current}/{item.installment.total}
                      </span>
                    ) : null}
                  </div>
                </button>
              </div>

              {open ? (
                <div className="mt-3 border-t border-line pt-3">
                  <label className="mb-1 block text-xs font-medium text-muted">Nome / loja</label>
                  <input
                    key={`${item.id}:${item.merchant}`}
                    defaultValue={item.merchant}
                    onBlur={(e) => {
                      const next = e.currentTarget.value.trim();
                      if (!next || next === item.merchant) return;
                      rememberMerchantAlias(item.merchant, next);
                      patch(item.id, { merchant: next });
                    }}
                    className="h-10 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Se corrigir o nome aqui, o Núcleo aprende para próximas importações. O detalhe original continua logo abaixo do lançamento para conferência.
                  </p>

                  <p className="mt-3 mb-2 text-xs font-medium text-muted">Como entra no orçamento</p>
                  <MovementKindPicker
                    type={item.type}
                    nature={item.nature}
                    onChange={(next) =>
                      patch(item.id, {
                        ...next,
                        natureLocked: true,
                        category:
                          next.nature === "budget" && next.type === "income" && !refund
                            ? "salario"
                            : item.category,
                      })
                    }
                  />

                  {nature === "budget" ? (
                    <>
                      <p className="mt-3 mb-2 text-xs font-medium text-muted">Categoria</p>
                      <CategoryPicker
                        value={item.category}
                        group={refund ? "gasto" : item.type === "income" ? "entrada" : "gasto"}
                        onChange={(id) => {
                          rememberCategoryRule(item.merchant, id);
                          patch(item.id, { category: id });
                        }}
                      />
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        Ao corrigir a categoria, o Núcleo aprende este estabelecimento para próximas importações.
                      </p>
                    </>
                  ) : null}

                  <p className="mt-3 mb-2 text-xs font-medium text-muted">Quem</p>
                  <div className="flex flex-wrap gap-1.5">
                    {people.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => patch(item.id, { personId: p.id })}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                          item.personId === p.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
                        )}
                      >
                        <PersonAvatar person={p} size="sm" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md">
        {confirmBillMismatch ? (
          <div className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
            A diferença da fatura continua em {formatBRL(Math.abs(billDifference ?? 0))}. Confira os itens acima. Se estiver correto mesmo assim, toque novamente em “Lançar mesmo assim”.
          </div>
        ) : null}
        <div className="mb-2 flex items-end justify-between gap-3 text-sm">
          <span className="text-muted">
            {selectedCount} selecionados{excludedCount > 0 ? ` · ${excludedCount} fora do orçamento` : ""}
          </span>
          <div className="text-right">
            <p className="text-[10px] font-medium tracking-wide text-muted uppercase">{netLabel}</p>
            <p className="font-display text-lg tabular-nums">{formatBRL(Math.abs(netOutflow))}</p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Descartar
          </Button>
          <Button disabled={selectedCount === 0} onClick={handleConfirm}>
            {confirmBillMismatch ? "Lançar mesmo assim" : "Lançar"}
          </Button>
        </div>
      </div>
    </div>
  );
}