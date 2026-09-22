import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MonthHeader } from "@/components/month-header";
import { SwipeRow } from "@/components/swipe-row";
import { TransactionEdit } from "@/components/transaction-edit";
import { categoriesFor, categoryLabel } from "@/lib/categories";
import { exactDuplicateTransactionIds, unidentifiedTransactionIds } from "@/lib/alerts";
import { NATURE_LABEL, natureOf } from "@/lib/movement-nature";
import { formatBRL, formatLongDate } from "@/lib/money";
import { monthTransactions, personById } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { CategoryId, Transaction, TxNature } from "@/lib/types";
import { cn } from "@/lib/utils";

type ExtratoSearch = {
  cat?: string;
  person?: string;
  type?: "expense" | "income";
  issue?: "duplicate" | "unidentified";
  q?: string;
};

type ScopeFilter = "all" | "budget" | "excluded";

export const Route = createFileRoute("/extrato")({
  validateSearch: (search: Record<string, unknown>): ExtratoSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    person: typeof search.person === "string" ? search.person : undefined,
    type: search.type === "expense" || search.type === "income" ? search.type : undefined,
    issue:
      search.issue === "duplicate" || search.issue === "unidentified" ? search.issue : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ExtratoPage,
});

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ExtratoPage() {
  const { cat, person, type, issue, q } = Route.useSearch();
  const month = useFinanceStore((s) => s.viewMonth);
  const setMonth = useFinanceStore((s) => s.setViewMonth);
  const state = useFinanceStore();
  const custom = useFinanceStore((s) => s.customCategories);
  const remove = useFinanceStore((s) => s.removeTransaction);
  const restore = useFinanceStore((s) => s.restoreTransaction);
  const [personId, setPersonId] = useState<string | "all">(person ?? "all");
  const [category, setCategory] = useState<CategoryId | "all">(cat ?? "all");
  const [txType, setTxType] = useState<Transaction["type"] | "all">(type ?? "all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [origin, setOrigin] = useState<string | "all">("all");
  const [query, setQuery] = useState(q ?? "");
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => setPersonId(person ?? "all"), [person]);
  useEffect(() => setCategory(cat ?? "all"), [cat]);
  useEffect(() => setTxType(type ?? "all"), [type]);
  useEffect(() => setQuery(q ?? ""), [q]);

  useEffect(() => {
    setOrigin("all");
    setQuery(q ?? "");
  }, [month, q]);

  const expenseCats = categoriesFor("gasto", custom);
  const incomeCats = categoriesFor("entrada", custom);
  const filterCats = [...expenseCats, ...incomeCats];

  const monthRows = useMemo(() => monthTransactions(state, month, true, true), [state, month]);

  const originOptions = useMemo(() => {
    const labels = new Set<string>();
    let hasUnknown = false;
    for (const row of monthRows) {
      if (row.originLabel?.trim()) labels.add(row.originLabel.trim());
      else hasUnknown = true;
    }
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (hasUnknown) sorted.push("Origem não identificada");
    return sorted;
  }, [monthRows]);

  const issueIds = useMemo(() => {
    if (issue === "duplicate") return exactDuplicateTransactionIds(monthRows);
    if (issue === "unidentified") return unidentifiedTransactionIds(monthRows);
    return null;
  }, [issue, monthRows]);

  const rows = useMemo(() => {
    const needle = normalizeSearch(query);
    return monthRows
      .filter((t) => (issueIds ? issueIds.has(t.id) : true))
      .filter((t) => (txType === "all" ? true : t.type === txType))
      .filter((t) => {
        const nature = natureOf(t);
        if (scope === "budget") return nature === "budget";
        if (scope === "excluded") return nature !== "budget";
        return true;
      })
      .filter((t) => {
        if (origin === "all") return true;
        if (origin === "Origem não identificada") return !t.originLabel?.trim();
        return t.originLabel === origin;
      })
      .filter((t) => (personId === "all" ? true : t.personId === personId))
      .filter((t) => (category === "all" ? true : t.category === category))
      .filter((t) => {
        if (!needle) return true;
        const haystack = normalizeSearch(
          [
            t.merchant,
            t.description,
            t.originLabel,
            t.originInstitution,
            t.paymentMethod,
            t.sourceFileName,
            categoryLabel(t.category, custom),
          ]
            .filter(Boolean)
            .join(" "),
        );
        return haystack.includes(needle);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [monthRows, issueIds, txType, scope, origin, personId, category, query, custom]);

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
  const inflow = rows.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const outflow = rows.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const catLabel = category === "all" ? null : categoryLabel(category, custom);
  const advancedCount =
    Number(scope !== "all") +
    Number(origin !== "all") +
    Number(personId !== "all") +
    Number(category !== "all");

  function clearAdvancedFilters() {
    setScope("all");
    setOrigin("all");
    setPersonId("all");
    setCategory("all");
  }

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
      <MonthHeader month={month} onChange={setMonth} kicker="Movimentos" />

      <section className="mx-5 mb-3 rounded-2xl bg-primary px-4 py-4 text-primary-fg shadow-[var(--shadow-border)]">
        <p className="text-[11px] font-medium uppercase tracking-wide text-primary-fg/65">
          Saldo do recorte
        </p>
        <p className={cn("mt-1 font-display text-3xl tabular-nums", total < 0 && "text-[#ffd6cf]")}>
          {formatBRL(total)}
        </p>
        <div className="mt-3 grid grid-cols-3 divide-x divide-primary-fg/10 rounded-lg bg-primary-fg/[0.05]">
          <SummaryMetric label="Entradas" value={formatBRL(inflow)} />
          <SummaryMetric label="Saídas" value={formatBRL(outflow)} />
          <SummaryMetric label="Movimentos" value={String(rows.length)} />
        </div>
      </section>

      {issue ? (
        <div className="mx-5 mb-3 rounded-xl bg-primary-soft px-4 py-3 text-primary">
          <p className="text-xs font-medium">
            {issue === "duplicate" ? "Conferência de duplicidade" : "Lançamentos para revisar"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-primary/80">
            {issue === "duplicate"
              ? `${rows.length} movimento${rows.length === 1 ? "" : "s"} em grupos idênticos. Compare antes de apagar.`
              : `${rows.length} movimento${rows.length === 1 ? "" : "s"} com dados incompletos.`}
          </p>
        </div>
      ) : null}

      {catLabel ? (
        <div className="mx-5 mb-3 flex items-center justify-between rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Categoria</p>
            <p className="font-display text-lg">{catLabel}</p>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatBRL(Math.abs(total))}</p>
        </div>
      ) : null}

      <div className="px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar movimento…"
            inputMode="search"
            className="h-11 w-full rounded-xl bg-elevated pl-10 pr-10 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          {query ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-line"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto px-5">
        <FilterChip active={txType === "all"} onClick={() => setTxType("all")}>
          Todos
        </FilterChip>
        <FilterChip active={txType === "expense"} onClick={() => setTxType("expense")}>
          Saídas
        </FilterChip>
        <FilterChip active={txType === "income"} onClick={() => setTxType("income")}>
          Entradas
        </FilterChip>
      </div>

      <details className="group mx-5 mt-3 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-primary" />
            Mais filtros
            {advancedCount > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-fg">
                {advancedCount}
              </span>
            ) : null}
          </span>
          {advancedCount > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                clearAdvancedFilters();
              }}
              className="text-xs font-medium text-primary"
            >
              Limpar
            </button>
          ) : null}
        </summary>

        <div className="border-t border-line px-4 pb-4 pt-3">
          <FilterSection title="Tipo de movimento">
            <FilterChip active={scope === "all"} onClick={() => setScope("all")}>
              Todos
            </FilterChip>
            <FilterChip active={scope === "budget"} onClick={() => setScope("budget")}>
              Orçamento
            </FilterChip>
            <FilterChip active={scope === "excluded"} onClick={() => setScope("excluded")}>
              Fora do orçamento
            </FilterChip>
          </FilterSection>

          {originOptions.length > 0 ? (
            <FilterSection title="Origem">
              <FilterChip active={origin === "all"} onClick={() => setOrigin("all")}>
                Todas
              </FilterChip>
              {originOptions.map((label) => (
                <FilterChip key={label} active={origin === label} onClick={() => setOrigin(label)}>
                  {label}
                </FilterChip>
              ))}
            </FilterSection>
          ) : null}

          <FilterSection title="Pessoa">
            <FilterChip active={personId === "all"} onClick={() => setPersonId("all")}>
              Todos
            </FilterChip>
            {state.people.map((p) => (
              <FilterChip key={p.id} active={personId === p.id} onClick={() => setPersonId(p.id)}>
                {p.name}
              </FilterChip>
            ))}
          </FilterSection>

          <FilterSection title="Categoria">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              Todas
            </FilterChip>
            {filterCats.map((item) => (
              <FilterChip
                key={item.id}
                active={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterSection>
        </div>
      </details>

      {query ? (
        <p className="mx-5 mt-3 text-xs text-muted">
          {rows.length} resultado{rows.length === 1 ? "" : "s"} para “{query}”
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className="mx-5 mt-5 rounded-xl bg-elevated px-4 py-5 text-center shadow-[var(--shadow-border)]">
          <p className="text-sm font-medium">Nenhum movimento encontrado</p>
          <p className="mt-1 text-xs text-muted">Tente limpar a busca ou os filtros.</p>
        </div>
      ) : (
        <div className="mt-4">
          {groups.map(([date, list]) => {
            const dayTotal = list.reduce(
              (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
              0,
            );

            return (
              <section key={date} className="px-5 pb-4">
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <h2 className="text-xs font-medium text-muted">{formatLongDate(date)}</h2>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      dayTotal < 0 ? "text-muted" : "text-income",
                    )}
                  >
                    {dayTotal > 0 ? "+" : ""}
                    {formatBRL(dayTotal)}
                  </span>
                </div>

                <ul className="overflow-hidden rounded-xl bg-elevated shadow-[var(--shadow-border)]">
                  {list.map((t, i) => {
                    const person = personById(state.people, t.personId);
                    const scheduled = t.status === "scheduled";
                    const nature = natureOf(t);
                    const classification =
                      nature === "budget"
                        ? categoryLabel(t.category, custom)
                        : NATURE_LABEL[nature];
                    const originLabel = t.originLabel?.trim();
                    const secondary = [
                      classification,
                      person?.name,
                      t.installmentIndex ? `${t.installmentIndex}/${t.installmentTotal}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <li key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                        <SwipeRow onDelete={() => handleDelete(t)}>
                          <button
                            className="flex w-full items-center gap-3 bg-elevated px-3.5 py-3 text-left active:bg-surface"
                            onClick={() => setEditing(t)}
                          >
                            <MovementIcon type={t.type} nature={nature} scheduled={scheduled} />

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {t.merchant || t.description}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {secondary}
                              </span>
                              {originLabel || t.paymentMethod || scheduled ? (
                                <span className="mt-0.5 block truncate text-[10px] text-subtle">
                                  {[scheduled ? "Agendado" : null, originLabel, t.paymentMethod]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              ) : null}
                            </span>

                            <span
                              className={cn(
                                "shrink-0 font-display text-sm tabular-nums",
                                t.type === "income" ? "text-income" : "text-fg",
                                nature !== "budget" && "text-muted",
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
            );
          })}
        </div>
      )}

      {editing && state.transactions.some((t) => t.id === editing.id) ? (
        <TransactionEdit tx={editing} onClose={() => setEditing(null)} />
      ) : null}
    </main>
  );
}

function MovementIcon({
  type,
  nature,
  scheduled,
}: {
  type: Transaction["type"];
  nature: TxNature;
  scheduled: boolean;
}) {
  const Icon =
    nature === "transfer" || nature === "card_payment"
      ? ArrowLeftRight
      : type === "income"
        ? ArrowDownLeft
        : ArrowUpRight;

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full",
        scheduled
          ? "bg-line text-muted"
          : nature !== "budget"
            ? "bg-line text-muted"
            : type === "income"
              ? "bg-primary-soft text-income"
              : "bg-surface text-fg shadow-[var(--shadow-border)]",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5">
      <p className="text-[10px] text-primary-fg/60">{label}</p>
      <p className="mt-0.5 truncate font-display text-sm tabular-nums">{value}</p>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{title}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>
    </div>
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
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
        active ? "bg-primary text-primary-fg" : "bg-line text-fg",
      )}
    >
      {children}
    </button>
  );
}
