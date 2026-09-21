import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, Loader2, ShieldCheck, Sparkles, Target, WalletCards } from "lucide-react";
import { AdvisorChat } from "@/components/advisor-chat";
import { FinancialAlertsCard } from "@/components/financial-alerts-card";
import { Button } from "@/components/ui/button";
import { adviseSpending } from "@/lib/ai";
import { cashPositionForMonth } from "@/lib/cash-position";
import { categoryLabel } from "@/lib/categories";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatMonthTitle } from "@/lib/money";
import {
  budgetUsage,
  committedFuture,
  financialSnapshot,
  monthTransactions,
  planProgress,
  spendByCategory,
  spendByPerson,
  totalsForMonth,
  type FinancialSnapshot,
} from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { addMonthsKey, cn, todayIso, uid } from "@/lib/utils";

export const Route = createFileRoute("/conselhos")({ component: ConselhosPage });

function diagnosis(snapshot: FinancialSnapshot, netAvailable: number | null) {
  if (netAvailable !== null && netAvailable < 0) {
    return `O orçamento pode até mostrar resultado positivo, mas o caixa identificado fica ${formatBRL(Math.abs(netAvailable))} negativo depois das faturas. A prioridade é liquidez, não poupança.`;
  }
  if (snapshot.income <= 0) {
    return "Ainda não tenho uma entrada de renda registrada neste mês. Capture seu holerite ou extrato para eu montar um diagnóstico confiável.";
  }
  if (snapshot.margin < 0) {
    return `As saídas previstas já ultrapassam sua renda em ${formatBRL(Math.abs(snapshot.margin))}. A prioridade agora é voltar ao positivo antes de criar novas metas.`;
  }
  if (snapshot.spendRatio > 0.9) {
    return `Quase toda a sua renda já está comprometida. Sua margem prevista é de ${formatBRL(snapshot.margin)}, então qualquer gasto novo precisa ser bem escolhido.`;
  }
  if (snapshot.installmentRatio > 0.2) {
    return `Seu mês ainda fecha positivo, mas as parcelas estão ocupando ${(snapshot.installmentRatio * 100).toFixed(0)}% da renda registrada. Vale proteger sua margem antes de assumir novas prestações.`;
  }
  if (snapshot.margin / snapshot.income >= 0.2) {
    return `Seu orçamento tem uma margem positiva de ${formatBRL(snapshot.margin)}. Antes de chamar isso de sobra, confira também o caixa real e as faturas do período.`;
  }
  return `Seu orçamento está equilibrado, com resultado previsto de ${formatBRL(snapshot.margin)}. O foco agora é manter o ritmo e proteger o caixa disponível.`;
}

function healthLabel(status: FinancialSnapshot["status"], netAvailable: number | null) {
  if (netAvailable !== null && netAvailable < 0) return "Caixa apertado";
  if (status === "Saudavel") return "Saudável";
  if (status === "Atencao") return "Atenção";
  if (status === "Critica") return "Crítica";
  return status;
}

function ConselhosPage() {
  const state = useFinanceStore();
  const month = state.viewMonth;
  const summaries = useDocumentStore((s) => s.summaries);
  const cash = cashPositionForMonth(summaries, month);
  const setAdvice = useFinanceStore((s) => s.setAdvice);
  const [busy, setBusy] = useState(false);
  const cached = state.advice?.monthKey === month ? state.advice : null;
  const snapshot = financialSnapshot(state, month);
  const rows = monthTransactions(state, month);
  const topCategory = spendByCategory(rows)[0] ?? null;
  const futureCommitted = committedFuture(state, todayIso());
  const liquidityDeficit = cash.netAvailable !== null && cash.netAvailable < 0 ? Math.abs(cash.netAvailable) : 0;

  const priorities: string[] = [];
  if (liquidityDeficit > 0) {
    priorities.push(`Cobrir ${formatBRL(liquidityDeficit)} de déficit de caixa identificado após as faturas.`);
  }
  if (snapshot.income <= 0) {
    priorities.push("Registrar a renda do mês para liberar um diagnóstico completo.");
    priorities.push("Manter gastos e parcelas atualizados para o Núcleo aprender seu padrão.");
  } else {
    if (snapshot.margin < 0) {
      priorities.push(`Reduzir pelo menos ${formatBRL(snapshot.recoveryTarget)} para voltar ao positivo com uma pequena margem.`);
    } else if (liquidityDeficit === 0) {
      priorities.push(`Proteger o resultado previsto de ${formatBRL(snapshot.margin)} até o fechamento do mês.`);
    }
    if (snapshot.installmentExpense > 0) {
      priorities.push(
        snapshot.installmentRatio >= 0.2
          ? `Evitar novas parcelas: as atuais já representam ${(snapshot.installmentRatio * 100).toFixed(0)}% da renda do mês.`
          : `Acompanhar ${formatBRL(snapshot.installmentExpense)} em parcelas neste mês antes de assumir novas prestações.`,
      );
    } else {
      priorities.push("Evitar criar novas parcelas sem antes simular o impacto no caixa.");
    }
    if (topCategory) {
      priorities.push(`Revisar ${categoryLabel(topCategory.category, state.customCategories)}, hoje sua maior categoria de gasto em ${formatBRL(topCategory.amount)}.`);
    } else {
      priorities.push("Continuar registrando os gastos para identificar onde existe espaço real de ajuste.");
    }
  }

  const goal =
    liquidityDeficit > 0
      ? {
          title: `Recuperar ${formatBRL(liquidityDeficit)} de caixa`,
          body: "Antes de guardar dinheiro, cubra o que falta entre os saldos finais identificados e as faturas ligadas ao mês.",
        }
      : snapshot.income <= 0
        ? {
            title: "Completar o Raio-X",
            body: "Registre ao menos uma entrada de renda neste mês. O holerite pode ser enviado pela Captura.",
          }
        : snapshot.margin < 0
          ? {
              title: `Recuperar ${formatBRL(snapshot.recoveryTarget)}`,
              body: "Essa é a redução estimada para sair do negativo e terminar o mês com uma pequena margem de segurança.",
            }
          : snapshot.suggestedSavings > 0 && cash.netAvailable !== null
            ? {
                title: `Guardar até ${formatBRL(Math.min(snapshot.suggestedSavings, Math.max(0, cash.netAvailable)))}`,
                body: "A meta respeita tanto o resultado do orçamento quanto o caixa líquido identificado depois das faturas.",
              }
            : {
                title: "Fechar o mês no azul",
                body: "Por enquanto, preservar o caixa é mais importante do que forçar uma meta de investimento.",
              };

  async function run() {
    setBusy(true);
    try {
      const prev = totalsForMonth(state, addMonthsKey(month, -1));
      const totals = totalsForMonth(state, month);
      const people = spendByPerson(rows, state.people).map((p) => ({
        name: p.person.name,
        spent: p.amount,
      }));
      const categories = budgetUsage(state, month).map((b) => ({
        label: categoryLabel(b.category, state.customCategories),
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
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const savingsPattern = /guardar|poupar|investir|reserva/i;
      const filteredItems = liquidityDeficit > 0
        ? result.items.filter((item) => !savingsPattern.test(`${item.title} ${item.body}`))
        : result.items;
      const liquidityItem = liquidityDeficit > 0
        ? {
            id: uid(),
            title: "Primeiro: recompor o caixa",
            body: `Os saldos finais identificados menos as faturas deixam ${formatBRL(liquidityDeficit)} descobertos. Priorize esse valor antes de poupar ou assumir novas parcelas.`,
            impact: 0,
            category: null,
            severity: "high" as const,
          }
        : null;

      setAdvice({
        monthKey: month,
        generatedAt: new Date().toISOString(),
        summary:
          liquidityDeficit > 0
            ? `O resultado do orçamento não representa dinheiro livre. O caixa líquido identificado está negativo em ${formatBRL(liquidityDeficit)}. ${result.summary}`
            : result.summary,
        items: liquidityItem ? [liquidityItem, ...filteredItems].slice(0, 6) : filteredItems,
      });
    } catch {
      toast.error("Não consegui analisar agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col px-5 pb-8 pt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Núcleo</p>
          <h1 className="font-display text-3xl tracking-tight">Seu financeiro, sem complicação</h1>
        </div>
        <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-[10px] font-medium text-primary">
          {formatMonthTitle(month)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Veja o que precisa de atenção, converse com seus dados e transforme o diagnóstico em ações simples.
      </p>

      <section className="mt-4 overflow-hidden rounded-2xl bg-primary text-primary-fg shadow-[var(--shadow-border)]">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary-fg/65">
                Situação projetada
              </p>
              <h2 className="mt-1 font-display text-2xl">
                {healthLabel(snapshot.status, cash.netAvailable)}
              </h2>
            </div>
            <span className="rounded-full bg-primary-fg/10 px-3 py-1 text-xs font-medium">
              {snapshot.score === null ? "Sem nota" : `${snapshot.score}/100`}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-primary-fg/80">
            {diagnosis(snapshot, cash.netAvailable)}
          </p>
        </div>

        <div className="grid grid-cols-3 border-t border-primary-fg/10 bg-primary-fg/[0.04]">
          <HeroMetric
            label="Disponível"
            value={cash.netAvailable === null ? "—" : formatBRL(cash.netAvailable)}
            danger={cash.netAvailable !== null && cash.netAvailable < 0}
          />
          <HeroMetric
            label="Projeção"
            value={formatBRL(snapshot.margin)}
            danger={snapshot.margin < 0}
          />
          <HeroMetric label="Parcelas" value={formatBRL(snapshot.installmentExpense)} />
        </div>
      </section>

      <AdvisorChat month={month} />

      <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h2 className="font-display text-xl">O que fazer agora</h2>
        </div>
        <ol className="mt-3 flex flex-col gap-3">
          {priorities.slice(0, 3).map((item, index) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl bg-primary-soft p-3.5 text-primary">
          <div className="flex items-center gap-2">
            <Target className="size-4" />
            <p className="text-[10px] font-medium uppercase tracking-wide">Meta do momento</p>
          </div>
          <p className="mt-1 font-display text-xl">{goal.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-primary/80">{goal.body}</p>
        </div>
      </section>

      <FinancialAlertsCard month={month} />

      <details className="group mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Dados do mês</p>
            <h2 className="font-display text-xl">Ver Raio-X completo</h2>
          </div>
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Entradas recebidas" value={formatBRL(snapshot.receivedIncome)} />
          <Metric label="Entradas previstas" value={formatBRL(snapshot.expectedIncome)} />
          <Metric label="Saídas realizadas" value={formatBRL(snapshot.postedExpense)} />
          <Metric label="Saídas programadas" value={formatBRL(snapshot.scheduledExpense)} />
          <Metric label="Saldo nas contas" value={cash.cashKnown ? formatBRL(cash.cashBalance) : "—"} />
          <Metric label="Faturas a pagar" value={cash.billsKnown ? formatBRL(cash.billsDue) : "—"} />
        </div>

        <div className="mt-2 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Resultado previsto do orçamento</p>
              <p className={cn("font-display text-2xl tabular-nums", snapshot.margin < 0 && "text-danger")}>
                {formatBRL(snapshot.margin)}
              </p>
            </div>
            <WalletCards className="size-5 text-primary" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Compromissos futuros cadastrados: {formatBRL(futureCommitted)}
          </p>
        </div>
      </details>

      <details className="group mt-3 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Plano detalhado</p>
              <h2 className="font-display text-xl">Orientação do consultor</h2>
            </div>
          </div>
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          A análise usa os números do orçamento e respeita o caixa real. Ela não recomenda poupança quando as contas e faturas indicam déficit.
        </p>

        <Button className="mt-4 w-full" onClick={() => void run()} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Analisando…
            </>
          ) : cached ? (
            "Atualizar orientação"
          ) : (
            "Gerar orientação"
          )}
        </Button>

        {cached ? (
          <div className="stagger-in mt-4 flex flex-col gap-3">
            <p className="rounded-xl bg-surface p-4 text-sm leading-relaxed shadow-[var(--shadow-border)]">
              {cached.summary}
            </p>
            {cached.items.map((item) => (
              <article key={item.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{item.title}</h3>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
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
                  <span className="text-muted">
                    {item.category ? categoryLabel(item.category, state.customCategories) : "Geral"}
                  </span>
                  {item.impact > 0 ? (
                    <span className="font-medium text-primary tabular-nums">−{formatBRL(item.impact)}/mês</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </details>

      <p className="mt-5 text-center text-[10px] leading-relaxed text-muted">
        Base atual: {snapshot.transactionCount} lançamento{snapshot.transactionCount === 1 ? "" : "s"}, {cash.cashSources} saldo{cash.cashSources === 1 ? "" : "s"} final{cash.cashSources === 1 ? "" : "is"}, {cash.billCount} fatura{cash.billCount === 1 ? "" : "s"} e {state.plans.length} plano{state.plans.length === 1 ? "" : "s"} de parcelas.
      </p>
    </main>
  );
}

function HeroMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="text-[10px] text-primary-fg/60">{label}</p>
      <p className={cn("mt-0.5 truncate font-display text-sm tabular-nums", danger && "text-[#ffd6cf]")}>
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-1 font-display text-base tabular-nums">{value}</p>
    </div>
  );
}
