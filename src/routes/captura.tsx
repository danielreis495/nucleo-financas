import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, FileSpreadsheet, FileText, ImageIcon, Keyboard, Loader2 } from "lucide-react";
import { CaptureReview } from "@/components/capture-review";
import { CategoryPicker } from "@/components/category-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { extractDocument } from "@/lib/ai";
import {
  applyKnownHolderTransfers,
  matchesKnownHolderTransfer,
  summarizeFinancialDocument,
} from "@/lib/document-summary";
import { useDocumentStore } from "@/lib/document-store";
import { findExactDuplicate, flagImportDuplicates, type DuplicateSummary } from "@/lib/duplicates";
import { formatBRL } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import {
  originFromDocument,
  paymentMethodForItem,
  type ImportOrigin,
} from "@/lib/transaction-origin";
import type { CategoryId, ExtractedItem, FinancialDocumentSummary, TxSource } from "@/lib/types";
import { cn, todayIso, uid } from "@/lib/utils";

export const Route = createFileRoute("/captura")({ component: CapturaPage });

const IMPORT_FINGERPRINTS_KEY = "nucleo-import-fingerprints-v1";

function importedFingerprints() {
  try {
    const raw = localStorage.getItem(IMPORT_FINGERPRINTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function hasImportedFingerprint(fingerprint: string | undefined) {
  return Boolean(fingerprint && importedFingerprints().has(fingerprint));
}

function rememberImportedFingerprint(fingerprint: string | undefined) {
  if (!fingerprint) return;
  const fingerprints = importedFingerprints();
  fingerprints.add(fingerprint);
  localStorage.setItem(IMPORT_FINGERPRINTS_KEY, JSON.stringify([...fingerprints].slice(-120)));
}

function CapturaPage() {
  const people = useFinanceStore((s) => s.people);
  const accounts = useFinanceStore((s) => s.accounts ?? []);
  const transactions = useFinanceStore((s) => s.transactions);
  const geminiKey = useFinanceStore((s) => s.geminiKey);
  const importExtracted = useFinanceStore((s) => s.importExtracted);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const addQuick = useFinanceStore((s) => s.addQuickExpense);
  const summaries = useDocumentStore((s) => s.summaries);
  const addSummary = useDocumentStore((s) => s.addSummary);
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Lendo documento…");
  const [items, setItems] = useState<ExtractedItem[] | null>(null);
  const [documentSummary, setDocumentSummary] = useState<FinancialDocumentSummary | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateSummary | null>(null);
  const [importOrigin, setImportOrigin] = useState<ImportOrigin | null>(null);
  const [documentFingerprint, setDocumentFingerprint] = useState<string | null>(null);
  const [source, setSource] = useState<TxSource>("photo");
  const [quick, setQuick] = useState(false);
  const [digits, setDigits] = useState("");
  const [category, setCategory] = useState<CategoryId>("mercado");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [accountId, setAccountId] = useState<string | null>(null);

  const amount = digits ? Number(digits) / 100 : 0;

  function enrichExistingOrigins(importedItems: ExtractedItem[], origin: ImportOrigin) {
    let updated = 0;
    const usedExisting = new Set<string>();
    for (const item of importedItems) {
      const existing = findExactDuplicate(item, transactions, usedExisting, origin);
      if (!existing) continue;
      usedExisting.add(existing.id);
      updateTransaction(existing.id, {
        originLabel: origin.originLabel,
        originInstitution: origin.originInstitution,
        originKind: origin.originKind,
        sourceFileName: origin.sourceFileName,
        paymentMethod: paymentMethodForItem(item, origin),
      });
      updated += 1;
    }
    return updated;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    setAccountId(null);
    setDocumentSummary(null);
    setDuplicateSummary(null);
    setImportOrigin(null);
    setDocumentFingerprint(null);
    setBusy(true);
    setStatus("Preparando arquivo…");
    try {
      const { prepareFile } = await import("@/lib/extract-client");
      const prepared = await prepareFile(file);
      setSource(prepared.source);
      setDocumentFingerprint(prepared.fingerprint ?? null);

      const summary = summarizeFinancialDocument(prepared.text, todayIso(), file.name, prepared.source);
      const origin = originFromDocument(summary, file.name, prepared.source, prepared.text);
      setDocumentSummary(summary);
      setImportOrigin(origin);

      if (origin.originKind === "bank_account" && origin.originInstitution) {
        const candidates = accounts.filter(
          (account) =>
            account.active &&
            account.institution.trim().toLowerCase() === origin.originInstitution?.trim().toLowerCase(),
        );
        if (candidates.length === 1) setAccountId(candidates[0].id);
      }

      if (hasImportedFingerprint(prepared.fingerprint)) {
        toast.success(`Este arquivo já foi importado como ${origin.originLabel}. Nenhum lançamento foi duplicado.`);
        void navigate({ to: "/extrato" });
        return;
      }

      setStatus(`Detectado: ${origin.originLabel}. Extraindo lançamentos…`);
      const casa = people.find((p) => p.role === "other") ?? people[0];
      const payload = {
        text: prepared.text,
        images: prepared.images,
        people: people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
        defaultPersonId: casa?.id ?? people[0]?.id ?? "",
        today: todayIso(),
        apiKey: geminiKey || undefined,
      };
      const result = geminiKey
        ? await (await import("@/lib/gemini")).extractWithGemini(payload)
        : await extractDocument({ data: payload });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (!result.items.length) {
        toast.error("Não achei lançamentos nesse arquivo.");
        return;
      }

      const holderNames = [summary?.holderName, ...summaries.map((item) => item.holderName)];
      const classified = applyKnownHolderTransfers(result.items, holderNames);
      const checked = flagImportDuplicates(classified, transactions, origin);

      if (checked.items.length > 0 && checked.items.every((item) => !item.selected)) {
        const enriched = enrichExistingOrigins(checked.items, origin);
        if (summary) addSummary(summary);
        rememberImportedFingerprint(prepared.fingerprint);
        toast.success(
          enriched > 0
            ? `Origem atualizada em ${enriched} lançamento${enriched === 1 ? "" : "s"}. Nenhum duplicado foi adicionado.`
            : "Documento conferido. Nenhum lançamento duplicado foi adicionado.",
        );
        setDocumentSummary(null);
        setDuplicateSummary(null);
        setImportOrigin(null);
        setDocumentFingerprint(null);
        setItems(null);
        void navigate({ to: "/extrato" });
        return;
      }

      setDuplicateSummary(checked.summary);
      setItems(checked.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    const casa = people.find((p) => p.role === "other") ?? people[0];
    const today = todayIso();
    setAccountId(null);
    setDocumentSummary(null);
    setDuplicateSummary(null);
    setImportOrigin({ originLabel: "Exemplo", originKind: "unknown" });
    setDocumentFingerprint(null);
    setSource("photo");
    setItems([
      {
        id: uid(),
        description: "Padaria da manhã",
        merchant: "Padaria São João",
        amount: 51.0,
        date: today,
        type: "expense",
        category: "mercado",
        personId: casa?.id ?? people[0]?.id ?? "",
        selected: true,
        installment: null,
      },
      {
        id: uid(),
        description: "Café e pão na chapa",
        merchant: "Padaria São João",
        amount: 18.5,
        date: today,
        type: "expense",
        category: "alimentacao",
        personId: people[0]?.id ?? "",
        selected: true,
        installment: null,
      },
    ]);
  }

  if (items) {
    return (
      <CaptureReview
        items={items}
        accountId={accountId}
        duplicateSummary={duplicateSummary}
        onAccountChange={setAccountId}
        onChange={setItems}
        onCancel={() => {
          setItems(null);
          setDocumentSummary(null);
          setDuplicateSummary(null);
          setImportOrigin(null);
          setDocumentFingerprint(null);
        }}
        onConfirm={() => {
          const holderNames = [documentSummary?.holderName, ...summaries.map((item) => item.holderName)];
          if (documentSummary?.holderName) {
            for (const transaction of transactions) {
              if (matchesKnownHolderTransfer(transaction, holderNames)) {
                updateTransaction(transaction.id, { nature: "transfer" });
              }
            }
          }
          if (importOrigin) enrichExistingOrigins(items, importOrigin);
          importExtracted(items, source, accountId, importOrigin ?? undefined);
          addSummary(documentSummary);
          rememberImportedFingerprint(documentFingerprint ?? undefined);
          toast.success(documentSummary ? "Lançamentos, origem e dados do documento adicionados" : "Lançamentos adicionados");
          setItems(null);
          setDocumentSummary(null);
          setDuplicateSummary(null);
          setImportOrigin(null);
          setDocumentFingerprint(null);
          void navigate({ to: "/extrato" });
        }}
      />
    );
  }

  if (quick) {
    return (
      <main className="flex flex-1 flex-col px-5 pt-6">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Gasto rápido</p>
        <h1 className="font-display text-3xl tracking-tight">Só o valor</h1>
        <p className="mt-6 font-display text-5xl tabular-nums tracking-tight">{formatBRL(amount)}</p>

        <p className="mt-6 mb-2 text-xs font-medium text-muted">Categoria</p>
        <CategoryPicker value={category} group="gasto" onChange={setCategory} />

        <p className="mt-4 mb-2 text-xs font-medium text-muted">Quem</p>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button
              key={p.id}
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

        <p className="mt-4 mb-2 text-xs font-medium text-muted">Conta</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAccountId(null)}
            className={cn(
              "h-9 rounded-full px-3 text-xs font-medium",
              accountId === null ? "bg-primary text-primary-fg" : "bg-line",
            )}
          >
            Sem conta
          </button>
          {accounts.filter((a) => a.active).map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setAccountId(account.id)}
              className={cn(
                "h-9 max-w-full truncate rounded-full px-3 text-xs font-medium",
                accountId === account.id ? "bg-primary text-primary-fg" : "bg-line",
              )}
            >
              {account.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((key) => (
            <button
              key={key}
              className="h-14 rounded-lg bg-elevated text-lg font-medium shadow-[var(--shadow-border)] active:scale-[0.96]"
              onClick={() => {
                if (key === "⌫") setDigits((d) => d.slice(0, -1));
                else setDigits((d) => (d + key).replace(/^0+/, "").slice(0, 8));
              }}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setQuick(false)}>
            Voltar
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() => {
              addQuick({ amount, category, personId, accountId });
              toast.success("Gasto lançado");
              setDigits("");
              void navigate({ to: "/" });
            }}
          >
            Lançar
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Captura</p>
      <h1 className="font-display text-3xl tracking-tight">Menos digitação</h1>
      <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted">
        Foto da nota, fatura em PDF ou planilha. O Núcleo lê compras, saldos, vencimentos e movimentações.
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf,.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {busy ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="font-medium">{status}</p>
          <p className="text-sm text-muted">Isso leva alguns segundos.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-20 items-center gap-4 rounded-xl bg-primary px-4 py-4 text-left text-primary-fg"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary-fg/10">
              <Camera className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Fotografar nota</span>
              <span className="block text-sm text-primary-fg/70">Cupom, boleto ou fatura</span>
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <ActionCard
              icon={ImageIcon}
              title="Galeria"
              subtitle="Foto salva"
              onClick={() => galleryRef.current?.click()}
            />
            <ActionCard
              icon={FileText}
              title="PDF"
              subtitle="Fatura ou extrato"
              onClick={() => fileRef.current?.click()}
            />
            <ActionCard
              icon={FileSpreadsheet}
              title="Planilha"
              subtitle="CSV ou Excel"
              onClick={() => fileRef.current?.click()}
            />
            <ActionCard icon={Keyboard} title="Valor rápido" subtitle="Só o teclado numérico" onClick={() => setQuick(true)} />
          </div>

          <button
            onClick={loadSample}
            className="mt-2 h-11 rounded-md text-sm font-medium text-primary"
          >
            Ver exemplo de nota
          </button>
        </div>
      )}
    </main>
  );
}

function ActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Camera;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl bg-elevated px-4 py-3 text-left shadow-[var(--shadow-border)]"
    >
      <Icon className="size-4 text-primary" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
    </button>
  );
}
