import type { CategoryId, ExtractedItem, TxNature } from "./types";
import { uid } from "./utils";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const raw = value.replace(/R\$/gi, "").trim();
  const negative = /^-/.test(raw) || /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[()]/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/^\+/, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!br) return null;
  const year = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
  return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

function parseSerializedRows(text: string) {
  const lines = text.split("\n");
  return lines
    .filter((line) => line.includes(":") && line.includes("|"))
    .map((line) => {
      const row: Record<string, string> = {};
      for (const part of line.split("|")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        row[normalize(part.slice(0, idx))] = part.slice(idx + 1).trim();
      }
      return row;
    })
    .filter((row) => Object.keys(row).length >= 2);
}

function first(row: Record<string, string>, keys: RegExp[]) {
  for (const [key, value] of Object.entries(row)) {
    if (keys.some((re) => re.test(key)) && value.trim()) return value.trim();
  }
  return undefined;
}

function natureFor(description: string): TxNature {
  const text = normalize(description);
  if (/pagamento.*fatura|pagto.*fatura/.test(text)) return "card_payment";
  if (/aplicacao|resgate|investimento|cdb|rdb/.test(text)) return "investment";
  if (/transferencia|pix transf|ted/.test(text)) return "transfer";
  return "budget";
}

function categoryFor(description: string, amount: number): CategoryId {
  const text = normalize(description);
  if (amount > 0 && /salario|remuneracao|folha/.test(text)) return "salario";
  if (/ifood|restaurante|lanchonete|food/.test(text)) return "alimentacao";
  if (/uber|99app|combustivel|posto/.test(text)) return "transporte";
  if (/supermercado|mercado/.test(text)) return "mercado";
  if (/farmacia|drogaria|raia/.test(text)) return "saude";
  if (/energia|internet|telefone|claro|light/.test(text)) return "contas";
  return "outros";
}

export type StructuredSheetAnalysis = {
  items: ExtractedItem[];
  confidence: number;
  rowCount: number;
  matchedRows: number;
};

export function analyzeStructuredSheetText(
  text: string | undefined,
  defaultPersonId: string,
): StructuredSheetAnalysis {
  if (!text) return { items: [], confidence: 0, rowCount: 0, matchedRows: 0 };
  const rows = parseSerializedRows(text);
  const items: ExtractedItem[] = [];
  let matchedRows = 0;

  for (const row of rows) {
    const date = parseDate(first(row, [/^data$/, /data trans/, /date/]));
    const description =
      first(row, [/descricao/, /historico/, /estabelecimento/, /merchant/, /favorecido/, /nome/]) ??
      "";
    const debit = parseMoney(first(row, [/debito/, /saida/]));
    const credit = parseMoney(first(row, [/credito/, /entrada/]));
    const amountField = parseMoney(first(row, [/^valor$/, /amount/, /valor trans/]));
    const typeField = normalize(first(row, [/^tipo$/, /natureza/, /credit debit/]) ?? "");

    let signed: number | null = null;
    if (credit !== null && Math.abs(credit) > 0) signed = Math.abs(credit);
    else if (debit !== null && Math.abs(debit) > 0) signed = -Math.abs(debit);
    else if (amountField !== null && amountField !== 0) {
      signed = amountField;
      if (/debito|saida|expense/.test(typeField)) signed = -Math.abs(amountField);
      if (/credito|entrada|income/.test(typeField)) signed = Math.abs(amountField);
    }

    if (!date || signed === null || !description) continue;
    matchedRows += 1;
    items.push({
      id: uid(),
      description,
      merchant: description,
      amount: Math.abs(signed),
      date,
      type: signed > 0 ? "income" : "expense",
      nature: natureFor(description),
      category: categoryFor(description, signed),
      personId: defaultPersonId,
      selected: true,
      installment: null,
    });
  }

  const coverage = rows.length ? matchedRows / rows.length : 0;
  const volume = items.length >= 10 ? 1 : items.length >= 3 ? 0.7 : items.length ? 0.4 : 0;
  const confidence = Math.min(1, coverage * 0.75 + volume * 0.25);
  return { items, confidence, rowCount: rows.length, matchedRows };
}
