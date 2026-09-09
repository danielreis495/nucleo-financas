import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cashPositionForMonth } from "@/lib/cash-position";
import { summarizeFinancialDocument } from "@/lib/document-summary";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL, formatShortDate } from "@/lib/money";
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
      <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <p className="font-medium">Caixa real ainda não calculado</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              O resultado do mês não é o saldo da conta. Use os PDFs de extratos e faturas para o Núcleo ler saldo final, vencimentos e pagamentos.
            </p>
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

  const billsHint = position.billsKnown
    ? position.billCount > 0
      ? `${position.billCount} fatura${position.billCount === 1 ? "" : "s"} em aberto no mês`
      : position.paidBillCount > 0 && position.futureBillCount > 0
        ? `${position.paidBillCount} paga${position.paidBillCount === 1 ? "" : "s"} no mês · ${position.futureBillCount} vence${position.futureBillCount === 1 ? "" : "m"} depois`
        : position.paidBillCount > 0
          ? `${position.paidBillCount} paga${position.paidBillCount === 1 ? "" : "s"} no mês`
          : position.futureBillCount > 0
            ? `${position.futureBillCount} fatura${position.futureBillCount === 1 ? "" : "s"} vence${position.futureBillCount === 1 ? "" : "m"} em outro mês`
            : "Nenhuma fatura em aberto no mês"
    : "Nenhuma fatura identificada";

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
          label="Faturas em aberto"
          value={position.billsKnown ? formatBRL(position.billsDue) : "—"}
          hint={billsHint}
        />
      </div>

      {position.billRows.length > 0 ? (
        <div className="mt-2 rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] font-medium text-muted">Situação das faturas relacionadas</p>
          <ul className="mt-1 divide-y divide-line">
            {position.billRows.map((bill) => (
              <li key={`${bill.institution}-${bill.referenceMonth}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-muted">{bill.institution}</span>
                  <span className="block text-[10px] text-muted">
                    {bill.status === "paid" && bill.paymentDate
                      ? `Pago em ${formatShortDate(bill.paymentDate)}`
                      : bill.status === "future" && bill.dueDate
                        ? `Vence em ${formatShortDate(bill.dueDate)} · fora do caixa deste mês`
                        : bill.dueDate
                          ? `Em aberto · vence em ${formatShortDate(bill.dueDate)}`
                          : "Em aberto"}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatBRL(bill.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Disponível líquido no fechamento</p>
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
          Usa o saldo final das contas e desconta apenas faturas ainda em aberto que vencem neste mês. Pagamentos já encontrados no extrato não são cobrados duas vezes; faturas que vencem depois ficam para o mês do vencimento.
        </p>
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
        onClick={() => refreshInputClick(inputRef)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-soft px-3 text-sm font-medium text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        {busy ? "Recalculando…" : "Recalcular com PDFs"}
      </button>
      {busy && progress ? (
        <p className="mt-2 text-center text-[11px] font-medium text-primary">{progress}</p>
      ) : null}
      <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
        Selecione juntos os PDFs de extratos e faturas. Os lançamentos do orçamento ficam intactos; o quadro cruza saldo, vencimento e pagamentos já registrados.
      </p>
    </div>
  );
}

function refreshInputClick(inputRef: React.RefObject<HTMLInputElement | null>) {
  inputRef.current?.click();
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
