import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/category-picker";
import { MovementKindPicker } from "@/components/movement-kind-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { categoriesFor, categoryLabel } from "@/lib/categories";
import { rememberCategoryRule } from "@/lib/category-rules";
import { rememberMerchantAlias } from "@/lib/merchant-aliases";
import { NATURE_LABEL, natureOf } from "@/lib/movement-nature";
import { formatBRL, parseLooseAmount } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import type { Transaction, TxNature } from "@/lib/types";
import { cn, monthKey } from "@/lib/utils";

type TransactionInsight = {
  summary: string;
  reason: string;
  suggestedCategory: string | null;
  suggestedType: "expense" | "income" | null;
  suggestedNature: TxNature | null;
};

export function TransactionEdit({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const state = useFinanceStore();
  const update = useFinanceStore((s) => s.updateTransaction);
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const transactions = useFinanceStore((s) => s.transactions);
  const customCategories = useFinanceStore((s) => s.customCategories);
  const geminiKey = useFinanceStore((s) => s.geminiKey);
  const live = useFinanceStore((s) => s.transactions.find((item) => item.id === tx.id)) ?? tx;

  const [merchant, setMerchant] = useState(live.merchant);
  const [description, setDescription] = useState(live.description);
  const [date, setDate] = useState(live.date);
  const [amountText, setAmountText] = useState(formatEditAmount(live.amount));
  const [aiBusy, setAiBusy] = useState(false);
  const [insight, setInsight] = useState<TransactionInsight | null>(null);

  useEffect(() => {
    setMerchant(live.merchant);
    setDescription(live.description);
    setDate(live.date);
    setAmountText(formatEditAmount(live.amount));
    setInsight(null);
  }, [live.id]);

  const availableCategories = useMemo(
    () => [
      ...categoriesFor("gasto", customCategories).map((item) => ({ ...item, group: "gasto" as const })),
      ...categoriesFor("entrada", customCategories).map((item) => ({ ...item, group: "entrada" as const })),
    ],
    [customCategories],
  );

  function assignCreditCard(institution: "Nubank" | "Itaú") {
    const related = live.installmentId
      ? transactions.filter((row) => row.installmentId === live.installmentId)
      : [live];

    for (const row of related) {
      const rowDate = row.id === live.id ? date || row.date : row.date;
      update(row.id, {
        accountId: null,
        originKind: "credit_card",
        originInstitution: institution,
        originLabel: `Cartão ${institution}`,
        paymentMethod: "Cartão de crédito",
        competenceMonth:
          row.originKind === "credit_card" && row.competenceMonth
            ? row.competenceMonth
            : monthKey(rowDate),
      });
    }
  }

  function saveCore() {
    const amount = parseLooseAmount(amountText);
    const nextMerchant = merchant.trim() || live.merchant;
    if (live.source !== "manual" && nextMerchant !== live.merchant) {
      rememberMerchantAlias(live.merchant, nextMerchant);
    }
    update(live.id, {
      merchant: nextMerchant,
      description: description.trim() || nextMerchant || live.description,
      date,
      amount: amount > 0 ? amount : live.amount,
    });
  }

  async function analyzeMovement() {
    if (!geminiKey.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const normalizedMerchant = normalizeMerchant(merchant.trim() || live.merchant);
      const similarTransactions = transactions
        .filter(
          (row) =>
            row.id !== live.id &&
            normalizeMerchant(row.merchant) === normalizedMerchant,
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8)
        .map((row) => ({
          merchant: row.merchant,
          amount: row.amount,
          date: row.date,
          type: row.type,
          nature: natureOf(row),
          category: row.category,
        }));

      const { analyzeTransactionWithGemini } = await import("@/lib/gemini");
      const result = await analyzeTransactionWithGemini({
        apiKey: geminiKey,
        transaction: {
          merchant: merchant.trim() || live.merchant,
          description: description.trim() || live.description,
          amount: parseLooseAmount(amountText) || live.amount,
          date: date || live.date,
          type: live.type,
          nature: natureOf(live),
          category: live.category,
          originLabel: live.originLabel,
          originInstitution: live.originInstitution,
          originKind: live.originKind,
          paymentMethod: live.paymentMethod,
          installmentIndex: live.installmentIndex,
          installmentTotal: live.installmentTotal,
        },
        similarTransactions,
        categories: availableCategories,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setInsight(result.insight);
    } catch {
      toast.error("Não consegui analisar este movimento agora.");
    } finally {
      setAiBusy(false);
    }
  }

  function applyInsight() {
    if (!insight) return;
    const patch: Partial<Transaction> = {};

    if (insight.suggestedType) patch.type = insight.suggestedType;
    if (insight.suggestedNature) {
      patch.nature = insight.suggestedNature;
      patch.natureLocked = true;
    }
    if (insight.suggestedCategory) {
      patch.category = insight.suggestedCategory;
      rememberCategoryRule(merchant.trim() || live.merchant, insight.suggestedCategory);
    }

    if (!Object.keys(patch).length) return;
    update(live.id, patch);
    toast.success("Sugestão do Núcleo aplicada");
    setInsight(null);
  }

  const nature = natureOf(live);
  const originLabel = live.originLabel?.trim() || "Origem não identificada";
  const hasSuggestion = Boolean(
    insight?.suggestedCategory || insight?.suggestedType || insight?.suggestedNature,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        className="absolute inset-0 bg-ink/40"
        aria-label="Fechar"
        onClick={() => {
          saveCore();
          onClose();
        }}
      />

      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-[430px] flex-col rounded-t-2xl bg-elevated pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-border)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />

        <div className="overflow-y-auto px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Movimento</p>
              <h2 className="mt-0.5 truncate font-display text-2xl">{merchant || live.merchant}</h2>
              <p className="mt-1 text-xs text-muted">
                {live.type === "income" ? "Entrada" : "Saída"} · {categoryLabel(live.category, customCategories)}
              </p>
            </div>
            <p className={cn(
              "shrink-0 font-display text-xl tabular-nums",
              live.type === "income" && "text-income",
            )}>
              {live.type === "income" ? "+" : "−"}{formatBRL(live.amount)}
            </p>
          </div>

          <section className="mt-4 rounded-xl bg-primary-soft p-3.5 text-primary">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wide">Núcleo</p>
                <p className="text-sm font-medium">Entender este movimento</p>
              </div>
              {geminiKey.trim() ? (
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void analyzeMovement()}
                  className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg disabled:opacity-60"
                >
                  {aiBusy ? "Analisando…" : insight ? "Analisar novamente" : "Analisar"}
                </button>
              ) : (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium">IA opcional</span>
              )}
            </div>

            {insight ? (
              <div className="mt-3 border-t border-primary/15 pt-3">
                <p className="text-sm font-medium">{insight.summary}</p>
                <p className="mt-1 text-xs leading-relaxed text-primary/80">{insight.reason}</p>

                {hasSuggestion ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {insight.suggestedCategory ? (
                        <SuggestionChip>
                          Categoria: {categoryLabel(insight.suggestedCategory, customCategories)}
                        </SuggestionChip>
                      ) : null}
                      {insight.suggestedType ? (
                        <SuggestionChip>
                          {insight.suggestedType === "income" ? "Entrada" : "Saída"}
                        </SuggestionChip>
                      ) : null}
                      {insight.suggestedNature ? (
                        <SuggestionChip>{NATURE_LABEL[insight.suggestedNature]}</SuggestionChip>
                      ) : null}
                    </div>
                    <Button className="mt-3 w-full" size="sm" onClick={applyInsight}>
                      Aplicar sugestão
                    </Button>
                  </>
                ) : (
                  <p className="mt-2 text-xs font-medium">A classificação atual parece coerente.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-primary/75">
                {geminiKey.trim()
                  ? "O Núcleo compara este lançamento com origem, descrição e seu histórico para explicar ou sugerir uma correção."
                  : "Mesmo sem IA, o Núcleo continua aprendendo correções de nomes e categorias feitas por você."}
              </p>
            )}
          </section>

          <section className="mt-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Essencial</p>

            <label className="mt-3 block text-xs font-medium text-muted">Nome / loja</label>
            <input
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-muted">Valor</label>
                <input
                  inputMode="decimal"
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-elevated px-3 text-sm tabular-nums shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
                />
              </div>
            </div>

            {nature === "budget" ? (
              <>
                <p className="mb-2 mt-4 text-xs font-medium text-muted">Categoria</p>
                <CategoryPicker
                  value={live.category}
                  group={live.type === "income" ? "entrada" : "gasto"}
                  onChange={(id) => {
                    rememberCategoryRule(merchant.trim() || live.merchant, id);
                    update(live.id, { category: id });
                  }}
                />
              </>
            ) : null}

            <p className="mb-2 mt-4 text-xs font-medium text-muted">Quem</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => update(live.id, { personId: person.id })}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                    live.personId === person.id ? "bg-primary text-primary-fg" : "bg-line text-fg",
                  )}
                >
                  <PersonAvatar person={person} size="sm" />
                  {person.name}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Conta ou cartão</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const patch: Partial<Transaction> = { accountId: null };
                  if (live.originKind === "credit_card") {
                    patch.originKind = live.source === "manual" ? "manual" : "unknown";
                    patch.originInstitution = undefined;
                    patch.originLabel = live.source === "manual" ? "Lançamento manual" : undefined;
                    patch.paymentMethod = undefined;
                    patch.competenceMonth = undefined;
                  }
                  update(live.id, patch);
                }}
                className={cn(
                  "h-9 rounded-full px-3 text-xs font-medium",
                  !live.accountId && live.originKind !== "credit_card"
                    ? "bg-primary text-primary-fg"
                    : "bg-line text-fg",
                )}
              >
                Sem conta
              </button>

              {accounts
                .filter((account) => account.active || account.id === live.accountId)
                .map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() =>
                      update(live.id, {
                        accountId: account.id,
                        originKind: "bank_account",
                        originInstitution: account.institution || account.name,
                        originLabel: `Conta ${account.institution || account.name}`,
                        competenceMonth: undefined,
                        paymentMethod: live.originKind === "credit_card" ? undefined : live.paymentMethod,
                      })
                    }
                    className={cn(
                      "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                      live.accountId === account.id && live.originKind !== "credit_card"
                        ? "bg-primary text-primary-fg"
                        : "bg-line text-fg",
                    )}
                  >
                    {account.name}
                  </button>
                ))}

              {(["Nubank", "Itaú"] as const).map((institution) => (
                <button
                  key={institution}
                  type="button"
                  onClick={() => assignCreditCard(institution)}
                  className={cn(
                    "h-9 rounded-full px-3 text-xs font-medium",
                    live.originKind === "credit_card" && live.originInstitution === institution
                      ? "bg-primary text-primary-fg"
                      : "bg-line text-fg",
                  )}
                >
                  Cartão {institution}
                </button>
              ))}
            </div>
          </section>

          <details className="group mt-3 rounded-xl bg-surface shadow-[var(--shadow-border)]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Mais detalhes</span>
                <span className="block text-[11px] text-muted">{originLabel}</span>
              </span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>

            <div className="border-t border-line px-4 pb-4 pt-3">
              <p className="mb-2 text-xs font-medium text-muted">Como entra no orçamento</p>
              <MovementKindPicker
                type={live.type}
                nature={live.nature}
                onChange={(next) =>
                  update(live.id, {
                    ...next,
                    natureLocked: true,
                    category:
                      next.nature === "budget" && next.type === "income"
                        ? "salario"
                        : live.category,
                  })
                }
              />

              <label className="mt-4 block text-xs font-medium text-muted">Detalhe</label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
              />

              <div className="mt-4 rounded-lg bg-elevated p-3 text-xs shadow-[var(--shadow-border)]">
                <p className="font-medium">{originLabel}</p>
                <p className="mt-1 text-muted">
                  {live.paymentMethod || "Forma do movimento não identificada"}
                </p>
                {live.originKind === "credit_card" && live.competenceMonth ? (
                  <p className="mt-1 text-muted">Competência: {formatCompetenceMonth(live.competenceMonth)}</p>
                ) : null}
                {live.sourceFileName ? (
                  <p className="mt-1 break-all text-[10px] text-muted">Arquivo: {live.sourceFileName}</p>
                ) : null}
              </div>
            </div>
          </details>
        </div>

        <div className="border-t border-line bg-elevated px-5 pt-3">
          <Button
            className="w-full"
            onClick={() => {
              saveCore();
              onClose();
            }}
          >
            Salvar alterações
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
      {children}
    </span>
  );
}

function normalizeMerchant(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatEditAmount(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatCompetenceMonth(key: string) {
  const [year, month] = key.split("-");
  return month && year ? `${month}/${year}` : key;
}
