import { ArrowDownRight, ArrowUpRight, Minus, Radar } from "lucide-react";
import { categoryLabel } from "@/lib/categories";
import { monthChange } from "@/lib/month-change";
import { formatBRL, formatMonthTitle } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MonthChangeCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const change = monthChange(state, month);

  if (!change.hasComparison) return null;

  const direction = change.delta > 0 ? "up" : change.delta < 0 ? "down" : "flat";
  const percentLabel =
    change.percent === null
      ? "sem base comparável"
      : `${Math.abs(change.percent).toFixed(0)}% ${direction === "up" ? "a mais" : direction === "down" ? "a menos" : "igual"}`;
  const highlight = change.increases[0] ?? change.decreases[0] ?? null;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Radar className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">O que mudou</p>
          <h2 className="font-display text-xl">Comparação com {formatMonthTitle(change.previousMonth)}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Você tem <span className="font-medium text-fg tabular-nums">{formatBRL(change.currentExpense)}</span> em gastos registrados neste mês, {percentLabel} que no anterior.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] text-muted">Mês atual</p>
          <p className="mt-0.5 font-display text-lg tabular-nums">{formatBRL(change.currentExpense)}</p>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] text-muted">Mês anterior</p>
          <p className="mt-0.5 font-display text-lg tabular-nums">{formatBRL(change.previousExpense)}</p>
        </div>
      </div>

      {highlight ? (
        <div className="mt-3 rounded-lg bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
          <div className="flex items-center gap-2 text-sm">
            {highlight.delta > 0 ? (
              <ArrowUpRight className="size-4 shrink-0 text-danger" />
            ) : highlight.delta < 0 ? (
              <ArrowDownRight className="size-4 shrink-0 text-income" />
            ) : (
              <Minus className="size-4 shrink-0 text-muted" />
            )}
            <p className="min-w-0 flex-1">
              <span className="font-medium">{categoryLabel(highlight.category, state.customCategories)}</span>{" "}
              {highlight.delta > 0 ? "subiu" : "caiu"}{" "}
              <span
                className={cn(
                  "font-medium tabular-nums",
                  highlight.delta > 0 ? "text-danger" : "text-income",
                )}
              >
                {formatBRL(Math.abs(highlight.delta))}
              </span>
              {" "}em relação ao mês anterior.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Nenhuma categoria mudou o suficiente para merecer destaque agora.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Comparação baseada apenas no que já está registrado no Núcleo; não é previsão e não usa IA.
      </p>
    </section>
  );
}
