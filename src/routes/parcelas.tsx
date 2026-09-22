import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Landmark,
  Plus,
  Trash2,
} from "lucide-react";
import { CategoryPicker } from "@/components/category-picker";
import { InstallmentReconciliation } from "@/components/installment-reconciliation";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/categories";
import { formatBRL, formatBRLCompact, formatLongDate } from "@/lib/money";
import { committedFuture, planProgress } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { CategoryId, InstallmentKind } from "@/lib/types";
import { cn, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/parcelas")({ component: ParcelasPage });

function ParcelasPage() {
  const state = useFinanceStore();
  const addPlan = useFinanceStore((s) => s.addInstallmentPlan);
  const committed = committedFuture(state, todayIso());
  const [open, setOpen] = useState(false);

  const plans = state.plans
    .map((plan) => ({ plan, progress: planProgress(state, plan.id) }))
    .filter((item) => item.progress.total > 0)
    .sort((a, b) => (a.progress.next?.date ?? "9").localeCompare(b.progress.next?.date ?? "9"));

  const active = plans.filter(({ progress }) => progress.paid < progress.total);
  const finished = plans.filter(({ progress }) => progress.paid >= progress.total);
  const monthlyCommitment = active.reduce((sum, { plan }) => sum + plan.installmentAmount, 0);
  const nextPlan = active.find(({ progress }) => Boolean(progress.next));

  return (
    <main className="flex flex-col px-5 pb-8 pt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Planejamento
          </p>
          <h1 className="font-display text-3xl tracking-tight">Parcelas e compromissos</h1>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[var(--shadow-border)]"
          aria-label="Cadastrar nova parcela"
        >
          <Plus className={cn("size-5 transition-transform", open && "rotate-45")} />
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Acompanhe o que ainda falta pagar e confirme pagamentos apenas quando eles realmente
        acontecerem.
      </p>

      {open ? (
        <NewPlanForm
          onSave={(data) => {
            addPlan(data);
            setOpen(false);
            toast.success("Parcelas programadas");
          }}
        />
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl bg-primary text-primary-fg shadow-[var(--shadow-border)]">
        <div className="px-5 pb-4 pt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary-fg/65">
            Total ainda comprometido
          </p>
          <p className="mt-1 font-display text-3xl tabular-nums">{formatBRL(committed)}</p>
          <p className="mt-1 text-xs text-primary-fg/70">
            {active.length} compromisso{active.length === 1 ? "" : "s"} ativo
            {active.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid grid-cols-2 divide-x divide-primary-fg/10 border-t border-primary-fg/10 bg-primary-fg/[0.04]">
          <HeroMetric label="Por mês" value={formatBRLCompact(monthlyCommitment)} />
          <HeroMetric
            label="Próxima"
            value={
              nextPlan?.progress.next
                ? formatLongDate(nextPlan.progress.next.date)
                : "Nada pendente"
            }
          />
        </div>
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Em andamento</p>
          <h2 className="font-display text-xl">Seus compromissos</h2>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-medium text-primary">
            {active.length} ativo{active.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {active.length === 0 ? (
          <li className="rounded-xl bg-elevated px-4 py-6 text-center shadow-[var(--shadow-border)]">
            <CheckCircle2 className="mx-auto size-5 text-primary" />
            <p className="mt-2 text-sm font-medium">Nenhuma parcela pendente</p>
            <p className="mt-1 text-xs text-muted">Cadastre pelo botão + ou importe uma fatura.</p>
          </li>
        ) : (
          active.map(({ plan, progress }) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              progress={progress}
              customCategories={state.customCategories}
              person={state.people.find((person) => person.id === plan.personId)}
            />
          ))
        )}
      </ul>

      {finished.length > 0 ? (
        <details className="group mt-4 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Quitados</span>
              <span className="block text-xs text-muted">
                {finished.length} compromisso{finished.length === 1 ? "" : "s"} concluído
                {finished.length === 1 ? "" : "s"}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="border-t border-line px-4">
            {finished.map(({ plan, progress }) => (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{plan.title}</p>
                  <p className="text-xs text-muted">
                    {progress.total}/{progress.total} parcelas
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-primary-soft px-2 py-1 text-[10px] font-medium text-primary">
                    Quitado
                  </span>
                  <DeletePlanButton planId={plan.id} title={plan.title} compact />
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}

function PlanCard({
  plan,
  progress,
  customCategories,
  person,
}: {
  plan: ReturnType<typeof useFinanceStore.getState>["plans"][number];
  progress: ReturnType<typeof planProgress>;
  customCategories: ReturnType<typeof useFinanceStore.getState>["customCategories"];
  person?: ReturnType<typeof useFinanceStore.getState>["people"][number];
}) {
  const ratio = progress.total ? progress.paid / progress.total : 0;
  const KindIcon = plan.kind === "loan" ? Landmark : CreditCard;
  const remainingInstallments = Math.max(0, progress.total - progress.paid);

  return (
    <li className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <KindIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{plan.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {categoryLabel(plan.category, customCategories)}
                {plan.account ? ` · ${plan.account}` : ""}
              </p>
            </div>
            {person ? <PersonAvatar person={person} size="sm" /> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-lg bg-surface shadow-[var(--shadow-border)]">
        <PlanMetric label="Parcela" value={formatBRLCompact(plan.installmentAmount)} />
        <PlanMetric label="Pagas" value={`${progress.paid}/${progress.total}`} />
        <PlanMetric label="Restante" value={formatBRLCompact(progress.remainingAmount)} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted">
          <span>{Math.round(ratio * 100)}% concluído</span>
          <span>
            {remainingInstallments} restante{remainingInstallments === 1 ? "" : "s"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-primary">
        <CalendarClock className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 text-xs">
          {progress.next ? (
            <>
              Próxima em <span className="font-medium">{formatLongDate(progress.next.date)}</span>
            </>
          ) : (
            "Próxima parcela ainda precisa de conferência"
          )}
        </p>
      </div>

      <details className="group mt-3 border-t border-line pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-primary">
          Gerenciar parcelas
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2">
          <InstallmentReconciliation planId={plan.id} />
          <PlanKindEditor planId={plan.id} kind={plan.kind} />
          <PlanCategoryEditor planId={plan.id} category={plan.category} />
          <DeletePlanButton planId={plan.id} title={plan.title} />
        </div>
      </details>
    </li>
  );
}

function DeletePlanButton({
  planId,
  title,
  compact = false,
}: {
  planId: string;
  title: string;
  compact?: boolean;
}) {
  const transactions = useFinanceStore((state) => state.transactions);
  const removePlan = useFinanceStore((state) => state.removeInstallmentPlan);
  const linked = transactions.filter((transaction) => transaction.installmentId === planId);
  const manualPayments = linked.filter((transaction) => Boolean(transaction.manualPayment)).length;
  const reconciledPayments = linked.filter((transaction) =>
    Boolean(transaction.reconciledPaymentId),
  ).length;

  function handleDelete() {
    if (!removePlan(planId)) {
      toast.error("Não encontrei esse parcelamento.");
      return;
    }
    toast.success("Parcelamento excluído. Pagamentos do extrato foram preservados.");
  }

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button
          variant={compact ? "ghost" : "secondary"}
          size={compact ? "icon" : "md"}
          className={cn("text-danger", compact ? "size-8" : "mt-3 w-full border border-danger/20")}
          aria-label={compact ? `Excluir ${title}` : undefined}
        >
          <Trash2 className="size-4" />
          {compact ? null : "Excluir parcelamento"}
        </Button>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-elevated p-5 shadow-2xl">
          <AlertDialog.Title className="font-display text-2xl">
            Excluir “{title}”?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted">
            Serão removidas {linked.length} parcela{linked.length === 1 ? "" : "s"} gerada
            {linked.length === 1 ? "" : "s"}
            {manualPayments > 0
              ? ` e ${manualPayments} baixa${manualPayments === 1 ? " manual" : "s manuais"}`
              : ""}
            .
            {reconciledPayments > 0
              ? ` ${reconciledPayments} pagamento${reconciledPayments === 1 ? "" : "s"} importado${reconciledPayments === 1 ? " continuará" : "s continuarão"} no extrato, apenas sem o vínculo.`
              : " Pagamentos importados do extrato não serão apagados."}
          </AlertDialog.Description>
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
            Essa ação não pode ser desfeita.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={handleDelete}>
                Excluir
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[10px] text-primary-fg/60">{label}</p>
      <p className="mt-0.5 truncate font-display text-sm tabular-nums">{value}</p>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5">
      <p className="truncate text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 truncate font-display text-sm tabular-nums">{value}</p>
    </div>
  );
}

function PlanKindEditor({ planId, kind }: { planId: string; kind: InstallmentKind }) {
  const update = useFinanceStore((s) => s.updateInstallmentKind);
  const [draft, setDraft] = useState(kind);

  return (
    <details className="mt-2 rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-border)]">
      <summary className="cursor-pointer text-xs font-medium">Corrigir tipo do compromisso</summary>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        O tipo define onde a parcela será conciliada. Cartão procura a cobrança na fatura;
        empréstimo e outro procuram o pagamento no extrato bancário.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            ["card", "Cartão"],
            ["loan", "Empréstimo / financiamento"],
            ["other", "Outro"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDraft(value)}
            aria-pressed={draft === value}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs font-medium",
              draft === value ? "bg-primary text-primary-fg" : "bg-line text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Button
        className="mt-2 w-full"
        variant="secondary"
        disabled={draft === kind}
        onClick={() => {
          if (update(planId, draft)) toast.success("Tipo atualizado. Parcelas preservadas.");
        }}
      >
        Salvar tipo
      </Button>
    </details>
  );
}

function PlanCategoryEditor({ planId, category }: { planId: string; category: CategoryId }) {
  const update = useFinanceStore((state) => state.updateInstallmentCategory);
  const [draft, setDraft] = useState(category);

  return (
    <details className="mt-2 rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-border)]">
      <summary className="cursor-pointer text-xs font-medium">Corrigir classificação</summary>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A nova categoria será aplicada ao parcelamento e a todas as parcelas geradas por ele.
      </p>
      <div className="mt-2">
        <CategoryPicker value={draft} group="gasto" onChange={setDraft} />
      </div>
      <Button
        className="mt-2 w-full"
        variant="secondary"
        disabled={draft === category}
        onClick={() => {
          if (update(planId, draft))
            toast.success("Classificação atualizada em todas as parcelas.");
        }}
      >
        Salvar classificação
      </Button>
    </details>
  );
}

function NewPlanForm({
  onSave,
}: {
  onSave: (data: {
    title: string;
    merchant: string;
    kind: InstallmentKind;
    installmentAmount: number;
    totalCount: number;
    startDate: string;
    personId: string;
    category: CategoryId;
  }) => void;
}) {
  const people = useFinanceStore((s) => s.people);
  const [kind, setKind] = useState<InstallmentKind>("card");
  const [category, setCategory] = useState<CategoryId>("outros");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [digits, setDigits] = useState("");
  const [count, setCount] = useState("12");
  const [title, setTitle] = useState("");
  const amount = digits ? Number(digits) / 100 : 0;
  const totalCount = Math.max(1, Math.min(120, Number(count) || 1));

  return (
    <form
      className="mt-4 rounded-2xl bg-elevated p-4 shadow-[var(--shadow-border)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || amount <= 0 || !count.trim()) return;
        onSave({
          title: title.trim(),
          merchant: title.trim(),
          kind,
          installmentAmount: amount,
          totalCount,
          startDate: todayIso(),
          personId,
          category,
        });
      }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Novo compromisso</p>
      <h2 className="mt-0.5 font-display text-xl">Cadastrar parcelamento</h2>

      <label className="mt-4 block text-xs font-medium text-muted">Nome</label>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Ex.: sofá, celular, empréstimo…"
        className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
      />

      <p className="mb-2 mt-4 text-xs font-medium text-muted">Tipo</p>
      <div className="flex gap-1.5">
        {(
          [
            ["card", "Cartão"],
            ["loan", "Empréstimo"],
            ["other", "Outro"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium",
              kind === id ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mt-4 rounded-xl bg-primary px-4 py-4 text-primary-fg">
        <p className="text-[10px] uppercase tracking-wide text-primary-fg/65">Valor da parcela</p>
        <p className="mt-1 font-display text-3xl tabular-nums">{formatBRL(amount)}</p>
      </section>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            className="h-10 rounded-lg bg-surface text-sm font-medium shadow-[var(--shadow-border)]"
            onClick={() => {
              if (key === "⌫") setDigits((value) => value.slice(0, -1));
              else setDigits((value) => (value + key).replace(/^0+/, "").slice(0, 8));
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[7rem_1fr] items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted" htmlFor="installment-count">
            Parcelas
          </label>
          <input
            id="installment-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={count}
            onChange={(event) => setCount(event.target.value.replace(/\D/g, "").slice(0, 3))}
            className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-center font-display text-lg tabular-nums shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
        </div>
        <p className="pb-2 text-sm text-muted">
          Total programado:{" "}
          <span className="font-medium text-fg">{formatBRL(amount * totalCount)}</span>
        </p>
      </div>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {[3, 6, 10, 12, 18, 24].map((number) => (
          <button
            key={number}
            type="button"
            onClick={() => setCount(String(number))}
            className={cn(
              "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
              totalCount === number ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            {number}x
          </button>
        ))}
      </div>

      <details className="group mt-4 rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Categoria e responsável
        </summary>
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="mb-2 text-xs font-medium text-muted">Categoria</p>
          <CategoryPicker value={category} group="gasto" onChange={setCategory} />

          <p className="mb-2 mt-4 text-xs font-medium text-muted">Quem</p>
          <div className="flex flex-wrap gap-1.5">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setPersonId(person.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                  personId === person.id ? "bg-primary text-primary-fg" : "bg-line",
                )}
              >
                <PersonAvatar person={person} size="sm" />
                {person.name}
              </button>
            ))}
          </div>
        </div>
      </details>

      <Button
        type="submit"
        className="mt-4 w-full"
        disabled={!title.trim() || amount <= 0 || !count.trim() || totalCount < 1}
      >
        Criar {totalCount}x de {formatBRL(amount)}
      </Button>
    </form>
  );
}
