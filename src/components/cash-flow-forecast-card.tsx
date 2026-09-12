import { useMemo, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  CircleDollarSign,
  Pencil,
  Plus,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cashFlowForecast, monthlyIncomeForecast, nextLikelySalary } from "@/lib/forecast";
import { formatBRL, formatMonthTitle, formatShortDate } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import type { PlannedIncome } from "@/lib/types";
import { cn, todayIso } from "@/lib/utils";

type Horizon = 30 | 60 | 90 | "salary";
type ForecastMode = "outflow" | "income";

function daysUntil(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T12:00:00`).getTime();
  const to = new Date(`${toIso}T12:00:00`).getTime();
  return Math.max(1, Math.ceil((to - from) / 86_400_000));
}

function confidenceLabel(value: "confirmed" | "high" | "medium" | "low") {
  if (value === "confirmed") return "confirmada";
  if (value === "high") return "alta confiança";
  if (value === "medium") return "média confiança";
  return "baixa confiança";
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function IncomePlanForm({
  initial,
  defaultDate,
  onCancel,
}: {
  initial?: PlannedIncome;
  defaultDate: string;
  onCancel: () => void;
}) {
  const add = useFinanceStore((s) => s.addPlannedIncome);
  const update = useFinanceStore((s) => s.updatePlannedIncome);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(
    initial ? initial.amount.toFixed(2).replace(".", ",") : "",
  );
  const [date, setDate] = useState(initial?.date ?? defaultDate);

  function save() {
    const value = parseMoneyInput(amount);
    if (!label.trim()) {
      toast.error("Dê um nome para essa entrada.");
      return;
    }
    if (value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Escolha a data prevista.");
      return;
    }

    if (initial) {
      update(initial.id, { label: label.trim(), amount: value, date });
      toast.success("Previsão atualizada");
    } else {
      add({ label: label.trim(), amount: value, date });
      toast.success("Entrada prevista adicionada");
    }
    onCancel();
  }

  return (
    <div className="mt-3 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {initial ? "Editar entrada prevista" : "Nova entrada prevista"}
        </p>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onCancel}
          className="flex size-8 items-center justify-center rounded-full text-muted active:bg-line"
        >
          <X className="size-4" />
        </button>
      </div>

      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Ex.: aluguel recebido, venda, reembolso"
        className="mt-2 h-11 w-full rounded-lg bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="Valor"
          className="h-11 min-w-0 rounded-lg bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
        />
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-11 min-w-0 rounded-lg bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
        />
      </div>
      <button
        type="button"
        onClick={save}
        className="mt-3 h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg"
      >
        {initial ? "Salvar alteração" : "Adicionar à previsão"}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Isso não cria um lançamento no Extrato. É apenas uma previsão e pode ser alterada ou removida a qualquer momento.
      </p>
    </div>
  );
}

export function CashFlowForecastCard() {
  const state = useFinanceStore();
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const salary = nextLikelySalary(state, today);
  const removePlannedIncome = useFinanceStore((s) => s.removePlannedIncome);
  const updatePlannedIncome = useFinanceStore((s) => s.updatePlannedIncome);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [mode, setMode] = useState<ForecastMode>("outflow");
  const [addingIncome, setAddingIncome] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);

  const salaryDays = salary ? daysUntil(today, salary.date) : null;
  const horizonDays =
    horizon === "salary" && salaryDays ? salaryDays : typeof horizon === "number" ? horizon : 30;
  const forecast = cashFlowForecast(state, today, horizonDays);
  const incomeForecast = monthlyIncomeForecast(state, currentMonth);

  const monthlyPlans = useMemo(
    () =>
      [...(state.plannedIncomes ?? [])]
        .filter((item) => item.date.slice(0, 7) === currentMonth)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [state.plannedIncomes, currentMonth],
  );

  if (
    forecast.items.length === 0 &&
    !salary &&
    incomeForecast.expectedTotal <= 0 &&
    monthlyPlans.length === 0
  ) {
    return null;
  }

  const outflowTitle =
    horizon === "salary" && salary
      ? `Até a próxima renda · ${formatShortDate(salary.date)}`
      : `Próximos ${horizonDays} dias`;

  const editingIncome =
    editingIncomeId ? (state.plannedIncomes ?? []).find((item) => item.id === editingIncomeId) : undefined;

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <CalendarRange className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Previsão financeira</p>
          <h2 className="font-display text-xl">
            {mode === "outflow"
              ? outflowTitle
              : `Entradas de ${formatMonthTitle(incomeForecast.month)}`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "outflow" ? (
              <>
                Cerca de{" "}
                <span className="font-medium text-fg tabular-nums">
                  {formatBRL(forecast.expectedOutflow)}
                </span>{" "}
                em saídas conhecidas ou recorrentes.
              </>
            ) : (
              <>
                Total esperado de{" "}
                <span className="font-medium text-fg tabular-nums">
                  {formatBRL(incomeForecast.expectedTotal)}
                </span>
                . Só salário é projetado automaticamente.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1 shadow-[var(--shadow-border)]">
        <button
          type="button"
          onClick={() => setMode("outflow")}
          className={cn(
            "h-9 rounded-md text-xs font-medium",
            mode === "outflow" ? "bg-primary text-primary-fg" : "text-muted",
          )}
        >
          Saídas futuras
        </button>
        <button
          type="button"
          onClick={() => setMode("income")}
          className={cn(
            "h-9 rounded-md text-xs font-medium",
            mode === "income" ? "bg-primary text-primary-fg" : "text-muted",
          )}
        >
          Entradas do mês
        </button>
      </div>

      {mode === "outflow" ? (
        <>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {([30, 60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHorizon(days)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
                  horizon === days ? "bg-primary text-primary-fg" : "bg-line text-fg",
                )}
              >
                {days} dias
              </button>
            ))}
            {salary ? (
              <button
                type="button"
                onClick={() => setHorizon("salary")}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
                  horizon === "salary" ? "bg-primary text-primary-fg" : "bg-line text-fg",
                )}
              >
                Até próxima renda
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <CircleDollarSign className="size-3" /> Confirmado
              </p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(forecast.scheduledExpenses)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted">
                Parcelas e lançamentos já agendados
              </p>
            </div>
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <CircleDashed className="size-3" /> Estimado
              </p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(forecast.predictedRecurring)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted">
                Recorrências repetidas dentro da janela
              </p>
            </div>
          </div>

          {salary ? (
            <div className="mt-2 rounded-lg bg-primary-soft p-3 text-primary">
              <div className="flex items-start gap-2">
                <WalletCards className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-xs font-medium">
                    Próxima renda {salary.confidence === "confirmed" ? "confirmada" : "provável"} em{" "}
                    {formatShortDate(salary.date)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums">{formatBRL(salary.estimatedAmount)}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-primary/75">
                    {confidenceLabel(salary.confidence)}
                    {salary.observedMonths > 0
                      ? ` · baseada em ${salary.observedMonths} mês${salary.observedMonths === 1 ? "" : "es"} observado${salary.observedMonths === 1 ? "" : "s"}`
                      : ""}
                  </p>
                  {horizon === "salary" ? (
                    <p className="mt-2 text-xs leading-relaxed">
                      Até lá, os compromissos previstos somam {formatBRL(forecast.expectedOutflow)}.
                      Entradas pontuais só entram quando você as cadastrar.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {forecast.items.length > 0 ? (
            <ul className="mt-3 divide-y divide-line">
              {forecast.items.slice(0, 7).map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block text-xs text-muted">
                      {formatShortDate(item.date)} ·{" "}
                      {item.source === "scheduled"
                        ? "confirmado"
                        : item.source === "planned_income"
                          ? "entrada prevista por você"
                          : "estimativa recorrente"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {item.type === "income" ? "+" : "−"}
                    {formatBRL(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-muted">
              Nenhum compromisso foi detectado dentro desta janela.
            </p>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            A previsão não cria lançamentos. Entradas pontuais só entram no fluxo futuro quando você as cadastra manualmente.
          </p>
        </>
      ) : (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="text-[11px] text-muted">Já recebido</p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(incomeForecast.received)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted">
                Entradas reais identificadas no Extrato
              </p>
            </div>
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="text-[11px] text-muted">Salário previsto</p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(incomeForecast.salaryExpected)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted">
                Única renda estimada automaticamente
              </p>
            </div>
            <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <p className="text-[11px] text-muted">Previsto por você</p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(incomeForecast.manualPlanned)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-muted">
                Entradas pontuais cadastradas manualmente
              </p>
            </div>
            <div className="rounded-lg bg-primary-soft p-3 text-primary">
              <p className="text-[11px]">Total esperado</p>
              <p className="mt-1 font-display text-lg tabular-nums">
                {formatBRL(incomeForecast.expectedTotal)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-primary/75">
                Realizado + salário + suas previsões
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Entradas previstas por você</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  Use para aluguel, venda, devolução, renda extra ou qualquer entrada que não seja salário.
                </p>
              </div>
              <button
                type="button"
                aria-label="Adicionar entrada prevista"
                onClick={() => {
                  setEditingIncomeId(null);
                  setAddingIncome(true);
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"
              >
                <Plus className="size-4" />
              </button>
            </div>

            {addingIncome ? (
              <IncomePlanForm defaultDate={today} onCancel={() => setAddingIncome(false)} />
            ) : null}
            {editingIncome ? (
              <IncomePlanForm
                key={editingIncome.id}
                initial={editingIncome}
                defaultDate={today}
                onCancel={() => setEditingIncomeId(null)}
              />
            ) : null}

            {monthlyPlans.length ? (
              <ul className="mt-3 divide-y divide-line">
                {monthlyPlans.map((item) => (
                  <li key={item.id} className={cn("py-3", item.fulfilled && "opacity-60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", item.fulfilled && "line-through")}>
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatShortDate(item.date)}
                          {item.fulfilled ? " · concluída" : " · prevista"}
                        </p>
                      </div>
                      <p className="shrink-0 font-display text-sm tabular-nums">
                        {formatBRL(item.amount)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingIncome(false);
                          setEditingIncomeId(item.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      >
                        <Pencil className="size-3" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updatePlannedIncome(item.id, { fulfilled: !item.fulfilled });
                          toast.success(
                            item.fulfilled
                              ? "Previsão reaberta"
                              : "Previsão concluída. Ela saiu do valor futuro.",
                          );
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted"
                      >
                        <CheckCircle2 className="size-3" />
                        {item.fulfilled ? "Reabrir" : "Concluir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removePlannedIncome(item.id);
                          if (editingIncomeId === item.id) setEditingIncomeId(null);
                          toast.success("Previsão removida");
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-danger"
                      >
                        <Trash2 className="size-3" /> Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : !addingIncome ? (
              <button
                type="button"
                onClick={() => setAddingIncome(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted"
              >
                <Plus className="size-4" /> Incluir uma entrada pontual
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            O Núcleo não usa mais outras entradas antigas para inventar recorrência. Só salário pode ser projetado automaticamente. Ao concluir uma previsão, ela sai do valor futuro; o dinheiro realizado continua vindo do Extrato.
          </p>
        </div>
      )}
    </section>
  );
}
