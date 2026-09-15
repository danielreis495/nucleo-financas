import { ArrowDownRight, ArrowUpRight, Minus, Radar } from "lucide-react";
import { categoryLabel } from "@/lib/categories";
import { monthChange } from "@/lib/month-change";
import { formatBRL, formatBRLCompact, formatMonthTitle } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MonthChangeCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const change = monthChange(state, month);

  if (!change.hasComparison) return null;

  const direction = change.delta > 0 ? "up" : change.delta < 0 ? "down" : "flat";
  const highlight = change.increases[0] ?? change.decreases[0] ?? null;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Radar className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Comparação com {formatMonthTitle(change.previousMonth)}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="font-display text-lg tabular-nums">{formatBRL(change.currentExpense)}</p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
                direction === "up"
                  ? "bg-danger-soft text-danger"
                  : direction === "down"
                    ? "bg-primary-soft text-primary"
                    : "bg-line text-muted",
              )}
            >
              <Icon className="size-3" />
              {change.percent === null
                ? "sem base"
                : `${Math.abs(change.percent).toFixed(0)}% ${direction === "up" ? "a mais" : direction === "down" ? "a menos" : "igual"}`}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
        <div>
          <p className="text-[10px] text-muted">Mês anterior</p>
          <p className="mt-0.5 font-display text-sm tabular-nums">{formatBRLCompact(change.previousExpense)}</p>
        </div>
        {highlight ? (
          <div className="max-w-[62%] text-right">
            <p className="truncate text-[10px] text-muted">Maior mudança</p>
            <p className="truncate text-xs font-medium">
              {categoryLabel(highlight.category, state.customCategories)}
              <span className={cn("ml-1 tabular-nums", highlight.delta > 0 ? "text-danger" : "text-income")}>
                {highlight.delta > 0 ? "+" : "−"}{formatBRLCompact(Math.abs(highlight.delta))}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
