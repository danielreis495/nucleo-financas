import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MonthHeader } from "@/components/month-header";
import { PersonAvatar } from "@/components/person-avatar";
import { SwipeRow } from "@/components/swipe-row";
import { TransactionEdit } from "@/components/transaction-edit";
import { categoriesFor, categoryLabel } from "@/lib/categories";
import { formatBRL, formatLongDate } from "@/lib/money";
import { monthTransactions, personById } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { CategoryId, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type ExtratoSearch = { cat?: string };

export const Route = createFileRoute("/extrato")({
  validateSearch: (search: Record<string, unknown>): ExtratoSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
  }),
  component: ExtratoPage,
});

function ExtratoPage() {
  const { cat } = Route.useSearch();
  const month = useFinanceStore((s) => s.viewMonth);
  const setMonth = useFinanceStore((s) => s.setViewMonth);
  const state = useFinanceStore();
  const custom = useFinanceStore((s) => s.customCategories);
  const remove = useFinanceStore((s) => s.removeTransaction);
  const restore = useFinanceStore((s) => s.restoreTransaction);
  const [personId, setPersonId] = useState<string | "all">("all");
  const [category, setCategory] = useState<CategoryId | "all">(cat ?? "all");
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => {
    if (cat) setCategory(cat);
  }, [cat]);

  const expenseCats = categoriesFor("gasto", custom);
  const incomeCats = categoriesFor("entrada", custom);
  const filterCats = [...expenseCats, ...incomeCats];

  const rows = useMemo(() => {
    return monthTransactions(state, month, true)
      .filter((t) => (personId === "all" ? true : t.personId === personId))
      .filter((t) => (category === "all" ? true : t.category === category))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [state, month, personId, category]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const t of rows) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  const total = rows.reduce((acc, t) => acc + (t.type === "income" ? t.amount : -t.amount), 0);
  const catLabel = category === "all" ? null : categoryLabel(category, custom);

  function handleDelete(tx: Transaction) {
    remove(tx.id);
    if (editing?.id === tx.id) setEditing(null);
    toast("Lançamento apagado", {
      duration: 7000,
      action: {
        label: "Desfazer",
        onClick: () => restore(tx),
      },
    });
  }

  return (
    <main className="flex flex-col pb-6">
      <MonthHeader month={month} onChange={setMonth} kicker="Extrato" />

      {catLabel ? (
        <div className="mx-5 mb-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Categoria</p>
          <p className="font-display text-2xl tracking-tight">{catLabel}</p>
          <p className="mt-1 text-sm text-muted">
            {rows.length} lançamento{rows.length === 1 ? "" : "s"} · {formatBRL(Math.abs(total))}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto px-5 pb-2">
        <FilterChip active={personId === "all"} onClick={() => setPersonId("all")}>
          Todos
        </FilterChip>
        {state.people.map((p) => (
          <FilterChip key={p.id} active={personId === p.id} onClick={() => setPersonId(p.id)}>
            {p.name}
          </FilterChip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-5 pb-4">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
          Categorias
        </FilterChip>
        {filterCats.map((c) => (
          <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="px-5 text-sm text-muted">Nenhum lançamento neste recorte.</p>
      ) : (
        groups.map(([date, list]) => (
          <section key={date} className="px-5 pb-4">
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
              {formatLongDate(date)}
            </h2>
            <ul className="overflow-hidden rounded-xl shadow-[var(--shadow-border)]">
              {list.map((t, i) => {
                const person = personById(state.people, t.personId);
                const scheduled = t.status === "scheduled";
                return (
                  <li key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                    <SwipeRow onDelete={() => handleDelete(t)}>
                      <button
                        className="flex w-full items-center gap-3 bg-elevated px-4 py-3 text-left"
                        onClick={() => setEditing(t)}
                      >
                        {person ? <PersonAvatar person={person} size="sm" /> : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{t.merchant}</span>
                          <span className="block text-xs text-muted">
                            {categoryLabel(t.category, custom)}
                            {t.installmentIndex
                              ? ` · ${t.installmentIndex}/${t.installmentTotal}`
                              : ""}
                            {scheduled ? " · agendado" : ""}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "font-display text-sm tabular-nums",
                            t.type === "income" ? "text-income" : "text-fg",
                            scheduled && "text-muted",
                          )}
                        >
                          {t.type === "income" ? "+" : "−"}
                          {formatBRL(t.amount)}
                        </span>
                      </button>
                    </SwipeRow>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {editing && state.transactions.some((t) => t.id === editing.id) ? (
        <TransactionEdit tx={editing} onClose={() => setEditing(null)} />
      ) : null}
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
        active ? "bg-primary text-primary-fg" : "bg-line text-fg",
      )}
    >
      {children}
    </button>
  );
}
