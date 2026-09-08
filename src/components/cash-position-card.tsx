import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cashPositionForMonth } from "@/lib/cash-position";
import { summarizeFinancialDocument } from "@/lib/document-summary";
import { useDocumentStore } from "@/lib/document-store";
import { formatBRL } from "@/lib/money";
import { cn, todayIso } from "@/lib/utils";

function normalizeInstitution(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function CashPositionCard({ month }: { month: string }) {
  const summaries = useDocumentStore((s) => s.summaries);
  const addSummary = useDocumentStore((s) => s.addSummary);
  const clearSummaries = useDocumentStore((s) => s.clearSummaries);
  const position = cashPositionForMonth(summaries, month);
  const refreshInput = useRef<HTMLInputElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  const billRows = (() => {
    const rows = summaries
      .filter(
        (summary) =>
          summary.kind === "credit_card_bill" &&
          summary.referenceMonth === month &&
          typeof summary.billTotal === "number" &&
          summary.billTotal > 0,
      )
      .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = normalizeInstitution(row.institution);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  async function rebuildDocumentData(files: FileList | null) {
    if (!files?.length) return;
    setRefreshing(true);
    try {
      const { prepareFile } = await import("@/lib/extract-client");
      const parsed = [];
      const failed: string[] = [];

      for (const file of Array.from(files)) {
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
          `Não consegui identificar saldo/fatura em ${failed.length} arquivo${failed.length === 1 ? "" : "s"}. Nada foi alterado.`,
        );
        return;
      }

      if (parsed.length === 0) {
        toast.error("Não encontrei dados de saldo ou fatura nesses arquivos.");
        return;
      }

      // Só limpa depois de confirmar que todos os PDFs escolhidos foram reconhecidos.
      // Isso preserva o caixa atual se algum arquivo não puder ser lido.
      clearSummaries();
      for (const summary of parsed) addSummary(summary);

      toast.success(
        `${parsed.length} documento${parsed.length === 1 ? "" : "s"} recalculado${parsed.length === 1 ? "" : "s"}. Seus lançamentos não foram alterados.`,
      );
    } catch {
      toast.error("Não consegui recalcular o caixa agora. Seus lançamentos não foram alterados.");
    } finally {
      setRefreshing(false);
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
              O resultado do mês não é o saldo da conta. Use os PDFs de extratos e faturas para o Núcleo ler somente saldo final e valores a pagar.
            </p>
          </div>
        </div>
        <RefreshDocumentsButton
          busy={refreshing}
          inputRef={refreshInput}
          onFiles={(files) => void rebuildDocumentData(files)}
        />
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

      {billRows.length > 0 ? (
        <div className="mt-2 rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
          <p className="text-[11px] font-medium text-muted">Composição das faturas</p>
          <ul className="mt-1 divide-y divide-line">
            {billRows.map((bill) => (
              <li key={`${bill.institution}-${bill.referenceMonth}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="truncate text-muted">{bill.institution}</span>
                <span className="font-medium tabular-nums">{formatBRL(bill.billTotal ?? 0)}</span>
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

      <RefreshDocumentsButton
        busy={refreshing}
        inputRef={refreshInput}
        onFiles={(files) => void rebuildDocumentData(files)}
      />
    </section>
  );
}

function RefreshDocumentsButton({
  busy,
  inputRef,
  onFiles,
}: {
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
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
          const files = event.target.files;
          event.target.value = "";
          onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-soft px-3 text-sm font-medium text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        {busy ? "Recalculando…" : "Recalcular com PDFs"}
      </button>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
        Selecione juntos os PDFs de extratos e faturas. Só saldo, total e vencimento são atualizados; os lançamentos do orçamento ficam intactos.
      </p>
    </div>
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
