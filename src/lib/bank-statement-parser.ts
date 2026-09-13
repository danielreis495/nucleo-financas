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

function householdTransfer(description: string, people: { name: string }[]) {
  const text = normalize(description);
  if (!/^pix transf\b|^transferencia\b|^ted\b/.test(text)) return false;
  const words = new Set(text.split(" "));
  for (const person of people) {
    const tokens = normalize(person.name)
      .split(" ")
      .filter((token) => token.length >= 4);
    if (tokens.some((token) => words.has(token))) return true;
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
  if (/\bcredito consignado\b|\bemprestimo\b|\bcredito contratado\b/.test(text)) {
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

export function isTabularBankStatement(text: string | undefined) {
  if (!text) return false;
  const normalized = normalize(text.slice(0, 18000));
  const datedLines = text
    .split("\n")
    .filter((line) => /^\s*\d{2}\/\d{2}\/\d{4}\b/.test(line)).length;
  return (
    datedLines >= 5 &&
    /\bextrato conta\b|\bextrato bancario\b/.test(normalized) &&
    /\bsaldo do dia\b|\bsaldo em conta\b/.test(normalized)
  );
}

export function parseTabularBankStatement(
  text: string | undefined,
  people: { id: string; name: string }[],
  defaultPersonId: string,
): ExtractedItem[] {
  if (!isTabularBankStatement(text)) return [];

  const rows: ExtractedItem[] = [];
  for (const rawLine of (text ?? "").split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const match = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})(?:\s+(-?[\d.]+,\d{2}))?$/,
    );
    if (!match) continue;

    const [, brDate, rawDescription, rawValue] = match;
    if (/^SALDO DO DIA$/i.test(rawDescription.trim())) continue;

    const signed = money(rawValue);
    const date = isoFromBr(brDate);
    if (signed === null || signed === 0 || !date) continue;

    const description = rawDescription.trim();
    const person =
      people.find((candidate) => {
        const first = normalize(candidate.name).split(" ").find((token) => token.length >= 4);
        return first ? new RegExp(`\\b${first}\\b`).test(normalize(description)) : false;
      }) ?? null;

    rows.push({
      id: uid(),
      description,
      merchant: merchantFromDescription(description),
      amount: Math.abs(signed),
      date,
      type: signed > 0 ? "income" : "expense",
      nature: natureFor(description, people),
      category: categoryFor(description, signed),
      personId: person?.id ?? defaultPersonId,
      selected: true,
      installment: null,
    });
  }

  return rows;
}
