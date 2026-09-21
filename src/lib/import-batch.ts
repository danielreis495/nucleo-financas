export const IMPORT_LIMITS = { files: 10, fileBytes: 10 * 1024 * 1024, batchBytes: 40 * 1024 * 1024 };

export function validateImportBatch(files: readonly { name: string; size: number; type: string }[]): string | null {
  if (!files.length) return "Selecione pelo menos um arquivo.";
  if (files.length > IMPORT_LIMITS.files) return "Selecione no máximo 10 arquivos por lote.";
  if (files.reduce((sum, file) => sum + file.size, 0) > IMPORT_LIMITS.batchBytes) return "O lote deve ter no máximo 40 MB.";
  for (const file of files) {
    if (!file.size) return `${file.name}: arquivo vazio.`;
    if (file.size > IMPORT_LIMITS.fileBytes) return `${file.name}: o limite por arquivo é 10 MB.`;
    if (!/\.(png|jpe?g|webp|gif|heic|heif|pdf|csv|xlsx?|txt)$/i.test(file.name) &&
        !/^(image\/|application\/pdf$|text\/(csv|plain)$)/.test(file.type)) {
      return `${file.name}: use foto, PDF, CSV, Excel ou TXT.`;
    }
  }
  return null;
}
