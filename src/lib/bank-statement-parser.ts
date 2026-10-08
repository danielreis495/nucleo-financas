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

function money(raw: string) {
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function isoFromBr(raw: string) {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Nomes padrão do app que não identificam ninguém num extrato. */
const PLACEHOLDER_NAMES = new Set(["voce", "casa", "eu", "familia", "lar"]);

function householdTransfer(description: string, people: { name: string }[]) {
  const text = normalize(description);
  if (!/^pix transf\b|^transferencia\b|^ted\b/.test(text)) return false;
  const words = new Set(text.split(" "));
  for (const person of people) {
    const tokens = normalize(person.name)
      .split(" ")
      .filter((token) => token.length >= 3 && !["de", "da", "do", "das", "dos"].includes(token));
    if (!tokens.length || tokens.every((token) => PLACEHOLDER_NAMES.has(token))) continue;
    // Nome completo cadastrado: exige primeiro e último nome. Só o primeiro nome
    // cadastrado: aceita, já que é assim que a pessoa foi registrada na casa.
    const matched =
      tokens.length >= 2
        ? words.has(tokens[0]) && words.has(tokens[tokens.length - 1])
        : tokens[0].length >= 4 && words.has(tokens[0]);
    if (matched) return true;
  }
  return false;
}

function natureFor(description: string, people: { name: string }[]): TxNature {
  const text = normalize(description);

  if (/\b(aplicacao|resgate)\b.*\b(cdb|cofrinho|cofrinhos|investimento)\b/.test(text)) {
    return "investment";
  }
  if (
    /\bfatura paga\b|\bpag(?:amento|to)? fatura\b/.test(text) ||
    /^pix qrs nu pagament/.test(text)
  ) {
    return "card_payment";
  }
  if (/\b(emprestimo recebido|credito contratado|credito liberado)\b/.test(text)) {
    return "financing";
  }
  if (/\bsaque banco24h\b|\bsaque\b/.test(text)) {
    return "transfer";
  }
  if (householdTransfer(description, people)) {
    return "transfer";
  }
  return "budget";
}

function categoryFor(description: string, signedAmount: number): CategoryId {
  const text = normalize(description);
  if (
    signedAmount > 0 &&
    /\bsalario\b|\bremuneracao\b|\bcredito salario\b|\bpagto salario\b/.test(text)
  ) {
    return "salario";
  }
  if (/ifood|arcos doura|mcdonald|restaurante|lanchonete|food/.test(text)) return "alimentacao";
  if (/raia drogas|rd saude|drogaria|farmacia/.test(text)) return "saude";
  if (/light servi|lvm energia|claro|energia|telefone|internet/.test(text)) return "contas";
  if (/shpp brasil|supermercado|mercado/.test(text)) return "mercado";
  if (/uber|99app|posto|combustivel/.test(text)) return "transporte";
  return "outros";
}

function merchantFromDescription(description: string) {
  const original = description.trim().replace(/\s+/g, " ");
  const withoutDate = original.replace(/\s*\d{2}\/\d{2}\s*$/, "").trim();

  const rules: RegExp[] = [
    /^PIX\s+QRS\s+/i,
    /^PIX\s+TRANSF\s+/i,
    /^PAG\s+BOLETO\s+/i,
    /^TED\s+\S+\s*/i,
  ];
  let merchant = withoutDate;
  for (const rule of rules) {
    if (!rule.test(merchant)) continue;
    merchant = merchant.replace(rule, "").trim();
    break;
  }

  if (/REMUNERACAO\/SALARIO|PAGTO SALARIO|TEF CREDITO SALARIO/i.test(original)) {
    return "Salário";
  }
  if (/^IOF$/i.test(original)) return "Itaú";
  if (/JUROS LIMITE DA CONTA/i.test(original)) return "Itaú";
  if (/SEGURO CARTAO/i.test(original)) return "Itaú";
  if (/FATURA PAGA ITAU/i.test(original)) return "Itaú";
  if (/CREDITO CONSIGNADO/i.test(original)) return "Itaú";
  if (/SAQUE BANCO24H/i.test(original)) return "Saque";

  return merchant || original || "Lançamento";
}

export type StructuredBankStatementAnalysis = {
  items: ExtractedItem[];
  confidence: number;
  candidateLines: number;
  matchedLines: number;
  institution?: string;
};

function institutionFromText(text: string | undefined) {
  const normalized = normalize((text ?? "").slice(0, 8000));
  if (/\bnubank\b|\bnu pagamentos\b/.test(normalized)) return "Nubank";
  if (/\bitau\b/.test(normalized)) return "Itaú";
  if (/\bbradesco\b/.test(normalized)) return "Bradesco";
  if (/\bsantander\b/.test(normalized)) return "Santander";
  if (/\bbanco do brasil\b/.test(normalized)) return "Banco do Brasil";
  if (/\bcaixa economica\b/.test(normalized)) return "Caixa";
  if (/\bbanco inter\b|\binter bank\b/.test(normalized)) return "Inter";
  if (/\bc6 bank\b/.test(normalized)) return "C6";
  return undefined;
}

function statementSignals(text: string | undefined) {
  const normalized = normalize((text ?? "").slice(0, 18000));
  return [
    /\bextrato\b/.test(normalized),
    /\blancamentos\b|\bmovimentacoes\b/.test(normalized),
    /\bsaldo em conta\b|\bsaldo da conta\b|\bsaldo do dia\b/.test(normalized),
    /\bconta corrente\b|\bconta digital\b/.test(normalized),
  ].filter(Boolean).length;
}

export function isTabularBankStatement(text: string | undefined) {
  if (!text) return false;
  const datedLines = text
    .split("\n")
    .filter((line) => /^\s*\d{2}\/\d{2}(?:\/\d{4})?\b/.test(line)).length;
  return datedLines >= 5 && statementSignals(text) >= 2;
}

/** Data mais recente escrita por extenso (dd/mm/aaaa) no documento: fim do período ou emissão. */
function referenceDateFromText(text: string | undefined) {
  const dates = [...(text ?? "").matchAll(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/g)]
    .map((m) => `${m[3]}-${m[2]}-${m[1]}`)
    .filter((iso) => Number(iso.slice(5, 7)) >= 1 && Number(iso.slice(5, 7)) <= 12)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Datas sem ano (dd/mm) recebem o ano da data de referência do documento. Se
 * isso colocar o lançamento depois da referência (ex.: 28/12 num extrato
 * emitido em 05/01), ele pertence ao ano anterior.
 */
export function inferYearForDayMonth(day: string, month: string, referenceIso: string) {
  const year = Number(referenceIso.slice(0, 4));
  const candidate = `${year}-${month}-${day}`;
  return candidate > referenceIso ? `${year - 1}-${month}-${day}` : candidate;
}

function dateFromBankLine(raw: string, referenceIso: string) {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return isoFromBr(raw);
  const match = raw.match(/^(\d{2})\/(\d{2})$/);
  return match ? inferYearForDayMonth(match[1], match[2], referenceIso) : null;
}

function signedAmount(raw: string, dc: string | undefined) {
  const parsed = money(raw.replace(/^[+-]/, ""));
  if (parsed === null) return null;
  if (raw.trim().startsWith("-")) return { value: -Math.abs(parsed), explicit: true };
  if (dc?.toUpperCase() === "D") return { value: -Math.abs(parsed), explicit: true };
  if (dc?.toUpperCase() === "C") return { value: Math.abs(parsed), explicit: true };
  if (raw.trim().startsWith("+")) return { value: Math.abs(parsed), explicit: true };
  return { value: Math.abs(parsed), explicit: false };
}

function balanceValue(raw: string | undefined, dc: string | undefined) {
  if (!raw) return null;
  const parsed = money(raw.replace(/^[+-]/, ""));
  if (parsed === null) return null;
  return raw.trim().startsWith("-") || dc?.toUpperCase() === "D" ? -Math.abs(parsed) : Math.abs(parsed);
}

const LINE_PATTERN =
  /^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(?:R\$\s*)?([+-]?[\d.]+,\d{2})\s*([CD])?(?:\s+(?:R\$\s*)?([+-]?[\d.]+,\d{2})\s*([CD])?)?$/i;

const BALANCE_LINE = /^SALDO(?: DO DIA| FINAL| EM CONTA| ANTERIOR| INICIAL)?$/i;

export function analyzeTabularBankStatement(
  text: string | undefined,
  people: { id: string; name: string }[],
  defaultPersonId: string,
): StructuredBankStatementAnalysis {
  if (!text) {
    return { items: [], confidence: 0, candidateLines: 0, matchedLines: 0 };
  }

  const referenceIso = referenceDateFromText(text) ?? isoToday();
  const institution = institutionFromText(text);
  const candidates = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /^\d{2}\/\d{2}(?:\/\d{4})?\b/.test(line));

  type Parsed = { item: ExtractedItem; explicit: boolean; balance: number | null };
  const parsedRows: Parsed[] = [];
  let matchedLines = 0;
  let lastBalance: number | null = null;
  let explicitSigns = 0;
  let resolvedByBalance = 0;

  for (const line of candidates) {
    const match = line.match(LINE_PATTERN);
    if (!match) continue;
    matchedLines += 1;

    const [, rawDate, rawDescription, rawValue, dc, rawBalance, balanceDc] = match;
    if (BALANCE_LINE.test(rawDescription.trim())) {
      // Linha de saldo: o próprio valor é o saldo corrente.
      lastBalance = balanceValue(rawBalance ?? rawValue, rawBalance ? balanceDc : dc);
      continue;
    }

    const signed = signedAmount(rawValue, dc);
    const date = dateFromBankLine(rawDate, referenceIso);
    if (signed === null || signed.value === 0 || !date) continue;

    let value = signed.value;
    let explicit = signed.explicit;
    const balance = balanceValue(rawBalance, balanceDc);
    // Sem sinal nem C/D (colunas separadas de Crédito/Débito): o saldo corrente
    // diz se o dinheiro entrou ou saiu.
    if (!explicit && balance !== null && lastBalance !== null) {
      const delta = balance - lastBalance;
      if (Math.abs(Math.abs(delta) - Math.abs(value)) < 0.01) {
        value = delta < 0 ? -Math.abs(value) : Math.abs(value);
        explicit = true;
        resolvedByBalance += 1;
      }
    }
    if (signed.explicit) explicitSigns += 1;
    if (balance !== null) lastBalance = balance;

    const description = rawDescription.trim();
    const person =
      people.find((candidate) => {
        const first = normalize(candidate.name)
          .split(" ")
          .find((token) => token.length >= 4 && !PLACEHOLDER_NAMES.has(token));
        return first ? new RegExp(`\\b${first}\\b`).test(normalize(description)) : false;
      }) ?? null;

    parsedRows.push({
      explicit,
      balance,
      item: {
        id: uid(),
        description,
        merchant: merchantFromDescription(description),
        amount: Math.abs(value),
        date,
        type: value > 0 ? "income" : "expense",
        nature: natureFor(description, people),
        category: categoryFor(description, value),
        personId: person?.id ?? defaultPersonId,
        selected: true,
        installment: null,
      },
    });
  }

  const rows = parsedRows.map((row) => row.item);
  // Se o documento não marca débito/crédito em nenhuma linha e o saldo não
  // resolveu todas, não sabemos a direção do dinheiro: não usamos o caminho
  // rápido local (a leitura cai para a IA, que vê o layout das colunas).
  const unresolved = parsedRows.filter((row) => !row.explicit).length;
  const ambiguousDirection = explicitSigns === 0 && unresolved > 0;
  void resolvedByBalance;

  const signals = statementSignals(text);
  const coverage = candidates.length ? matchedLines / candidates.length : 0;
  const volumeScore = rows.length >= 10 ? 1 : rows.length >= 5 ? 0.75 : rows.length >= 3 ? 0.45 : 0;
  const signalScore = Math.min(1, signals / 3);
  const confidence = ambiguousDirection
    ? 0
    : Math.min(1, coverage * 0.55 + signalScore * 0.25 + volumeScore * 0.2);

  return {
    items: rows,
    confidence,
    candidateLines: candidates.length,
    matchedLines,
    institution,
  };
}

export function parseTabularBankStatement(
  text: string | undefined,
  people: { id: string; name: string }[],
  defaultPersonId: string,
): ExtractedItem[] {
  const analysis = analyzeTabularBankStatement(text, people, defaultPersonId);
  return analysis.confidence >= 0.72 ? analysis.items : [];
}
