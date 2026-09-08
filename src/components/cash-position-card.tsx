import { AlertTriangle, CheckCircle2, Landmark, ReceiptText } from "lucide-react";
import { cashPositionForMonth } from "@/lib/cash-position";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatShortDate } from "@/lib/money";
import { cn } from "@/lib/utils";

export function CashPositionCard({ month }: { month: string }) {
  const summaries = useDocumentStore((s) => s.summaries);
  const position = cashPositionForMonth(summaries, month);

  if (!position.cashKnown && !position.billsKnown) {
    return (
      <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <p className="font-medium">Caixa real ainda não calculado</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              O resultado do mês não é o saldo da conta. Reimporte os extratos e faturas para o Núcleo ler o saldo final e os valores a pagar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-2">
        <Landmark className="size-5 text-primary" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Caixa no fechamento</p>
          <h2 className="font-display text-xl">Dinheiro realmente disponível</h2>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric
          label="Saldo nas contas"
          value={position.cashKnown ? formatBRL(position.cashBalance) : "—"}
          hint={position.cashKnown ? `${position.cashSources} saldo${position.cashSources === 1 ? "" : "s"} identificado${position.cashSources === 1 ? "" : "s"}` : "Sem saldo final"}
        />
        <Metric
          label="Faturas a pagar"
          value={position.billsKnown ? formatBRL(position.billsDue) : "—"}
          hint={position.billsKnown ? `${position.billCount} fatura${position.billCount === 1 ? "" : "s"} ligada${position.billCount === 1 ? "" : "s"} ao mês` : "Nenhuma fatura identificada"}
        />
      </div>

      {position.bills.length > 0 ? (
        <div className="mt-2 rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
          <p className="text-[11px] font-medium text-muted">Faturas identificadas</p>
          <ul className="mt-1 divide-y divide-line">
            {position.bills.map((bill) => (
              <li key={`${bill.institution}-${bill.dueDate ?? bill.amount}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  {bill.institution}
                  {bill.dueDate ? <span className="text-muted"> · vence {formatShortDate(bill.dueDate)}</span> : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatBRL(bill.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Disponível líquido após faturas</p>
            <p
              className={cn(
                "mt-1 font-display text-2xl tabular-nums",
                position.netAvailable !== null && position.netAvailable < 0 && "text-danger",
              )}
            >
              {position.netAvailable === null ? "—" : formatBRL(position.netAvailable)}
            </p>
          </div>
          {position.netAvailable !== null && position.netAvailable >= 0 ? (
            <CheckCircle2 className="size-5 text-primary" />
          ) : (
            <ReceiptText className="size-5 text-warn" />
          )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Este número é separado do resultado do mês: usa saldos finais encontrados nos extratos e desconta as faturas identificadas para o período.
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-display text-lg tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] leading-tight text-muted">{hint}</p>
    </div>
  );
}
