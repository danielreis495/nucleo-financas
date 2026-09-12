import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cashPositionForMonth } from "@/lib/cash-position";
import { categoryLabel } from "@/lib/categories";
import { useDocumentStore } from "@/lib/document-store";
import { cashFlowForecast } from "@/lib/forecast";
import { recurringExpenses } from "@/lib/recurring";
import {
  accountBalance,
  financialSnapshot,
  monthTransactions,
  planProgress,
  spendByCategory,
  totalsForMonth,
} from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import { addMonthsKey, todayIso, uid } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

const CHAT_KEY = "nucleo-advisor-chat-v1";

const STARTERS = [
  "Por que meu mês ficou assim?",
  "O que mais está pesando no meu orçamento?",
  "Quanto posso gastar sem apertar meu caixa?",
  "Quais contas devo priorizar agora?",
];

function loadMessages() {
  if (typeof window === "undefined") return [] as ChatMessage[];
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

export function AdvisorChat({ month }: { month: string }) {
  const state = useFinanceStore();
  const summaries = useDocumentStore((s) => s.summaries);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const context = useMemo(() => {
    const cash = cashPositionForMonth(summaries, month, state.transactions);
    const snapshot = financialSnapshot(state, month);
    const currentRows = monthTransactions(state, month, true, true);
    const categories = spendByCategory(monthTransactions(state, month)).slice(0, 12);
    const recurring = recurringExpenses(state, 12);
    const forecast30 = cashFlowForecast(state, todayIso(), 30);
    const forecast60 = cashFlowForecast(state, todayIso(), 60);
    const forecast90 = cashFlowForecast(state, todayIso(), 90);

    const monthlyHistory = Array.from({ length: 6 }, (_, index) => addMonthsKey(month, -index))
      .map((key) => ({
        month: key,
        totals: totalsForMonth(state, key),
        categories: spendByCategory(monthTransactions(state, key))
          .slice(0, 10)
          .map((row) => ({
            category: categoryLabel(row.category, state.customCategories),
            amount: row.amount,
          })),
      }));

    const recentTransactions = [...state.transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 120)
      .map((tx) => ({
        date: tx.date,
        competenceMonth: tx.competenceMonth,
        merchant: tx.merchant,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        nature: tx.nature ?? "budget",
        status: tx.status,
        category: categoryLabel(tx.category, state.customCategories),
        origin: tx.originLabel,
        paymentMethod: tx.paymentMethod,
      }));

    return {
      selectedMonth: month,
      household: state.householdName,
      budget: {
        income: snapshot.income,
        postedExpense: snapshot.postedExpense,
        scheduledExpense: snapshot.scheduledExpense,
        plannedOutflow: snapshot.plannedOutflow,
        result: snapshot.margin,
        installmentExpense: snapshot.installmentExpense,
        status: snapshot.status,
        score: snapshot.score,
        transactionCount: currentRows.length,
      },
      cash: {
        cashKnown: cash.cashKnown,
        cashBalance: cash.cashBalance,
        openBillsTotal: cash.billsDue,
        netAvailable: cash.netAvailable,
        bills: cash.billRows,
      },
      accounts: state.accounts
        .filter((account) => account.active)
        .map((account) => ({
          name: account.name,
          institution: account.institution,
          type: account.type,
          calculatedBalance: accountBalance(state, account),
        })),
      topCategories: categories.map((row) => ({
        category: categoryLabel(row.category, state.customCategories),
        amount: row.amount,
      })),
      recurringExpenses: recurring.map((item) => ({
        merchant: item.merchant,
        estimatedMonthlyAmount: item.averageAmount,
        nextEstimatedDate: item.nextDate,
        confidence: item.confidence,
      })),
      forecasts: {
        next30Days: {
          expectedOutflow: forecast30.expectedOutflow,
          expectedIncome: forecast30.expectedIncome,
          expectedNet: forecast30.expectedNet,
        },
        next60Days: {
          expectedOutflow: forecast60.expectedOutflow,
          expectedIncome: forecast60.expectedIncome,
          expectedNet: forecast60.expectedNet,
        },
        next90Days: {
          expectedOutflow: forecast90.expectedOutflow,
          expectedIncome: forecast90.expectedIncome,
          expectedNet: forecast90.expectedNet,
          nextItems: forecast90.items.slice(0, 18),
        },
      },
      installments: state.plans.map((plan) => {
        const progress = planProgress(state, plan.id);
        return {
          title: plan.title,
          merchant: plan.merchant,
          installmentAmount: plan.installmentAmount,
          paid: progress.paid,
          total: progress.total,
          remainingAmount: progress.remainingAmount,
          nextDate: progress.next?.date,
        };
      }),
      monthlyHistory,
      recentTransactions,
    };
  }, [month, state, summaries]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30)));
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setDraft("");
    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage].slice(-30);
    setMessages(nextMessages);
    setBusy(true);
    try {
      const { askFinancialQuestionWithGemini } = await import("@/lib/gemini");
      const result = await askFinancialQuestionWithGemini({
        question,
        context,
        history: nextMessages.slice(-8).map((item) => ({ role: item.role, text: item.text })),
        apiKey: state.geminiKey,
      });
      if (!result.ok) {
        toast.error(result.error);
        setMessages((current) => [
          ...current,
          {
            id: uid(),
            role: "assistant",
            text: result.error,
            createdAt: new Date().toISOString(),
          },
        ].slice(-30));
        return;
      }
      setSuggestions(result.suggestions);
      setMessages((current) => [
        ...current,
        {
          id: uid(),
          role: "assistant",
          text: result.answer,
          createdAt: new Date().toISOString(),
        },
      ].slice(-30));
    } catch {
      toast.error("Não consegui consultar seus dados agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Bot className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium tracking-wide text-primary uppercase">Núcleo IA</p>
            <h2 className="font-display text-xl">Converse com suas finanças</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              As respostas usam seus lançamentos, contas, faturas, parcelas e previsões do Núcleo.
            </p>
          </div>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            aria-label="Limpar conversa"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
            onClick={() => {
              setMessages([]);
              setSuggestions([]);
              localStorage.removeItem(CHAT_KEY);
            }}
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      {messages.length === 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => void ask(starter)}
              className="rounded-full bg-surface px-3 py-2 text-left text-xs font-medium shadow-[var(--shadow-border)]"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  message.role === "user"
                    ? "max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-fg"
                    : "max-w-[94%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed shadow-[var(--shadow-border)]"
                }
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          ))}
          {busy ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-xs text-muted shadow-[var(--shadow-border)]">
                <Sparkles className="size-3.5 animate-pulse text-primary" />
                Analisando seus dados…
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      {suggestions.length > 0 && !busy ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void ask(suggestion)}
              className="shrink-0 rounded-full bg-primary-soft px-3 py-2 text-xs font-medium text-primary"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pergunte sobre seus gastos, caixa ou próximos meses…"
          className="h-11 min-w-0 flex-1 rounded-lg bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || busy} aria-label="Enviar pergunta">
          <Send className="size-4" />
        </Button>
      </form>
    </section>
  );
}
