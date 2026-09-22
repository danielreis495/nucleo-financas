import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { CashFlowForecastCard } from "@/components/cash-flow-forecast-card";
import { CashPositionCard } from "@/components/cash-position-card";
import { CardsOverviewCard } from "@/components/cards-overview-card";
import { HomeCockpit } from "@/components/home-cockpit";
import { MonthChangeCard } from "@/components/month-change-card";
import { MonthHeader } from "@/components/month-header";
import { MonthlySimulationCard } from "@/components/monthly-simulation-card";
import { PersonAvatar } from "@/components/person-avatar";
import { TodayBriefCard } from "@/components/today-brief-card";
import { categoryLabel } from "@/lib/categories";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/lib/money";
import { recurringExpenses, recurringMonthlyTotal } from "@/lib/recurring";
import {
  committedFuture,
  dailySpend,
  monthTransactions,
  spendByCategory,
  spendByPerson,
  upcomingInstallments,
} from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const month = useFinanceStore((s) => s.viewMonth);
  const setMonth = useFinanceStore((s) => s.setViewMonth);
  const state = useFinanceStore();
  const rows = monthTransactions(state, month);
  const cats = spendByCategory(rows);
  const people = spendByPerson(rows, state.people);
  const days = dailySpend(rows, month);
  const maxDay = Math.max(1, ...days);
  const upcoming = upcomingInstallments(state, todayIso(), 3);
  const committed = committedFuture(state, todayIso());
  const recurring = recurringExpenses(state, 5);
  const recurringTotal = recurringMonthlyTotal(recurring);

  return (
    <main className="stagger-in flex flex-col gap-4 pb-6">
      <MonthHeader month={month} onChange={setMonth} kicker={state.householdName} />

      {state.demo ? (
        <p className="mx-5 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          Casa de exemplo da família Almeida. Capture uma nota ou limpe os dados em Casa.
        </p>
      ) : null}

      <HomeCockpit month={month} />

      <TodayBriefCard month={month} />

      <CashPositionCard month={month} />

      <CardsOverviewCard className="mx-5" />

      <MonthlySimulationCard month={month} />

      <section className="px-5">
        <p className="mb-2 text-xs font-medium text-muted">Ritmo do mês</p>
        <div className="flex h-12 items-end gap-0.5">
          {days.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-primary/80"
              style={{ height: `${Math.max(6, (v / maxDay) * 100)}%`, opacity: v === 0 ? 0.18 : 1 }}
              title={`Dia ${i + 1}: ${formatBRL(v)}`}
            />
          ))}
        </div>
      </section>

      <section className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">Quem gastou</h2>
          <Link to="/casa" className="text-sm font-medium text-primary">
            Pessoas
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {people.map(({ person, amount }) => (
            <Link
              key={person.id}
              to="/extrato"
              search={{ person: person.id, type: "expense" }}
              className="min-w-[108px] rounded-xl bg-elevated px-3 py-2.5 shadow-[var(--shadow-border)] transition-transform active:scale-[0.98]"
            >
              <PersonAvatar person={person} />
              <p className="mt-2 text-sm font-medium">{person.name}</p>
              <p className="font-display text-base tabular-nums">{formatBRLCompact(amount)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">Categorias</h2>
          <Link
            to="/extrato"
            search={{ type: "expense" }}
            className="text-sm font-medium text-primary"
          >
            Ver todas
          </Link>
        </div>
        <ul className="flex flex-col gap-3">
          {cats.slice(0, 5).map((c) => {
            const max = cats[0]?.amount || 1;
            const budget = state.budgets.find((b) => b.category === c.category);
            const over = budget ? c.amount > budget.monthlyLimit : false;
            return (
              <li key={c.category}>
                <Link to="/extrato" search={{ cat: c.category, type: "expense" }} className="block">
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {categoryLabel(c.category, state.customCategories)}
                    </span>
                    <span className={cn("tabular-nums", over ? "text-danger" : "text-muted")}>
                      {formatBRL(c.amount)}
                      {budget ? ` / ${formatBRLCompact(budget.monthlyLimit)}` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className={cn("h-full rounded-full", over ? "bg-danger" : "bg-primary")}
                      style={{ width: `${Math.min(100, (c.amount / max) * 100)}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <MonthChangeCard month={month} />

      <CashFlowForecastCard />

      <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Parcelas à frente</h2>
            <p className="mt-1 text-sm text-muted">
              Comprometido:{" "}
              <span className="font-medium text-fg tabular-nums">{formatBRL(committed)}</span>
            </p>
          </div>
          <Link to="/parcelas" className="text-sm font-medium text-primary">
            Ver
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {upcoming.length === 0 ? (
            <li className="py-2 text-sm text-muted">Nenhuma parcela futura.</li>
          ) : (
            upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-3">
                  {t.description}
                  <span className="text-muted"> · {formatShortDate(t.date)}</span>
                </span>
                <span className="tabular-nums">{formatBRL(t.amount)}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      {recurring.length > 0 ? (
        <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl">Recorrências detectadas</h2>
              <p className="mt-1 text-sm text-muted">
                Cerca de{" "}
                <span className="font-medium text-fg tabular-nums">
                  {formatBRL(recurringTotal)}
                </span>{" "}
                por mês em cobranças que se repetem.
              </p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {recurring.slice(0, 3).map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.merchant}</span>
                  <span className="block text-xs text-muted">
                    provável em {formatShortDate(item.nextDate)} · {item.occurrences} meses
                    observados
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatBRL(item.averageAmount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Estimativa automática pelo histórico; o Núcleo não cria lançamentos futuros nem altera
            seus dados.
          </p>
        </section>
      ) : null}

    </main>
  );
}
