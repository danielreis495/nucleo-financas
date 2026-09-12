import { useState } from "react";
import { CalendarRange, CircleDashed, CircleDollarSign, WalletCards } from "lucide-react";
import { cashFlowForecast, nextLikelySalary } from "@/lib/forecast";
import { formatBRL, formatShortDate } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

type Horizon = 30 | 60 | 90 | "salary";

function daysUntil(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T12:00:00`).getTime();
  const to = new Date(`${toIso}T12:00:00`).getTime();
  return Math.max(1, Math.ceil((to - from) / 86_400_000));
}

function confidenceLabel(value: "confirmed" | "high" | "medium" | "low") {
  if (value === "confirmed") return "confirmada";
  if (value === "high") return "alta confiança";
  if (value === "medium") return "média confiança";
  return "baixa confiança";
}

export function CashFlowForecastCard() {
  const state = useFinanceStore();
  const today = todayIso();
  const salary = nextLikelySalary(state, today);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const salaryDays = salary ? daysUntil(today, salary.date) : null;
  const horizonDays = horizon === "salary" && salaryDays ? salaryDays : typeof horizon === "number" ? horizon : 30;
  const forecast = cashFlowForecast(state, today, horizonDays);

  if (forecast.items.length === 0 && !salary) return null;

  const title =
    horizon === "salary" && salary
      ? `Até a próxima renda · ${formatShortDate(salary.date)}`
      : `Próximos ${horizonDays} dias`;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <CalendarRange className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Previsão financeira</p>
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted">
            Cerca de <span className="font-medium text-fg tabular-nums">{formatBRL(forecast.expectedOutflow)}</span> em saídas conhecidas ou recorrentes.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {([30, 60, 90] as const).map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setHorizon(days)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
              horizon === days ? "bg-primary text-primary-fg" : "bg-line text-fg",
            )}
          >
            {days} dias
          </button>
        ))}
        {salary ? (
          <button
            type="button"
            onClick={() => setHorizon("salary")}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
              horizon === "salary" ? "bg-primary text-primary-fg" : "bg-line text-fg",
            )}
          >
            Até próxima renda
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
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
          <p className="mt-1 text-[10px] leading-tight text-muted">Recorrências repetidas dentro da janela</p>
        </div>
      </div>

      {salary ? (
        <div className="mt-2 rounded-lg bg-primary-soft p-3 text-primary">
          <div className="flex items-start gap-2">
            <WalletCards className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-xs font-medium">
                Próxima renda {salary.confidence === "confirmed" ? "confirmada" : "provável"} em {formatShortDate(salary.date)}
              </p>
              <p className="mt-1 text-sm tabular-nums">{formatBRL(salary.estimatedAmount)}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-primary/75">
                {confidenceLabel(salary.confidence)}
                {salary.observedMonths > 0 ? ` · baseada em ${salary.observedMonths} mês${salary.observedMonths === 1 ? "" : "es"} observado${salary.observedMonths === 1 ? "" : "s"}` : ""}
              </p>
              {horizon === "salary" ? (
                <p className="mt-2 text-xs leading-relaxed">
                  Até lá, os compromissos previstos somam {formatBRL(forecast.expectedOutflow)}. Isso não inclui seu saldo atual.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {forecast.items.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {forecast.items.slice(0, 6).map((item) => (
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
      ) : (
        <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-muted">
          Nenhum compromisso foi detectado dentro desta janela.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        A previsão não cria lançamentos. Em 60/90 dias, cobranças recorrentes são repetidas mês a mês; valores estimados continuam separados dos confirmados.
      </p>
    </section>
  );
}
