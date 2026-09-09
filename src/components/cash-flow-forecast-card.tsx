import { CalendarRange, CircleDashed, CircleDollarSign } from "lucide-react";
import { cashFlowForecast } from "@/lib/forecast";
import { formatBRL, formatShortDate } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { todayIso } from "@/lib/utils";

export function CashFlowForecastCard() {
  const state = useFinanceStore();
  const forecast = cashFlowForecast(state, todayIso(), 30);

  if (forecast.items.length === 0) return null;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <CalendarRange className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Próximos 30 dias</p>
          <h2 className="font-display text-xl">Compromissos previstos</h2>
          <p className="mt-1 text-sm text-muted">
            Cerca de <span className="font-medium text-fg tabular-nums">{formatBRL(forecast.expectedOutflow)}</span> em saídas já conhecidas ou recorrentes.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <CircleDollarSign className="size-3" /> Confirmado
          </p>
          <p className="mt-1 font-display text-lg tabular-nums">{formatBRL(forecast.scheduledExpenses)}</p>
          <p className="mt-1 text-[10px] leading-tight text-muted">Parcelas e lançamentos já agendados</p>
        </div>
        <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <CircleDashed className="size-3" /> Estimado
          </p>
          <p className="mt-1 font-display text-lg tabular-nums">{formatBRL(forecast.predictedRecurring)}</p>
          <p className="mt-1 text-[10px] leading-tight text-muted">Recorrências detectadas pelo histórico</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {forecast.items.slice(0, 5).map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              <span className="block text-xs text-muted">
                {formatShortDate(item.date)} · {item.source === "scheduled" ? "confirmado" : "estimativa recorrente"}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              {item.type === "income" ? "+" : "−"}{formatBRL(item.amount)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        A previsão não cria lançamentos. Recorrências que já tenham um agendamento equivalente são contadas apenas uma vez.
      </p>
    </section>
  );
}
