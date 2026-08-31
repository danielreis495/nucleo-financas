import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CreditCard, Landmark } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatBRL, formatLongDate } from "@/lib/money";
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

  const active = state.plans
    .map((plan) => ({ plan, progress: planProgress(state, plan.id) }))
    .filter((p) => p.progress.total > 0)
    .sort((a, b) => (a.progress.next?.date ?? "9").localeCompare(b.progress.next?.date ?? "9"));

  return (
    <main className="flex flex-col px-5 pt-6 pb-8">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Parcelas e empréstimos</p>
      <h1 className="font-display text-3xl tracking-tight">O que já está comprometido</h1>
      <p className="mt-2 text-sm text-muted">
        O Núcleo lança cada parcela no mês certo e marca as vencidas sozinho.
      </p>

      <div className="mt-5 rounded-xl bg-primary px-5 py-4 text-primary-fg">
        <p className="text-xs text-primary-fg/70">A pagar daqui pra frente</p>
        <p className="font-display text-3xl tabular-nums">{formatBRL(committed)}</p>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {active.length === 0 ? (
          <li className="rounded-xl bg-elevated px-4 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
            Nenhuma parcela ativa. Capture uma fatura ou cadastre abaixo.
          </li>
        ) : (
          active.map(({ plan, progress }) => {
            const person = state.people.find((p) => p.id === plan.personId);
            const ratio = progress.total ? progress.paid / progress.total : 0;
            const KindIcon = plan.kind === "loan" ? Landmark : CreditCard;
            return (
              <li key={plan.id} className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <KindIcon className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium">{plan.title}</p>
                      <p className="text-xs text-muted">
                        {plan.merchant}
                        {plan.account ? ` · ${plan.account}` : ""}
                      </p>
                    </div>
                  </div>
                  {person ? <PersonAvatar person={person} size="sm" /> : null}
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className="text-muted">
                    {progress.paid}/{progress.total} · {categoryLabel(plan.category)}
                  </span>
                  <span className="font-display tabular-nums">{formatBRL(plan.installmentAmount)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {progress.next
                    ? `Próxima ${formatLongDate(progress.next.date)} · resta ${formatBRL(progress.remainingAmount)}`
                    : "Quitado"}
                </p>
              </li>
            );
          })
        )}
      </ul>

      <Button className="mt-5" variant="secondary" onClick={() => setOpen((v) => !v)}>
        {open ? "Fechar cadastro" : "Cadastrar parcela"}
      </Button>

      {open ? (
        <NewPlanForm
          onSave={(data) => {
            addPlan(data);
            setOpen(false);
            toast.success("Parcelas programadas");
          }}
        />
      ) : null}
    </main>
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
  const [count, setCount] = useState(12);
  const [title, setTitle] = useState("");
  const amount = digits ? Number(digits) / 100 : 0;

  return (
    <form
      className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || amount <= 0) return;
        onSave({
          title: title.trim(),
          merchant: title.trim(),
          kind,
          installmentAmount: amount,
          totalCount: count,
          startDate: todayIso(),
          personId,
          category,
        });
      }}
    >
      <label className="text-xs font-medium text-muted">O que é</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="iPhone, sofá, empréstimo…"
        className="mt-1 mb-3 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
      />

      <p className="text-xs font-medium text-muted">Tipo</p>
      <div className="mt-1 mb-3 flex gap-1.5">
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
              "h-9 rounded-full px-3 text-xs font-medium",
              kind === id ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-muted">Valor da parcela</p>
      <p className="font-display text-3xl tabular-nums">{formatBRL(amount)}</p>
      <div className="mt-2 mb-3 grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            className="h-11 rounded-md bg-surface text-sm font-medium shadow-[var(--shadow-border)]"
            onClick={() => {
              if (key === "⌫") setDigits((d) => d.slice(0, -1));
              else setDigits((d) => (d + key).replace(/^0+/, "").slice(0, 8));
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-muted">Quantas vezes</p>
      <div className="mt-1 mb-3 flex flex-wrap gap-1.5">
        {[3, 6, 10, 12, 18, 24].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            className={cn(
              "h-9 min-w-10 rounded-full px-3 text-xs font-medium",
              count === n ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            {n}x
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-muted">Categoria</p>
      <div className="mt-1 mb-3 flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "h-9 rounded-full px-3 text-xs font-medium",
              category === c.id ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-muted">Quem</p>
      <div className="mt-1 mb-4 flex flex-wrap gap-1.5">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPersonId(p.id)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
              personId === p.id ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            <PersonAvatar person={p} size="sm" />
            {p.name}
          </button>
        ))}
      </div>

      <Button type="submit" className="w-full" disabled={!title.trim() || amount <= 0}>
        Programar {count}x de {formatBRL(amount)}
      </Button>
    </form>
  );
}
