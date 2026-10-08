const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatBRL(value: number) {
  return brl.format(value);
}

export function formatBRLCompact(value: number) {
  if (Math.abs(value) >= 1000) return brlCompact.format(value);
  return brl.format(value);
}

/**
 * Lê valores monetários nos formatos brasileiro e internacional:
 * "1.234,56", "1234,56", "1234.56", "1,234.56", "R$ -45,90", "(45,90)", "45,90-".
 * O último separador seguido de 1–2 dígitos é o decimal. Um único ponto seguido
 * de exatamente 3 dígitos ("1.234") é milhar, como nos extratos brasileiros.
 * Números de planilha (ex.: 1234.56) devem ser passados como number.
 */
export function parseMoneyValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /^-|^R\$\s*-|-\s*$|\bD$/i.test(text.replace(/\s+/g, ""));
  const body = text.replace(/[^\d,.]/g, "");
  if (!/\d/.test(body)) return null;

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = body.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const parts = body.split(",");
    normalized =
      parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  } else if (lastDot >= 0) {
    const parts = body.split(".");
    const fraction = parts[parts.length - 1];
    normalized =
      parts.length === 2 && fraction.length !== 3 ? `${parts[0]}.${fraction}` : parts.join("");
  } else {
    normalized = body;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function parseLooseAmount(raw: string) {
  return parseMoneyValue(raw) ?? 0;
}

/** Arredonda para centavos, evitando resíduos de ponto flutuante em somas. */
export function roundCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMonthTitle(key: string) {
  const [y, m] = key.split("-").map(Number);
  const names = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${names[(m ?? 1) - 1]} ${y}`;
}

export function formatShortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
