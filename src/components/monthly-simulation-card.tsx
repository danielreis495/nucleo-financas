import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/lib/money";
import {
  actualMonthlyResult,
  calculateMonthlySimulation,
  monthlySimulationReference,
  saveMonthlySimulationReference,
  type MonthlySimulationReference,
} from "@/lib/monthly-simulation";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

export function MonthlySimulationCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const isCurrent = month === currentMonth;
  const isClosed = month < currentMonth;

  const simulation = useMemo(() => calculateMonthlySimulation(state, month), [state, month]);
  const actual = useMemo(() => actualMonthlyResult(state, month), [state, month]);
  const [reference, setReference] = useState<MonthlySimulationReference | null>(null);

  useEffect(() => {
    const saved = monthlySimulationReference(month);
    if (saved) {
      setReference(saved);
      return;
    }

    if (isCurrent && (simulation.expectedIncome > 0 || simulation.projectedExpense > 0)) {
      const created = saveMonthlySimulationReference(simulation, today);
      if (created) setReference(created);
    } else {
      setReference(null);
    }
  }, [
    isCurrent,
    month,
    simulation.expectedIncome,
    simulation.projectedExpense,
    simulation.projectedResult,
    today,
  ]);

  const margin = simulation.projectedResult;
  const positive = margin >= 0;
  const spendRatio =
    simulation.expectedIncome > 0
      ? simulation.projectedExpense / simulation.expectedIncome
      : simulation.projectedExpense > 0
        ? 1.2
        : 0;
  const barWidth = Math.min(100, Math.max(0, spendRatio * 100));

  const referenceDifference = isClosed && reference ? actual.result - reference.projectedResult : null;
  const almostMatched = referenceDifference !== null && Math.abs(referenceDifference) <= 5;

  if (isClosed) {
    return (
      <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Fechamento do mês</p>
            <h2 className="font-display text-lg">Previsto x realizado</h2>
          </div>
        </div>

        {reference ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Previsão" value={reference.projectedResult} />
              <Metric label="Realizado" value={actual.result} />
            </div>
            <div
              className={cn(
                "mt-2 flex items-start gap-2 rounded-lg px-3 py-2.5",
                almostMatched || (referenceDifference ?? 0) >= 0
                  ? "bg-primary-soft text-primary"
                  : "bg-warn-soft text-warn",
              )}
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs leading-relaxed">
                {almostMatched
                  ? `Previsão quase exata: diferença de ${formatBRL(Math.abs(referenceDifference ?? 0))}.`
                  : (referenceDifference ?? 0) >= 0
                    ? `Fechou ${formatBRL(Math.abs(referenceDifference ?? 0))} melhor que a previsão.`
                    : `Fechou ${formatBRL(Math.abs(referenceDifference ?? 0))} abaixo da previsão.`}
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-surface px-3 py-2.5 text-xs leading-relaxed text-muted">
            Não havia uma previsão salva para comparar com o fechamento deste mês.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Gauge className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Projeção do mês</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className={cn("font-display text-2xl tabular-nums", !positive && "text-danger")}>
              {formatBRL(margin)}
            </p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
                positive ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger",
              )}
            >
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {positive ? "Sobra prevista" : "Déficit previsto"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-lg bg-surface shadow-[var(--shadow-border)]">
        <MiniMetric label="Receita" value={simulation.expectedIncome} />
        <MiniMetric label="Despesas" value={simulation.projectedExpense} />
        <MiniMetric label="Já saiu" value={simulation.realizedExpense} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
          <span>Receita comprometida</span>
          <span className="tabular-nums">
            {simulation.expectedIncome > 0 ? `${Math.round(spendRatio * 100)}%` : "sem receita prevista"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              "h-full rounded-full",
              spendRatio > 1 ? "bg-danger" : spendRatio >= 0.9 ? "bg-warn" : "bg-primary",
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <details className="group mt-3 border-t border-line pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-primary">
          Ver composição da projeção
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Já recebido" value={simulation.receivedIncome} />
          <Metric label="Ainda cadastrado" value={simulation.scheduledExpense} />
          <Metric label="Salário previsto" value={simulation.salaryExpected} />
          <Metric label="Entradas manuais" value={simulation.manualPlannedIncome} />
        </div>
        {reference ? (
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            Referência salva em {formatShortDate(reference.capturedAt)}: {formatBRL(reference.projectedResult)}.
          </p>
        ) : null}
      </details>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5">
      <p className="truncate text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 truncate font-display text-sm tabular-nums">{formatBRLCompact(value)}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 font-display text-base tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}
