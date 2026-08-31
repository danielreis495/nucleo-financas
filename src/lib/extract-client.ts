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

async function compressImage(file: Blob, max = 1280, quality = 0.72) {
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

async function preparePdf(file: File): Promise<PreparedDocument> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, 4);
  const textParts: string[] = [];
  const images: { mime: string; base64: string }[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) textParts.push(`--- página ${i} ---\n${pageText}`);

    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao renderizar PDF"))),
        "image/jpeg",
        0.7,
      );
    });
    images.push({ mime: "image/jpeg", base64: await blobToBase64(blob) });
  }

  const text = textParts.join("\n").slice(0, 16000);
  return {
    source: "pdf",
    text: text.length > 40 ? text : undefined,
    images: images.slice(0, 3),
  };
}

function sheetToText(fileName: string, rows: Record<string, unknown>[]) {
  const limited = rows.slice(0, 80);
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
