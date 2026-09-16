import { AlertTriangle, CheckCircle2, CreditCard, Clock3 } from "lucide-react";
import { cashPositionForMonth } from "@/lib/cash-position";
import { countsInBudget } from "@/lib/movement-nature";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/lib/money";
import { monthTransactions } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(value: string | undefined) {
  const text = normalize(value);
  if (/\bnubank\b|\bnu pagamentos\b/.test(text)) return "nubank";
  if (/\bitau\b/.test(text)) return "itau";
  if (/\bbradesco\b/.test(text)) return "bradesco";
  if (/\bsantander\b/.test(text)) return "santander";
  if (/\bbanco do brasil\b/.test(text)) return "banco do brasil";
  if (/\bcaixa\b/.test(text)) return "caixa";
  if (/\binter\b/.test(text)) return "inter";
  if (/\bc6\b/.test(text)) return "c6";
  return text;
}

function statusInfo(status: "paid" | "open" | "future" | undefined) {
  if (status === "paid") return { label: "Paga", icon: CheckCircle2, cls: "text-primary bg-primary-soft" };
  if (status === "open") return { label: "Em aberto", icon: AlertTriangle, cls: "text-danger bg-danger-soft" };
  if (status === "future") return { label: "Depois", icon: Clock3, cls: "text-warn bg-warn-soft" };
  return { label: "Sem status", icon: Clock3, cls: "text-muted bg-line" };
}

export function CardsOverviewCard() {
  const state = useFinanceStore();
  const month = state.viewMonth;
  const summaries = useDocumentStore((s) => s.summaries);
  const cash = cashPositionForMonth(summaries, month, state.transactions);
  const monthRows = monthTransactions(state, month, true, true);

  const institutions = new Map<string, string>();
  for (const summary of summaries.filter((item) => item.kind === "credit_card_bill")) {
    const key = canonical(summary.institution);
    if (key) institutions.set(key, summary.institution);
  }
  for (const tx of state.transactions.filter((item) => item.originKind === "credit_card")) {
    const label = tx.originInstitution || tx.originLabel?.replace(/^Cartão\s+/i, "") || "";
    const key = canonical(label);
    if (key && !institutions.has(key)) institutions.set(key, label);
  }

  const cards = [...institutions.entries()].map(([key, institution]) => {
    const rows = monthRows.filter(
      (tx) => tx.originKind === "credit_card" && canonical(tx.originInstitution || tx.originLabel) === key,
    );
    const expenses = rows
      .filter((tx) => countsInBudget(tx) && tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const credits = rows
      .filter((tx) => countsInBudget(tx) && tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const spent = Math.max(0, expenses - credits);
    const billRow = cash.billRows.find((row) => canonical(row.institution) === key && row.referenceMonth === month);
    const summary = summaries
      .filter(
        (item) =>
          item.kind === "credit_card_bill" &&
          canonical(item.institution) === key &&
          item.referenceMonth === month,
      )
      .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""))[0];

    return {
      key,
      institution,
      spent,
      count: rows.filter(countsInBudget).length,
      total: billRow?.total ?? summary?.billTotal ?? null,
      dueDate: billRow?.dueDate ?? summary?.dueDate,
      status: billRow?.status,
      paymentDate: billRow?.paymentDate,
    };
  });

  if (cards.length === 0) return null;

  const openTotal = cards
    .filter((card) => card.status === "open")
    .reduce((sum, card) => sum + (card.total ?? 0), 0);

  return (
    <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <CreditCard className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Cartões</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">Faturas acompanhadas</h2>
            <p className="shrink-0 font-display text-lg tabular-nums">
              {openTotal > 0 ? formatBRL(openTotal) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-line rounded-xl bg-surface px-3 shadow-[var(--shadow-border)]">
        {cards.map((card) => {
          const info = statusInfo(card.status);
          const Icon = info.icon;
          const dateLabel =
            card.status === "paid" && card.paymentDate
              ? `Pago ${formatShortDate(card.paymentDate)}`
              : card.dueDate
                ? `Vence ${formatShortDate(card.dueDate)}`
                : "Data não identificada";

          return (
            <article key={card.key} className="py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">Cartão {card.institution}</p>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", info.cls)}>
                      <Icon className="size-3" />
                      {info.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {dateLabel} · {card.count} lançamento{card.count === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="shrink-0 font-display text-sm tabular-nums">
                  {card.total === null ? formatBRLCompact(card.spent) : formatBRL(card.total)}
                </p>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] font-medium text-muted">Ver composição</summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-elevated px-3 py-2">
                    <p className="text-[10px] text-muted">Classificado</p>
                    <p className="mt-0.5 font-display text-sm tabular-nums">{formatBRL(card.spent)}</p>
                  </div>
                  <div className="rounded-lg bg-elevated px-3 py-2">
                    <p className="text-[10px] text-muted">Fatura oficial</p>
                    <p className="mt-0.5 font-display text-sm tabular-nums">
                      {card.total === null ? "—" : formatBRL(card.total)}
                    </p>
                  </div>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
