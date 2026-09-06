import { useState } from "react";
import { Check, Layers } from "lucide-react";
import type { ExtractedItem } from "@/lib/types";
import { categoryLabel } from "@/lib/categories";
import { formatBRL, formatShortDate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useFinanceStore } from "@/lib/store";
import { PersonAvatar } from "./person-avatar";
import { CategoryPicker } from "./category-picker";
import { Button } from "./ui/button";

export function CaptureReview({
  items,
  accountId,
  duplicateSummary,
  onAccountChange,
  onChange,
  onConfirm,
  onCancel,
}: {
  items: ExtractedItem[];
  accountId: string | null;
  duplicateSummary?: { possibleCount: number; exactCount: number } | null;
  onAccountChange: (accountId: string | null) => void;
  onChange: (items: ExtractedItem[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const custom = useFinanceStore((s) => s.customCategories);
  const selectedCount = items.filter((i) => i.selected).length;
  const total = items.filter((i) => i.selected).reduce((a, i) => a + i.amount, 0);
  const [openId, setOpenId] = useState<string | null>(null);

  function patch(id: string, next: Partial<ExtractedItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }

  const possibleLabel = duplicateSummary
    ? `${duplicateSummary.possibleCount} ${duplicateSummary.possibleCount === 1 ? "lançamento parece" : "lançamentos parecem"} já existir.`
    : "";
  const exactLabel = duplicateSummary?.exactCount
    ? `${duplicateSummary.exactCount} ${duplicateSummary.exactCount === 1 ? "correspondência exata foi desmarcada" : "correspondências exatas foram desmarcadas"}.`
    : "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pt-6 pb-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Conferir e tocar</p>
        <h1 className="font-display text-3xl tracking-tight">Encontrei {items.length}</h1>
        <p className="mt-1 text-sm text-muted">Toque na categoria ou na pessoa para trocar. Nada de teclado.</p>

        {duplicateSummary && duplicateSummary.possibleCount > 0 ? (
          <div className="mt-4 rounded-lg bg-warn-soft px-3 py-2.5 text-sm text-warn">
            <p className="font-medium">
              {possibleLabel} {exactLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              Revise antes de lançar. Você pode marcar novamente um item legítimo.
            </p>
          </div>
        ) : null}

        <p className="mt-4 mb-2 text-xs font-medium text-muted">Conta dos lançamentos</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onAccountChange(null)}
            className={cn(
              "h-9 rounded-full px-3 text-xs font-medium",
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
                "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                accountId === account.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
              )}
            >
              {account.name}
            </button>
          ))}
        </div>
        {accounts.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Cadastre uma conta em Casa para vincular a importação.</p>
        ) : null}
      </header>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {items.map((item) => {
          const person = people.find((p) => p.id === item.personId) ?? people[0];
          const open = openId === item.id;
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-xl bg-elevated p-3 shadow-[var(--shadow-border)] transition-opacity",
                !item.selected && "opacity-45",
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
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                      {categoryLabel(item.category, custom)}
                    </span>
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
                  <p className="mb-2 text-xs font-medium text-muted">Categoria</p>
                  <CategoryPicker
                    value={item.category}
                    group={item.type === "income" ? "entrada" : "gasto"}
                    onChange={(id) => patch(item.id, { category: id })}
                  />
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
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">{selectedCount} selecionados</span>
          <span className="font-display text-lg tabular-nums">{formatBRL(total)}</span>
        </div>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Descartar
          </Button>
          <Button disabled={selectedCount === 0} onClick={onConfirm}>
            Lançar
          </Button>
        </div>
      </div>
    </div>
  );
}
