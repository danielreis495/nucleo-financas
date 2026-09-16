import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Landmark, ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cashPositionForMonth } from "@/lib/cash-position";
import { summarizeFinancialDocument } from "@/lib/document-summary";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatBRLCompact, formatShortDate } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

export function CashPositionCard({ month }: { month: string }) {
  const summaries = useDocumentStore((s) => s.summaries);
  const addSummary = useDocumentStore((s) => s.addSummary);
  const clearSummaries = useDocumentStore((s) => s.clearSummaries);
  const transactions = useFinanceStore((s) => s.transactions);
  const position = cashPositionForMonth(summaries, month, transactions);
  const refreshInput = useRef<HTMLInputElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState("");

  async function rebuildDocumentData(files: File[]) {
    if (!files.length) {
      toast.error("Nenhum PDF foi selecionado.");
      return;
    }

    setRefreshing(true);
    setRefreshProgress(`Preparando ${files.length} arquivo${files.length === 1 ? "" : "s"}…`);
    try {
      const { prepareFile } = await import("@/lib/extract-client");
      const parsed = [];
      const failed: string[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setRefreshProgress(`Lendo ${index + 1} de ${files.length}: ${file.name}`);
        try {
          const prepared = await prepareFile(file);
          const summary = summarizeFinancialDocument(prepared.text, todayIso());
          if (!summary) {
            failed.push(file.name);
            continue;
          }
          parsed.push(summary);
        } catch {
          failed.push(file.name);
        }
      }

      if (failed.length > 0) {
        toast.error(
          `Não consegui identificar saldo/fatura em ${failed.length} arquivo${failed.length === 1 ? "" : "s"}: ${failed.join(", ")}. Nada foi alterado.`,
        );
        return;
      }

      if (parsed.length === 0) {
        toast.error("Não encontrei dados de saldo ou fatura nesses arquivos.");
        return;
      }

      setRefreshProgress("Atualizando o quadro de caixa…");
      clearSummaries();
      for (const summary of parsed) addSummary(summary);

      toast.success(
        `${parsed.length} documento${parsed.length === 1 ? "" : "s"} recalculado${parsed.length === 1 ? "" : "s"}. Seus lançamentos não foram alterados.`,
      );
    } catch {
      toast.error("Não consegui recalcular o caixa agora. Seus lançamentos não foram alterados.");
    } finally {
      setRefreshing(false);
      setRefreshProgress("");
    }
  }

  if (!position.cashKnown && !position.billsKnown) {
    return (
      <section className="mx-5 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Caixa real ainda não calculado</p>
            <p className="truncate text-xs text-muted">Importe extratos e faturas para calcular o disponível.</p>
          </div>
        </div>
        <RefreshDocumentsButton
          busy={refreshing}
          progress={refreshProgress}
          inputRef={refreshInput}
          onFiles={(files) => void rebuildDocumentData(files)}
        />
      </section>
    );
  }

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Landmark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Caixa real</p>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">Contas e faturas</h2>
            {position.netAvailable !== null && position.netAvailable >= 0 ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            ) : (
              <ReceiptText className="size-4 shrink-0 text-warn" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-lg bg-surface shadow-[var(--shadow-border)]">
        <MiniMetric
          label="Nas contas"
          value={position.cashKnown ? formatBRLCompact(position.cashBalance) : "—"}
        />
        <MiniMetric
          label="Faturas"
          value={position.billsKnown ? formatBRLCompact(position.billsDue) : "—"}
        />
        <MiniMetric
          label="Líquido"
          value={position.netAvailable === null ? "—" : formatBRLCompact(position.netAvailable)}
          danger={position.netAvailable !== null && position.netAvailable < 0}
        />
      </div>

      <details className="group mt-3 border-t border-line pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-primary">
          Ver detalhes do caixa
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>

        {position.billRows.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-lg bg-surface px-3 shadow-[var(--shadow-border)]">
            {position.billRows.map((bill) => (
              <li
                key={`${bill.institution}-${bill.referenceMonth}`}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{bill.institution}</span>
                  <span className="block truncate text-[10px] text-muted">
                    {bill.status === "paid" && bill.paymentDate
                      ? `Pago em ${formatShortDate(bill.paymentDate)}`
                      : bill.status === "future" && bill.dueDate
                        ? `Vence em ${formatShortDate(bill.dueDate)} · próximo mês`
                        : bill.dueDate
                          ? `Em aberto · ${formatShortDate(bill.dueDate)}`
                          : "Em aberto"}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatBRL(bill.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted">Nenhuma fatura relacionada a este mês.</p>
        )}

        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          O líquido considera o saldo final das contas e desconta somente faturas ainda em aberto com vencimento no mês.
        </p>

        <RefreshDocumentsButton
          busy={refreshing}
          progress={refreshProgress}
          inputRef={refreshInput}
          onFiles={(files) => void rebuildDocumentData(files)}
        />
      </details>
    </section>
  );
}

function RefreshDocumentsButton({
  busy,
  progress,
  inputRef,
  onFiles,
}: {
  busy: boolean;
  progress: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary-soft px-3 text-xs font-medium text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
        {busy ? "Recalculando…" : "Atualizar com PDFs"}
      </button>
      {busy && progress ? (
        <p className="mt-2 text-center text-[10px] font-medium text-primary">{progress}</p>
      ) : null}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 px-2.5 py-2.5">
      <p className="truncate text-[10px] text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate font-display text-sm tabular-nums", danger && "text-danger")}>
        {value}
      </p>
    </div>
  );
}
