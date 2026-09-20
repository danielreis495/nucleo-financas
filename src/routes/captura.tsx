import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, FileSpreadsheet, FileText, ImageIcon, Keyboard, Loader2 } from "lucide-react";
import { CaptureReview } from "@/components/capture-review";
import { CategoryPicker } from "@/components/category-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { analyzeTabularBankStatement } from "@/lib/bank-statement-parser";
import { analyzeStructuredSheetText } from "@/lib/sheet-parser";
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
import { validateImportBatch } from "@/lib/import-batch";

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
  const [batch, setBatch] = useState<{ file: File; status: string }[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const batchIndexRef = useRef(0);
  const reading = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function markFile(status: string) {
    const index = batchIndexRef.current;
    if (alive.current) setBatch((rows) => rows.map((row, i) => i === index ? { ...row, status } : row));
  }
  const [status, setStatus] = useState("Lendo documento…");
  const [items, setItems] = useState<ExtractedItem[] | null>(null);
  const [documentSummary, setDocumentSummary] = useState<FinancialDocumentSummary | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateSummary | null>(null);
  const [importOrigin, setImportOrigin] = useState<ImportOrigin | null>(null);
  const [documentFingerprint, setDocumentFingerprint] = useState<string | null>(null);
  const [source, setSource] = useState<TxSource>("photo");
  const [quick, setQuick] = useState(false);
  const [digits, setDigits] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("mercado");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [accountId, setAccountId] = useState<string | null>(null);

  const amount = digits ? Number(digits) / 100 : 0;

  function enrichExistingOrigins(importedItems: ExtractedItem[], origin: ImportOrigin) {
    let updated = 0;
    const usedExisting = new Set<string>();
    for (const item of importedItems) {
      const existing = findExactDuplicate(item, useFinanceStore.getState().transactions, usedExisting, origin);
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
    if (!files?.length || reading.current || batch.length) return;
    const selected = Array.from(files);
    const error = validateImportBatch(selected);
    if (error) { toast.error(error); return; }
    setBatch(selected.map((file) => ({ file, status: "Aguardando" })));
    batchIndexRef.current = 0;
    setBatchIndex(0);
    await readFile(selected[0]);
  }

  function clearReview() {
    setItems(null); setDocumentSummary(null); setDuplicateSummary(null);
    setImportOrigin(null); setDocumentFingerprint(null); setAccountId(null);
  }

  async function nextFile() {
    if (reading.current) return;
    clearReview();
    const next = batchIndexRef.current + 1;
    batchIndexRef.current = next;
    setBatchIndex(next);
    if (next < batch.length) await readFile(batch[next].file);
  }

  async function readFile(file: File) {
    if (reading.current) return;
    reading.current = true;
    markFile("Lendo");
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
      if (!alive.current) return;
      setSource(prepared.source);
      setDocumentFingerprint(prepared.fingerprint ?? null);

      const summary = summarizeFinancialDocument(prepared.text, todayIso(), file.name, prepared.source);
      let origin = originFromDocument(summary, file.name, prepared.source, prepared.text);
      const casa = people.find((p) => p.role === "other") ?? people[0];
      const defaultPersonId = casa?.id ?? people[0]?.id ?? "";

      // Motor local-first: documentos estruturados são lidos no aparelho em
      // milissegundos. Gemini fica reservado para documentos ambíguos, scans
      // ou layouts que não atinjam confiança suficiente.
      const bankAnalysis =
        prepared.source === "pdf" || /\.txt$/i.test(file.name)
          ? analyzeTabularBankStatement(
              prepared.text,
              people.map((p) => ({ id: p.id, name: p.name })),
              defaultPersonId,
            )
          : null;
      const sheetAnalysis =
        prepared.source === "sheet"
          ? analyzeStructuredSheetText(prepared.text, defaultPersonId)
          : null;

      const bankFastPath =
        Boolean(bankAnalysis) &&
        (bankAnalysis?.items.length ?? 0) >= 5 &&
        (bankAnalysis?.confidence ?? 0) >= 0.78;
      const sheetFastPath =
        Boolean(sheetAnalysis) &&
        (sheetAnalysis?.items.length ?? 0) >= 3 &&
        (sheetAnalysis?.confidence ?? 0) >= 0.82;

      if (bankFastPath && origin.originKind === "unknown") {
        const institution = bankAnalysis?.institution ?? origin.originInstitution;
        origin = {
          originLabel: institution ? `Conta ${institution}` : "Extrato bancário",
          originInstitution: institution,
          originKind: "bank_account",
          sourceFileName: file.name,
        };
      }

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
        markFile("Já importado");
        return;
      }

      const localItems = bankFastPath
        ? bankAnalysis?.items ?? []
        : sheetFastPath
          ? sheetAnalysis?.items ?? []
          : [];

      if (localItems.length > 0) {
        const sourceLabel = bankFastPath ? "extrato estruturado" : "planilha estruturada";
        setStatus(`Leitura rápida local: ${localItems.length} lançamentos no ${sourceLabel}.`);
      } else {
        setStatus(`Detectado: ${origin.originLabel}. Interpretando documento…`);
      }

      const payload = {
        text: prepared.text,
        images: prepared.images,
        people: people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
        defaultPersonId,
        today: todayIso(),
      };
      const result =
        localItems.length > 0
          ? ({ ok: true as const, items: localItems })
          : await extractDocument({ data: payload });
      if (!alive.current) return;
      if (!result.ok) {
        toast.error(result.error);
        markFile(`Erro: ${result.error}`);
        return;
      }
      if (!result.items.length) {
        toast.error("Não achei lançamentos nesse arquivo.");
        markFile("Sem lançamentos encontrados");
        return;
      }

      const holderNames = [summary?.holderName, ...useDocumentStore.getState().summaries.map((item) => item.holderName)];
      const classified = applyKnownHolderTransfers(result.items, holderNames);
      const checked = flagImportDuplicates(classified, useFinanceStore.getState().transactions, origin);

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
        markFile("Conferido — sem novos lançamentos");
        return;
      }

      setDuplicateSummary(checked.summary);
      markFile("Revisar");
      setItems(checked.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
      markFile(`Erro: ${err instanceof Error ? err.message : "Falha ao ler o arquivo."}`);
    } finally {
      reading.current = false;
      if (alive.current) setBusy(false);
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
      <>
      {batch.length > 0 ? <div className="px-5 pt-4 text-sm" aria-live="polite"><p className="font-medium">Arquivo {batchIndex + 1} de {batch.length}</p><p className="break-all text-muted">{batch[batchIndex]?.file.name}</p></div> : null}
      <CaptureReview
        items={items}
        accountId={accountId}
        duplicateSummary={duplicateSummary}
        documentSummary={documentSummary}
        importOrigin={importOrigin}
        onAccountChange={setAccountId}
        onCardOriginChange={(institution) => {
          setAccountId(null);
          setImportOrigin((current) => ({
            originLabel: `Cartão ${institution}`,
            originInstitution: institution,
            originKind: "credit_card",
            sourceFileName: current?.sourceFileName,
            competenceMonth: documentSummary?.referenceMonth ?? current?.competenceMonth,
          }));
          setDocumentSummary((current) =>
            current
              ? {
                  ...current,
                  kind: "credit_card_bill",
                  institution,
                }
              : current,
          );
        }}
        onChange={setItems}
        onCancel={() => {
          if (batch.length) { markFile("Pulado"); void nextFile(); return; }
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
          if (batch.length) { markFile("Importado"); void nextFile(); }
          else void navigate({ to: "/extrato" });
        }}
      />
      </>
    );
  }

  if (batch.length) {
    const current = batch[batchIndex];
    return <main className="px-5 py-5">
      <h1 className="font-display text-2xl">Importação em lote</h1>
      <p className="mt-2 text-sm text-muted">Revise e confirme cada documento. Os anteriores confirmados já estão salvos.</p>
      <ol className="my-4 space-y-2">{batch.map((row, index) => <li key={index} className="rounded-xl bg-elevated p-3 text-sm">
        <p className="break-all font-medium">{index + 1}. {row.file.name}</p><p className="text-muted">{row.status}</p>
      </li>)}</ol>
      <div aria-live="polite">{busy ? <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{status}</p> : current ? <div className="flex flex-wrap gap-2">
        {current.status.startsWith("Erro:") || current.status === "Sem lançamentos encontrados" ? <Button variant="secondary" onClick={() => void readFile(current.file)}>Tentar novamente</Button> : null}
        <Button onClick={() => { if (current.status.startsWith("Erro:") || current.status === "Sem lançamentos encontrados") markFile("Pulado após falha"); void nextFile(); }}>{batchIndex + 1 < batch.length ? "Próximo arquivo" : "Concluir lote"}</Button>
      </div> : <Button onClick={() => { setBatch([]); void navigate({ to: "/extrato" }); }}>Ver extrato</Button>}</div>
      {!busy ? <Button className="mt-3" variant="secondary" onClick={() => { clearReview(); setBatch([]); }}>Encerrar e liberar arquivos</Button> : null}
    </main>;
  }

  if (quick) {
    return (
      <main className="flex flex-1 flex-col px-5 pb-4 pt-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Lançamento manual</p>
          <h1 className="font-display text-3xl tracking-tight">Novo gasto</h1>
          <p className="mt-1 text-sm text-muted">Registre o essencial agora. Os detalhes podem ser ajustados depois.</p>
        </div>

        <section className="mt-4 rounded-2xl bg-primary px-5 py-5 text-primary-fg shadow-[var(--shadow-border)]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary-fg/65">Valor</p>
          <p className="mt-1 font-display text-5xl tabular-nums tracking-tight">{formatBRL(amount)}</p>
        </section>

        <label className="mt-4 block text-xs font-medium text-muted">Descrição</label>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ex.: mercado, gasolina, almoço…"
          className="mt-1 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
        />

        <p className="mb-2 mt-4 text-xs font-medium text-muted">Categoria</p>
        <CategoryPicker value={category} group="gasto" onChange={setCategory} />

        <details className="group mt-4 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            Quem pagou e de qual conta
          </summary>
          <div className="border-t border-line px-4 pb-4 pt-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Quem</p>
            <div className="flex flex-wrap gap-1.5">
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

            <p className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-wide text-muted">Conta</p>
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
          </div>
        </details>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((key) => (
            <button
              key={key}
              type="button"
              className="h-13 rounded-xl bg-elevated text-lg font-medium shadow-[var(--shadow-border)] active:scale-[0.96]"
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
            Cancelar
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() => {
              addQuick({
                amount,
                category,
                personId,
                accountId,
                description: description.trim() || undefined,
              });
              toast.success("Gasto registrado");
              setDigits("");
              setDescription("");
              void navigate({ to: "/extrato" });
            }}
          >
            Salvar gasto
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-4 pt-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Adicionar</p>
        <h1 className="font-display text-3xl tracking-tight">Como você quer registrar?</h1>
        <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-muted">
          Digite um gasto em segundos ou importe documentos para o Núcleo organizar os movimentos.
        </p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,.csv,.xlsx,.xls,.txt,application/pdf,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
      />

      {busy ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Loader2 className="size-6 animate-spin" />
          </span>
          <p className="font-medium">{status}</p>
          <p className="max-w-[30ch] text-xs leading-relaxed text-muted">
            O Núcleo tenta ler localmente primeiro e usa IA apenas quando o documento precisa de interpretação.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setQuick(true)}
            className="flex min-h-24 items-center gap-4 rounded-2xl bg-primary px-5 py-5 text-left text-primary-fg shadow-[var(--shadow-border)] transition-transform active:scale-[0.99]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-fg/10">
              <Keyboard className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-primary-fg/60">
                Mais rápido
              </span>
              <span className="mt-0.5 block font-display text-xl">Registrar gasto</span>
              <span className="mt-0.5 block text-sm text-primary-fg/70">
                Valor, categoria e pronto
              </span>
            </span>
          </button>

          <section className="rounded-2xl bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Importar automaticamente</p>
              <h2 className="mt-0.5 font-display text-xl">Documento ou foto</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Fotos, PDFs, CSV, Excel e TXT. Até 10 arquivos por lote, 10 MB por arquivo e 40 MB no total. Revisão individual antes de salvar.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionCard
                icon={Camera}
                title="Tirar foto"
                subtitle="Usar a câmera"
                onClick={() => cameraRef.current?.click()}
              />
              <ActionCard
                icon={ImageIcon}
                title="Galeria"
                subtitle="Escolher imagem"
                onClick={() => galleryRef.current?.click()}
              />
              <ActionCard
                icon={FileText}
                title="PDF"
                subtitle="Extrato ou fatura"
                onClick={() => fileRef.current?.click()}
              />
              <ActionCard
                icon={FileSpreadsheet}
                title="Planilha"
                subtitle="CSV ou Excel"
                onClick={() => fileRef.current?.click()}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={loadSample}
            className="h-10 text-xs font-medium text-primary"
          >
            Ver como funciona com um exemplo
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
      type="button"
      onClick={onClick}
      className="flex min-h-[5.25rem] flex-col items-start gap-2 rounded-xl bg-surface px-3.5 py-3 text-left shadow-[var(--shadow-border)] transition-transform active:scale-[0.98]"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted">{subtitle}</span>
      </span>
    </button>
  );
}
