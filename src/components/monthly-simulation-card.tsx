import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { formatBRL, formatShortDate } from "@/lib/money";
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

  const simulation = useMemo(
    () => calculateMonthlySimulation(state, month),
    [state, month],
  );
  const actual = useMemo(() => actualMonthlyResult(state, month), [state, month]);
  const [reference, setReference] = useState<MonthlySimulationReference | null>(null);

  useEffect(() => {
    const saved = monthlySimulationReference(month);
    if (saved) {
      setReference(saved);
      return;
    }

    if (
      isCurrent &&
      (simulation.expectedIncome > 0 || simulation.projectedExpense > 0)
    ) {
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

  const referenceDifference =
    isClosed && reference ? actual.result - reference.projectedResult : null;
  const almostMatched =
    referenceDifference !== null && Math.abs(referenceDifference) <= 5;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Gauge className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            Simulação do mês
          </p>
          <h2 className="font-display text-xl">
            {isClosed ? "Previsto x realizado" : "Como o mês tende a fechar"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Usa apenas receitas previstas e despesas que já estão realizadas ou cadastradas.
          </p>
        </div>
      </div>

      {!isClosed ? (
        <>
          <div className="mt-4 rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Resultado projetado</p>
                <p
                  className={cn(
                    "mt-1 font-display text-3xl tabular-nums",
                    !positive && "text-danger",
                  )}
                >
                  {formatBRL(margin)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium",
                  positive
                    ? "bg-primary-soft text-primary"
                    : "bg-danger-soft text-danger",
                )}
              >
                {positive ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {positive ? "Dentro" : "Fora"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {positive
                ? `${formatBRL(margin)} ainda ficam livres dentro da receita prevista.`
                : `As despesas projetadas estão ${formatBRL(Math.abs(margin))} acima da receita prevista.`}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Receita esperada" value={simulation.expectedIncome} />
            <Metric label="Despesa projetada" value={simulation.projectedExpense} />
            <Metric label="Já saiu" value={simulation.realizedExpense} />
            <Metric label="Ainda cadastrado" value={simulation.scheduledExpense} />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted">
              <span>Comprometimento da receita prevista</span>
              <span className="tabular-nums">
                {simulation.expectedIncome > 0
                  ? `${Math.round(spendRatio * 100)}%`
                  : "sem receita prevista"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div
                className={cn(
                  "h-full rounded-full",
                  spendRatio > 1 ? "bg-danger" : spendRatio >= 0.9 ? "bg-warn" : "bg-primary",
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Receita: {formatBRL(simulation.receivedIncome)} já recebidos
            {simulation.salaryExpected > 0
              ? ` + ${formatBRL(simulation.salaryExpected)} de salário previsto`
              : ""}
            {simulation.manualPlannedIncome > 0
              ? ` + ${formatBRL(simulation.manualPlannedIncome)} previstos por você`
              : ""}.
          </p>

          {reference ? (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Referência para conferir no fechamento registrada em{" "}
              {formatShortDate(reference.capturedAt)}: resultado previsto de{" "}
              {formatBRL(reference.projectedResult)}.
            </p>
          ) : null}
        </>
      ) : reference ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="text-[11px] text-muted">Previsão salva</p>
              <p className="mt-1 font-display text-xl tabular-nums">
                {formatBRL(reference.projectedResult)}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                em {formatShortDate(reference.capturedAt)}
              </p>
            </div>
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="text-[11px] text-muted">Realizado no mês</p>
              <p className="mt-1 font-display text-xl tabular-nums">
                {formatBRL(actual.result)}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                {formatBRL(actual.income)} entrou · {formatBRL(actual.expense)} saiu
              </p>
            </div>
          </div>

          <div
            className={cn(
              "mt-3 rounded-lg p-3",
              almostMatched
                ? "bg-primary-soft text-primary"
                : referenceDifference !== null && referenceDifference >= 0
                  ? "bg-primary-soft text-primary"
                  : "bg-warn-soft text-warn",
            )}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {almostMatched
                    ? "A previsão bateu praticamente em cheio"
                    : referenceDifference !== null && referenceDifference >= 0
                      ? "O mês fechou melhor que a previsão"
                      : "O mês fechou abaixo da previsão"}
                </p>
                <p className="mt-1 text-xs leading-relaxed">
                  {almostMatched
                    ? `Diferença de apenas ${formatBRL(Math.abs(referenceDifference ?? 0))}.`
                    : `Diferença de ${formatBRL(Math.abs(referenceDifference ?? 0))} entre o resultado previsto e o realizado.`}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-lg bg-surface p-3 text-sm leading-relaxed text-muted shadow-[var(--shadow-border)]">
          Este mês já fechou, mas não havia uma previsão de referência salva. A partir do mês atual, o Núcleo registra essa fotografia automaticamente para comparar no fechamento.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-display text-lg tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}
