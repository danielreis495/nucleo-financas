import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/category-picker";
import { MonthHeader } from "@/components/month-header";
import { PersonAvatar } from "@/components/person-avatar";
import { SwipeRow } from "@/components/swipe-row";
import { categoriesFor, categoryLabel } from "@/lib/categories";
import { formatBRL, formatLongDate } from "@/lib/money";
import { monthTransactions, personById } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { CategoryId, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/extrato")({ component: ExtratoPage });

function ExtratoPage() {
  const month = useFinanceStore((s) => s.viewMonth);
  const setMonth = useFinanceStore((s) => s.setViewMonth);
  const state = useFinanceStore();
  const custom = useFinanceStore((s) => s.customCategories);
  const remove = useFinanceStore((s) => s.removeTransaction);
  const restore = useFinanceStore((s) => s.restoreTransaction);
  const update = useFinanceStore((s) => s.updateTransaction);
  const [personId, setPersonId] = useState<string | "all">("all");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const expenseCats = categoriesFor("gasto", custom);

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

  function handleDelete(tx: Transaction) {
    remove(tx.id);
    if (openId === tx.id) setOpenId(null);
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
        {expenseCats.map((c) => (
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
                const open = openId === t.id;
                return (
                  <li key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                    <SwipeRow onDelete={() => handleDelete(t)}>
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {person ? <PersonAvatar person={person} size="sm" /> : null}
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setOpenId(open ? null : t.id)}
                          >
                            <p className="truncate text-sm font-medium">{t.merchant}</p>
                            <p className="text-xs text-muted">
                              {categoryLabel(t.category, custom)}
                              {t.installmentIndex
                                ? ` · ${t.installmentIndex}/${t.installmentTotal}`
                                : ""}
                              {scheduled ? " · agendado" : ""}
                            </p>
                          </button>
                          <p
                            className={cn(
                              "font-display text-sm tabular-nums",
                              t.type === "income" ? "text-income" : "text-fg",
                              scheduled && "text-muted",
                            )}
                          >
                            {t.type === "income" ? "+" : "−"}
                            {formatBRL(t.amount)}
                          </p>
                        </div>
                        {open ? (
                          <div className="mt-3">
                            <p className="mb-2 text-xs font-medium text-muted">Categoria</p>
                            <CategoryPicker
                              value={t.category}
                              group={t.type === "income" ? "entrada" : "gasto"}
                              onChange={(id) => update(t.id, { category: id })}
                            />
                            <p className="mt-3 mb-2 text-xs font-medium text-muted">Quem</p>
                            <div className="flex flex-wrap gap-1.5">
                              {state.people.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => update(t.id, { personId: p.id })}
                                  className={cn(
                                    "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                                    t.personId === p.id
                                      ? "bg-primary text-primary-fg"
                                      : "bg-line text-fg",
                                  )}
                                >
                                  <PersonAvatar person={p} size="sm" />
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </SwipeRow>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
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
