import type { ExtractedItem, FinancialDocumentSummary } from "./types";

const PT_MONTH: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(raw: string | undefined) {
  if (!raw) return null;
  const cleaned = raw.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function isoFromBr(raw: string | undefined) {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function isoFromPtDate(raw: string | undefined, fallbackYear: number) {
  if (!raw) return null;
  const normalized = normalize(raw);
  const match = normalized.match(/(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{4}))?/);
  if (!match) return null;
  const month = PT_MONTH[match[2]];
  const year = Number(match[3] ?? fallbackYear);
  return `${year}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function institutionFrom(text: string) {
  const normalized = normalize(text.slice(0, 6000));
  if (/nubank|nu pagamentos/.test(normalized)) return "Nubank";
  if (/itau|itaú/.test(text.slice(0, 6000).toLowerCase())) return "Itaú";
  if (/bradesco/.test(normalized)) return "Bradesco";
  if (/santander/.test(normalized)) return "Santander";
  if (/caixa economica|caixa econômica/.test(text.slice(0, 6000).toLowerCase())) return "Caixa";
  if (/banco do brasil/.test(normalized)) return "Banco do Brasil";
  return "Instituição não identificada";
}

function holderFrom(text: string) {
  const cpf = text.match(/([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{6,80})\s+\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (cpf?.[1]) return cpf[1].replace(/\s+/g, " ").trim();
  const invoice = text.match(/(?:^|\n)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{6,80})\s*\n\s*FATURA/im);
  if (invoice?.[1]) return invoice[1].replace(/\s+/g, " ").trim();
  const hello = text.match(/Olá,\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{3,80})[.\n]/i);
  return hello?.[1]?.replace(/\s+/g, " ").trim() ?? undefined;
}

function bankStatementSummary(text: string): FinancialDocumentSummary | null {
  const normalized = normalize(text.slice(0, 10000));
  const looksLikeStatement = /extrato conta|extrato bancario|saldo em conta|saldo do dia/.test(normalized);
  if (!looksLikeStatement) return null;

  let closingBalance: number | null = null;
  let balanceDate: string | null = null;

  const topBalance = text.match(/saldo em conta[\s\S]{0,220}?R\$\s*(-?[\d.]+,\d{2})/i);
  closingBalance = parseMoney(topBalance?.[1]);

  const daily = [...text.matchAll(/(\d{2}\/\d{2}\/\d{4})\s+SALDO DO DIA\s+(-?[\d.]+,\d{2})/gi)];
  if (daily.length) {
    balanceDate = isoFromBr(daily[0][1]);
    if (closingBalance === null) closingBalance = parseMoney(daily[0][2]);
  }

  if (closingBalance === null) return null;

  const periodEnd = text.match(/(?:até|ate)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!balanceDate) balanceDate = isoFromBr(periodEnd?.[1]);
  if (!balanceDate) return null;

  return {
    id: "",
    kind: "bank_statement",
    institution: institutionFrom(text),
    holderName: holderFrom(text),
    importedAt: "",
    balance: closingBalance,
    balanceDate,
    referenceMonth: balanceDate.slice(0, 7),
  };
}

function cardBillSummary(text: string, today: string): FinancialDocumentSummary | null {
  const normalized = normalize(text.slice(0, 12000));
  if (!/fatura/.test(normalized) || !/vencimento|total a pagar|total desta fatura/.test(normalized)) return null;

  const currentYear = Number(today.slice(0, 4));
  const totalMatch =
    text.match(/Total a pagar\s*:?[\s\n]*R\$\s*([\d.]+,\d{2})/i) ??
    text.match(/Total desta fatura\s*R?\$?\s*([\d.]+,\d{2})/i) ??
    text.match(/O total da sua fatura[^\d]{0,80}([\d.]+,\d{2})/i);
  const total = parseMoney(totalMatch?.[1]);
  if (total === null || total <= 0) return null;

  const dueBr = text.match(/(?:Data de Vencimento|Vencimento)\D{0,80}(\d{2}\/\d{2}\/\d{4})/i);
  const duePt = text.match(/(?:Data de vencimento|vencimento)\s*:?\s*(\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+\d{4})?)/i);
  const dueDate = isoFromBr(dueBr?.[1]) ?? isoFromPtDate(duePt?.[1], currentYear);
  if (!dueDate) return null;

  const emissionBr = text.match(/(?:emissão|emissao|processamento)\D{0,80}(\d{2}\/\d{2}\/\d{4})/i);
  const emissionPt = text.match(/(?:EMISSÃO E ENVIO|EMISSAO E ENVIO)\s*(\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+\d{4})/i);
  const statementDate = isoFromBr(emissionBr?.[1]) ?? isoFromPtDate(emissionPt?.[1], currentYear) ?? undefined;

  const period = text.match(/(?:Período vigente|Periodo vigente)\s*:?\s*(\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))\s+a\s+(\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))/i);
  const periodEnd = isoFromPtDate(period?.[2], Number(dueDate.slice(0, 4))) ?? undefined;
  const referenceMonth = periodEnd?.slice(0, 7) ?? addMonths(dueDate.slice(0, 7), -1);

  return {
    id: "",
    kind: "credit_card_bill",
    institution: institutionFrom(text),
    holderName: holderFrom(text),
    importedAt: "",
    billTotal: total,
    dueDate,
    statementDate,
    referenceMonth,
  };
}

export function summarizeFinancialDocument(text: string | undefined, today: string) {
  if (!text?.trim()) return null;
  return bankStatementSummary(text) ?? cardBillSummary(text, today);
}

function holderTokens(names: Array<string | undefined>) {
  const out = new Set<string>();
  for (const name of names) {
    const tokens = normalize(name ?? "")
      .split(" ")
      .filter((token) => token.length >= 4);
    for (const token of tokens) out.add(token);
  }
  return out;
}

export function applyKnownHolderTransfers(
  items: ExtractedItem[],
  holderNames: Array<string | undefined>,
) {
  const tokens = holderTokens(holderNames);
  if (!tokens.size) return items;

  return items.map((item) => {
    if (item.nature && item.nature !== "budget") return item;
    const text = normalize(`${item.merchant} ${item.description}`);
    if (!/\bpix transf\b|\btransferencia\b|\btransfer\b|\bted\b/.test(text)) return item;
    const looksBusiness = /ltda|marketplace|comercio|servicos|cnpj/.test(text);
    if (looksBusiness) return item;
    const matched = [...tokens].some((token) => text.split(" ").includes(token));
    return matched ? { ...item, nature: "transfer" as const } : item;
  });
}
