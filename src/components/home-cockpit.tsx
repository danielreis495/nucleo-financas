import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Sparkles, WalletCards } from "lucide-react";
import { cashPositionForMonth } from "@/lib/cash-position";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { financialSnapshot } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";

export function HomeCockpit({ month }: { month: string }) {
  const state = useFinanceStore();
  const summaries = useDocumentStore((s) => s.summaries);
  const cash = cashPositionForMonth(summaries, month, state.transactions);
  const snapshot = financialSnapshot(state, month);

  const available =
    cash.netAvailable !== null
      ? cash.netAvailable
      : cash.cashKnown
        ? cash.cashBalance
        : null;

  const availableLabel =
    cash.netAvailable !== null
      ? "Disponível líquido"
      : cash.cashKnown
        ? "Saldo identificado"
        : "Saldo disponível";

  return (
    <section className="mx-5 overflow-hidden rounded-2xl bg-primary text-primary-fg shadow-[var(--shadow-border)]">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-fg/65">
              Visão rápida
            </p>
            <p className="mt-1 text-sm text-primary-fg/80">{availableLabel}</p>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-fg/10">
            <WalletCards className="size-4" />
          </span>
        </div>

        <p className="mt-1 font-display text-4xl tabular-nums tracking-tight">
          {available === null ? "—" : formatBRL(available)}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-primary-fg/65">
          {available === null
            ? "Importe seus extratos para enxergar o dinheiro real disponível."
            : cash.netAvailable !== null
              ? "Saldo das contas menos faturas em aberto que vencem neste mês."
              : "Saldo final identificado nos extratos importados."}
        </p>
      </div>

      <div className="grid grid-cols-3 border-y border-primary-fg/10 bg-primary-fg/[0.04]">
        <Metric
          icon={ArrowUpRight}
          label="A receber"
          value={Math.max(0, snapshot.expectedIncome)}
        />
        <Metric
          icon={ArrowDownRight}
          label="A pagar"
          value={Math.max(0, snapshot.scheduledExpense)}
        />
        <Metric
          icon={WalletCards}
          label="Projeção"
          value={snapshot.margin}
        />
      </div>

      <Link
        to="/conselhos"
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors active:bg-primary-fg/10"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4" />
          Perguntar ao Núcleo
        </span>
        <span className="text-xs text-primary-fg/60">Analisar meu mês</span>
      </Link>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="flex items-center gap-1 text-[10px] text-primary-fg/60">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 truncate font-display text-base tabular-nums">
        {value < 0 ? "−" : ""}
        {formatBRLCompact(Math.abs(value))}
      </p>
    </div>
  );
}
