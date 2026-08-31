import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import { MonthHeader } from "@/components/month-header";
import { PersonAvatar } from "@/components/person-avatar";
import { categoryLabel } from "@/lib/categories";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/lib/money";
import {
  budgetUsage,
  committedFuture,
  dailySpend,
  monthTransactions,
  spendByCategory,
  spendByPerson,
  totalsForMonth,
  upcomingInstallments,
} from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const month = useFinanceStore((s) => s.viewMonth);
  const setMonth = useFinanceStore((s) => s.setViewMonth);
  const state = useFinanceStore();
  const totals = totalsForMonth(state, month);
  const rows = monthTransactions(state, month);
  const cats = spendByCategory(rows).slice(0, 5);
  const people = spendByPerson(rows, state.people);
  const days = dailySpend(rows, month);
  const maxDay = Math.max(1, ...days);
  const upcoming = upcomingInstallments(state, todayIso(), 3);
  const committed = committedFuture(state, todayIso());
  const budgets = budgetUsage(state, month).filter((b) => b.used > 0).slice(0, 4);
  const recent = [...rows]
    .filter((t) => t.type === "expense")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const overBudget = budgets.filter((b) => b.ratio > 1);

  return (
    <main className="stagger-in flex flex-col gap-5 pb-6">
      <MonthHeader month={month} onChange={setMonth} kicker={state.householdName} />

      {state.demo ? (
        <p className="mx-5 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          Casa de exemplo da família Almeida. Capture uma nota ou limpe os dados em Casa.
        </p>
      ) : null}

      <section className="mx-5 rounded-xl bg-primary px-5 py-5 text-primary-fg">
        <p className="text-xs font-medium tracking-wide text-primary-fg/70 uppercase">Saldo do mês</p>
        <p className="mt-1 font-display text-4xl tabular-nums tracking-tight">{formatBRL(totals.balance)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-primary-fg/10 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] text-primary-fg/70">
              <ArrowUpRight className="size-3" /> Entradas
            </p>
            <p className="font-display text-lg tabular-nums">{formatBRLCompact(totals.income)}</p>
          </div>
          <div className="rounded-md bg-primary-fg/10 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] text-primary-fg/70">
              <ArrowDownRight className="size-3" /> Saídas
            </p>
            <p className="font-display text-lg tabular-nums">{formatBRLCompact(totals.expense)}</p>
          </div>
        </div>
      </section>

      <section className="px-5">
        <p className="mb-2 text-xs font-medium text-muted">Ritmo do mês</p>
        <div className="flex h-16 items-end gap-0.5">
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
            <div
              key={person.id}
              className="min-w-[118px] rounded-xl bg-elevated px-3 py-3 shadow-[var(--shadow-border)]"
            >
              <PersonAvatar person={person} />
              <p className="mt-2 text-sm font-medium">{person.name}</p>
              <p className="font-display text-base tabular-nums">{formatBRLCompact(amount)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5">
        <h2 className="mb-3 font-display text-xl">Categorias</h2>
        <ul className="flex flex-col gap-3">
          {cats.map((c) => {
            const max = cats[0]?.amount || 1;
            const budget = state.budgets.find((b) => b.category === c.category);
            const over = budget ? c.amount > budget.monthlyLimit : false;
            return (
              <li key={c.category}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{categoryLabel(c.category)}</span>
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
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Parcelas à frente</h2>
            <p className="mt-1 text-sm text-muted">
              Comprometido: <span className="font-medium text-fg tabular-nums">{formatBRL(committed)}</span>
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

      <section className="mx-5">
        <Link
          to="/conselhos"
          className="flex items-center gap-3 rounded-xl bg-primary-soft px-4 py-4 text-primary"
        >
          <span className="flex size-10 items-center justify-center rounded-md bg-elevated">
            <Sparkles className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Conselhos de corte</span>
            <span className="block text-sm text-primary/80">
              {overBudget.length
                ? `${overBudget.length} categoria${overBudget.length > 1 ? "s" : ""} acima do teto`
                : "Onde dá para aliviar este mês"}
            </span>
          </span>
        </Link>
      </section>

      <section className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">Recentes</h2>
          <Link to="/extrato" className="text-sm font-medium text-primary">
            Extrato
          </Link>
        </div>
        <ul className="divide-y divide-line rounded-xl bg-elevated px-4 shadow-[var(--shadow-border)]">
          {recent.map((t) => {
            const person = state.people.find((p) => p.id === t.personId);
            return (
              <li key={t.id} className="flex items-center gap-3 py-3">
                {person ? <PersonAvatar person={person} size="sm" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.merchant}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(t.category)} · {formatShortDate(t.date)}
                  </p>
                </div>
                <p className="font-display tabular-nums">−{formatBRL(t.amount)}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
