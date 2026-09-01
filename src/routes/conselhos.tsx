import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adviseSpending } from "@/lib/ai";
import { categoryLabel } from "@/lib/categories";
import { formatBRL, formatMonthTitle } from "@/lib/money";
import {
  budgetUsage,
  monthTransactions,
  planProgress,
  spendByPerson,
  totalsForMonth,
} from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { addMonthsKey, cn } from "@/lib/utils";

export const Route = createFileRoute("/conselhos")({ component: ConselhosPage });

function ConselhosPage() {
  const state = useFinanceStore();
  const month = state.viewMonth;
  const setAdvice = useFinanceStore((s) => s.setAdvice);
  const [busy, setBusy] = useState(false);
  const cached = state.advice?.monthKey === month ? state.advice : null;

  async function run() {
    setBusy(true);
    try {
      const rows = monthTransactions(state, month);
      const prev = totalsForMonth(state, addMonthsKey(month, -1));
      const totals = totalsForMonth(state, month);
      const people = spendByPerson(rows, state.people).map((p) => ({
        name: p.person.name,
        spent: p.amount,
      }));
      const categories = budgetUsage(state, month).map((b) => ({
        label: categoryLabel(b.category),
        used: b.used,
        limit: b.monthlyLimit,
      }));
      const merchantMap = new Map<string, { amount: number; count: number }>();
      for (const t of rows.filter((x) => x.type === "expense")) {
        const cur = merchantMap.get(t.merchant) ?? { amount: 0, count: 0 };
        cur.amount += t.amount;
        cur.count += 1;
        merchantMap.set(t.merchant, cur);
      }
      const merchants = [...merchantMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 12);
      const subscriptions = rows
        .filter((t) => t.category === "assinaturas")
        .map((t) => ({ name: t.merchant, amount: t.amount }));
      const installments = state.plans.map((plan) => {
        const p = planProgress(state, plan.id);
        return { title: plan.title, remaining: p.total - p.paid, amount: plan.installmentAmount };
      });

      const result = await adviseSpending({
        data: {
          monthKey: month,
          householdName: state.householdName,
          people,
          totals,
          previous: { expense: prev.expense },
          categories,
          subscriptions,
          installments,
          merchants,
          apiKey: state.geminiKey || undefined,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAdvice({
        monthKey: month,
        generatedAt: new Date().toISOString(),
        summary: result.summary,
        items: result.items,
      });
    } catch {
      toast.error("Não consegui analisar agora.");
    } finally {
      setBusy(false);
    }
  }

  const potential = cached?.items.reduce((a, i) => a + i.impact, 0) ?? 0;

  return (
    <main className="flex flex-col px-5 pt-6 pb-8">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Conselhos</p>
      <h1 className="font-display text-3xl tracking-tight">{formatMonthTitle(month)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Uma leitura fria dos gastos da casa: assinaturas, delivery, teto estourado e o peso das parcelas.
      </p>

      <Button className="mt-5" onClick={() => void run()} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analisando…
          </>
        ) : cached ? (
          "Atualizar leitura"
        ) : (
          "Analisar gastos"
        )}
      </Button>

      {cached ? (
        <div className="stagger-in mt-6 flex flex-col gap-3">
          <section className="rounded-xl bg-primary px-5 py-4 text-primary-fg">
            <p className="text-xs text-primary-fg/70">Corte estimado no mês</p>
            <p className="font-display text-3xl tabular-nums">{formatBRL(potential)}</p>
            <p className="mt-2 text-sm leading-relaxed text-primary-fg/85">{cached.summary}</p>
          </section>
          {cached.items.map((item) => (
            <article key={item.id} className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{item.title}</h2>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    item.severity === "high"
                      ? "bg-danger-soft text-danger"
                      : item.severity === "medium"
                        ? "bg-warn-soft text-warn"
                        : "bg-primary-soft text-primary",
                  )}
                >
                  {item.severity === "high" ? "Alto" : item.severity === "medium" ? "Médio" : "Leve"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted">{item.category ? categoryLabel(item.category) : "Geral"}</span>
                {item.impact > 0 ? (
                  <span className="font-medium text-primary tabular-nums">−{formatBRL(item.impact)}/mês</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !busy && (
          <p className="mt-8 text-sm text-muted">
            Nada ainda. A análise usa os lançamentos deste mês — capture uma fatura ou use a casa de exemplo.
          </p>
        )
      )}
    </main>
  );
}
