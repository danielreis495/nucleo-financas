import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { MonthHeader } from "@/components/month-header";
import { PersonAvatar } from "@/components/person-avatar";
import { SwipeRow } from "@/components/swipe-row";
import { TransactionEdit } from "@/components/transaction-edit";
import { categoriesFor, categoryLabel } from "@/lib/categories";
import { exactDuplicateTransactionIds, unidentifiedTransactionIds } from "@/lib/alerts";
import { NATURE_LABEL, natureOf } from "@/lib/movement-nature";
import { formatBRL, formatLongDate } from "@/lib/money";
import { monthTransactions, personById } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { CategoryId, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type ExtratoSearch = {
  cat?: string;
  person?: string;
  type?: "expense" | "income";
  issue?: "duplicate" | "unidentified";
};

type ScopeFilter = "all" | "budget" | "excluded";

export const Route = createFileRoute("/extrato")({
  validateSearch: (search: Record<string, unknown>): ExtratoSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    person: typeof search.person === "string" ? search.person : undefined,
    type: search.type === "expense" || search.type === "income" ? search.type : undefined,
    issue:
      search.issue === "duplicate" || search.issue === "unidentified"
        ? search.issue
        : undefined,
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
  const { cat, person, type, issue } = Route.useSearch();
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
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => {
    setPersonId(person ?? "all");
  }, [person]);

  useEffect(() => {
    setCategory(cat ?? "all");
  }, [cat]);

  useEffect(() => {
    setTxType(type ?? "all");
  }, [type]);

  useEffect(() => {
    setOrigin("all");
    setQuery("");
  }, [month]);

  const expenseCats = categoriesFor("gasto", custom);
  const incomeCats = categoriesFor("entrada", custom);
  const filterCats = [...expenseCats, ...incomeCats];

  const monthRows = useMemo(
    () => monthTransactions(state, month, true, true),
    [state, month],
  );

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

      {issue ? (
        <div className="mx-5 mb-3 rounded-xl bg-primary-soft px-4 py-3 text-primary">
          <p className="text-xs font-medium tracking-wide uppercase">
            {issue === "duplicate" ? "Conferência de duplicidade" : "Lançamentos para revisar"}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {issue === "duplicate"
              ? `Mostrando ${rows.length} lançamento${rows.length === 1 ? "" : "s"} envolvidos em grupos idênticos. Compare os pares antes de apagar: compras legítimas podem coincidir em data e valor.`
              : `Mostrando ${rows.length} lançamento${rows.length === 1 ? "" : "s"} com favorecido ou origem incompletos.`}
          </p>
        </div>
      ) : null}

      {catLabel ? (
        <div className="mx-5 mb-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Categoria</p>
          <p className="font-display text-2xl tracking-tight">{catLabel}</p>
          <p className="mt-1 text-sm text-muted">
            {rows.length} lançamento{rows.length === 1 ? "" : "s"} · {formatBRL(Math.abs(total))}
          </p>
        </div>
      ) : null}

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar loja, Pix, banco, categoria…"
            inputMode="search"
            className="h-11 w-full rounded-xl bg-elevated pr-10 pl-10 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          {query ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-line"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {query ? (
          <p className="mt-2 text-xs text-muted">
            {rows.length} resultado{rows.length === 1 ? "" : "s"} · saldo do recorte {formatBRL(total)}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 pb-2">
        <FilterChip active={scope === "all"} onClick={() => setScope("all")}>
          Todos
        </FilterChip>
        <FilterChip active={scope === "budget"} onClick={() => setScope("budget")}>
          Orçamento
        </FilterChip>
        <FilterChip active={scope === "excluded"} onClick={() => setScope("excluded")}>
          Fora do orçamento
        </FilterChip>
      </div>

      {originOptions.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-5 pb-2">
          <FilterChip active={origin === "all"} onClick={() => setOrigin("all")}>
            Todas as origens
          </FilterChip>
          {originOptions.map((label) => (
            <FilterChip key={label} active={origin === label} onClick={() => setOrigin(label)}>
              {label}
            </FilterChip>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto px-5 pb-2">
        <FilterChip active={txType === "all"} onClick={() => setTxType("all")}>
          Movimentos
        </FilterChip>
        <FilterChip active={txType === "expense"} onClick={() => setTxType("expense")}>
          Saídas
        </FilterChip>
        <FilterChip active={txType === "income"} onClick={() => setTxType("income")}>
          Entradas
        </FilterChip>
      </div>

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
                const account = (state.accounts ?? []).find((a) => a.id === t.accountId);
                const scheduled = t.status === "scheduled";
                const nature = natureOf(t);
                const classification = nature === "budget" ? categoryLabel(t.category, custom) : NATURE_LABEL[nature];
                const originLabel = t.originLabel?.trim() || "Origem não identificada";
                const method = t.paymentMethod?.trim();
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
                            {classification}
                            {t.installmentIndex
                              ? ` · ${t.installmentIndex}/${t.installmentTotal}`
                              : ""}
                            {scheduled ? " · agendado" : ""}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted">
                            Origem: {originLabel}
                            {method ? ` · ${method}` : ""}
                            {account && originLabel === "Origem não identificada" ? ` · ${account.name}` : ""}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "font-display text-sm tabular-nums",
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
