type PdfTextItem = {
  str: string;
  transform?: number[];
};

type PositionedText = {
  x: number;
  y: number;
  str: string;
};

function normalizeForDetection(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function joinRows(items: PositionedText[]) {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (!row) {
      row = { y: item.y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x: item.x, str: item.str });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Preserva a ordem de leitura de faturas que exibem duas tabelas lado a lado.
 * Sem essa separação, compras diferentes que compartilham a mesma coordenada Y
 * viram uma única linha e o extrator pode somar ou trocar seus valores.
 */
export function linesFromPdfItems(items: unknown[], pageWidth = 0) {
  const positioned: PositionedText[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as PdfTextItem;
    if (!item.str.trim()) continue;
    positioned.push({
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      str: item.str,
    });
  }

  const headings = positioned.filter((item) =>
    normalizeForDetection(item.str).includes("lancamentos: compras e saques"),
  );
  const hasSideBySideTransactions = pageWidth > 0 && headings.length >= 2;

  if (!hasSideBySideTransactions) return joinRows(positioned);

  const columnStarts = headings.map((item) => item.x).sort((a, b) => a - b);
  // O valor da tabela esquerda pode ficar além da metade geométrica da página.
  // O segundo cabeçalho é o início confiável da coluna direita.
  const leftColumnStart = columnStarts[0] ?? 0;
  const secondHeadingStart = columnStarts[1] ?? pageWidth / 2;
  // Datas e títulos da direita podem começar poucos pontos antes do texto do
  // cabeçalho. Mantemos uma margem proporcional ao espaço entre as colunas.
  const rightColumnStart = secondHeadingStart - (secondHeadingStart - leftColumnStart) * 0.1;
  const left = joinRows(positioned.filter((item) => item.x < rightColumnStart));
  const right = joinRows(positioned.filter((item) => item.x >= rightColumnStart));

  return ["[COLUNA ESQUERDA]", ...left, "[COLUNA DIREITA]", ...right];
}

export function removeFutureCardInvoiceProjection(lines: string[]) {
  const futureSection = lines.findIndex((line) =>
    normalizeForDetection(line).includes("compras parceladas - proximas faturas"),
  );
  return futureSection >= 0 ? lines.slice(0, futureSection) : lines;
}
