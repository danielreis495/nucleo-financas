import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/import-batch.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validateImportBatch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const file = (name, size = 100, type = "") => ({ name, size, type });
test("accepts mixed images, PDFs, CSV, Excel and TXT", () => {
  assert.equal(validateImportBatch(["foto.jpg", "foto2.png", "a.pdf", "b.pdf", "a.csv", "a.txt", "a.xlsx"].map((name) => file(name))), null);
});
test("accepts boundary sizes and rejects limits before parsing", () => {
  assert.equal(validateImportBatch(Array.from({length: 10}, (_, i) => file(`${i}.csv`))), null);
  assert.match(validateImportBatch(Array.from({length: 11}, () => file("x.csv"))), /10 arquivos/);
  assert.equal(validateImportBatch(Array.from({length: 4}, () => file("x.pdf", 10 * 1024 * 1024))), null);
  assert.match(validateImportBatch([file("x.pdf", 10 * 1024 * 1024 + 1)]), /10 MB/);
  assert.match(validateImportBatch([...Array.from({length: 4}, () => file("x.pdf", 10 * 1024 * 1024)), file("x.txt", 1)]), /40 MB/);
});
test("empty, unsupported, and MIME-only images", () => {
  assert.match(validateImportBatch([]), /Selecione/);
  assert.match(validateImportBatch([file("x.txt", 0)]), /vazio/);
  assert.match(validateImportBatch([file("x.exe")]), /use foto/);
  assert.equal(validateImportBatch([file("camera", 100, "image/jpeg")]), null);
});
