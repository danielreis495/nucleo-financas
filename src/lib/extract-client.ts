import Papa from "papaparse";
import * as XLSX from "xlsx";

export type PreparedDocument = {
  text?: string;
  images?: { mime: string; base64: string }[];
  source: "photo" | "pdf" | "sheet";
};

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file: Blob, max = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao compactar imagem"))),
      "image/jpeg",
      quality,
    );
  });
  return blobToBase64(blob);
}

function linesFromPdfItems(items: unknown[]) {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as { str: string; transform?: number[] };
    if (!item.str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= 4);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao renderizar PDF"))),
      "image/jpeg",
      quality,
    );
  });
  return blobToBase64(blob);
}

async function preparePdf(file: File): Promise<PreparedDocument> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data: buffer,
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    }).promise;
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "PasswordException") {
      throw new Error("Esse PDF está com senha. Salve sem senha e envie de novo.");
    }
    throw new Error("Não abri esse PDF. Tente exportar de novo pelo app do banco.");
  }

  const pageCount = Math.min(pdf.numPages, 12);
  const textParts: string[] = [];
  const images: { mime: string; base64: string }[] = [];
  let textChars = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = linesFromPdfItems(content.items);
    const pageText = lines.join("\n").trim();
    if (pageText) {
      textParts.push(`--- página ${i} ---\n${pageText}`);
      textChars += pageText.length;
    }

    const scanned = pageText.length < 80;
    const wantImage = scanned ? images.length < 8 : images.length < 3;
    if (!wantImage) continue;

    const scale = scanned ? 2 : 1.7;
    const viewport = page.getViewport({ scale });
    const maxEdge = 1800;
    const fit = Math.min(1, maxEdge / Math.max(viewport.width, viewport.height));
    const view = fit < 1 ? page.getViewport({ scale: scale * fit }) : viewport;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(view.width));
    canvas.height = Math.max(1, Math.round(view.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport: view, canvas }).promise;
    images.push({ mime: "image/jpeg", base64: await canvasToJpeg(canvas, scanned ? 0.85 : 0.78) });
  }

  const text = textParts.join("\n\n").slice(0, 40000);
  const looksLikeFatura = /fatura|cart[aã]o|nubank|inter|itau|itaú|c6|bradesco|santander|bb |next|picpay|will bank|fatura de/i.test(
    `${file.name}\n${text}`,
  );

  return {
    source: "pdf",
    text:
      text.length > 20
        ? `${looksLikeFatura ? "TIPO: fatura ou extrato de cartão brasileiro.\n" : ""}Arquivo: ${file.name}\nPáginas lidas: ${pageCount} de ${pdf.numPages}\n\n${text}`
        : undefined,
    images: images.slice(0, 8),
  };
}

function sheetToText(fileName: string, rows: Record<string, unknown>[]) {
  const limited = rows.slice(0, 200);
  const header = Object.keys(limited[0] ?? {});
  const lines = limited.map((row) =>
    header.map((h) => `${h}: ${row[h] ?? ""}`).join(" | "),
  );
  return `Arquivo: ${fileName}\nColunas: ${header.join(", ")}\n${lines.join("\n")}`;
}

async function prepareSheet(file: File): Promise<PreparedDocument> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv")) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    return { source: "sheet", text: sheetToText(file.name, parsed.data) };
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return { source: "sheet", text: `Arquivo vazio: ${file.name}` };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  return { source: "sheet", text: sheetToText(file.name, rows) };
}

export async function prepareFile(file: File): Promise<PreparedDocument> {
  const type = file.type;
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/.test(name)) {
    const base64 = await compressImage(file);
    return { source: "photo", images: [{ mime: "image/jpeg", base64 }] };
  }
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return preparePdf(file);
  }
  if (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type.includes("spreadsheet") ||
    type.includes("csv") ||
    type.includes("excel")
  ) {
    return prepareSheet(file);
  }
  throw new Error("Use foto, PDF, CSV ou planilha Excel.");
}
