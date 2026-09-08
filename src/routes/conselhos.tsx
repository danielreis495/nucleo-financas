import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Sparkles, Target, WalletCards } from "lucide-react";
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

      const result = state.geminiKey
        ? await (await import("@/lib/gemini")).adviseWithGemini({
            monthKey: month,
            householdName: state.householdName,
            people,
            totals,
            previous: { expense: prev.expense },
            categories,
            subscriptions,
            installments,
            merchants,
            apiKey: state.geminiKey,
          })
        : await adviseSpending({
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
    <main className="flex flex-col px-5 pt-6 pb-8">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Consultor financeiro</p>
      <h1 className="font-display text-3xl tracking-tight">Raio-X de {formatMonthTitle(month)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        O Núcleo separa resultado do orçamento de caixa real. As orientações abaixo priorizam liquidez quando houver faturas sem cobertura.
      </p>

      <section className="mt-5 rounded-xl bg-primary px-5 py-5 text-primary-fg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-primary-fg/70 uppercase">Saúde financeira</p>
            <p className="mt-1 font-display text-4xl tabular-nums">
              {snapshot.score === null ? "—" : `${snapshot.score}/100`}
            </p>
          </div>
          <span className="rounded-full bg-primary-fg/10 px-3 py-1 text-xs font-medium">
            {healthLabel(snapshot.status, cash.netAvailable)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-primary-fg/85">{diagnosis(snapshot, cash.netAvailable)}</p>
      </section>

      <section className="mt-5">
        <h2 className="font-display text-xl">Seu dinheiro</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Entradas do orçamento" value={formatBRL(snapshot.income)} />
          <Metric label="Saídas realizadas" value={formatBRL(snapshot.postedExpense)} />
          <Metric label="Saldo nas contas" value={cash.cashKnown ? formatBRL(cash.cashBalance) : "—"} />
          <Metric label="Faturas a pagar" value={cash.billsKnown ? formatBRL(cash.billsDue) : "—"} />
          <Metric label="Disponível líquido" value={cash.netAvailable === null ? "—" : formatBRL(cash.netAvailable)} />
          <Metric label="Parcelas no mês" value={formatBRL(snapshot.installmentExpense)} />
        </div>
        <div className="mt-2 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
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
      </section>

      <section className="mt-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="font-display text-xl">3 prioridades agora</h2>
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
      </section>

      <section className="mt-3 rounded-xl bg-primary-soft p-4 text-primary">
        <div className="flex items-center gap-2">
          <Target className="size-5" />
          <p className="text-xs font-medium tracking-wide uppercase">Meta recomendada</p>
        </div>
        <h2 className="mt-2 font-display text-2xl">{goal.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-primary/80">{goal.body}</p>
      </section>

      <section className="mt-6 border-t border-line pt-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h2 className="font-display text-xl">Orientação detalhada</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          A IA recebe os números do orçamento; o Núcleo aplica por cima a regra de caixa real para não recomendar poupança quando houver déficit após faturas.
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
            "Gerar orientação do consultor"
          )}
        </Button>

        {cached ? (
          <div className="stagger-in mt-4 flex flex-col gap-3">
            <p className="rounded-xl bg-elevated p-4 text-sm leading-relaxed shadow-[var(--shadow-border)]">
              {cached.summary}
            </p>
            {cached.items.map((item) => (
              <article key={item.id} className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{item.title}</h3>
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
      </section>

      <p className="mt-6 text-center text-xs text-muted">
        Base: {snapshot.transactionCount} lançamento{snapshot.transactionCount === 1 ? "" : "s"}, {cash.cashSources} saldo{cash.cashSources === 1 ? "" : "s"} final{cash.cashSources === 1 ? "" : "is"}, {cash.billCount} fatura{cash.billCount === 1 ? "" : "s"} e {state.plans.length} plano{state.plans.length === 1 ? "" : "s"} de parcelas.
      </p>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-elevated p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-display text-lg tabular-nums">{value}</p>
    </div>
  );
}
