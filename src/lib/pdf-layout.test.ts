import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linesFromPdfItems, removeFutureCardInvoiceProjection } from "./pdf-layout.ts";

function item(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

describe("PDF invoice layout", () => {
  it("keeps side-by-side Itaú transactions on separate lines", () => {
    const lines = linesFromPdfItems(
      [
        item("Lançamentos: compras e saques", 55, 700),
        item("Lançamentos: compras e saques", 320, 700),
        item("18/08 AMAZON BR *Amazo02/02", 55, 660),
        item("83,08", 250, 660),
        item("11/09 99Food *53.416.278 JOS", 320, 660),
        item("70,61", 520, 660),
      ],
      595,
    );

    assert.deepEqual(lines, [
      "[COLUNA ESQUERDA]",
      "Lançamentos: compras e saques",
      "18/08 AMAZON BR *Amazo02/02 83,08",
      "[COLUNA DIREITA]",
      "Lançamentos: compras e saques",
      "11/09 99Food *53.416.278 JOS 70,61",
    ]);
    assert.equal(lines.some((line) => line.includes("AMAZON") && line.includes("99Food")), false);
  });

  it("keeps the original row order for single-column pages", () => {
    const lines = linesFromPdfItems(
      [item("Total desta fatura", 55, 700), item("3.434,05", 450, 700)],
      595,
    );

    assert.deepEqual(lines, ["Total desta fatura 3.434,05"]);
  });

  it("removes future installments from the current invoice input", () => {
    const lines = removeFutureCardInvoiceProjection([
      "04/06 PARCELAMEN FATURA 04/04 248,43",
      "L Total dos lançamentos atuais 3.434,05",
      "Compras parceladas - próximas faturas",
      "14/09 AMAZON BR *Amazo02/02 33,93",
      "Próxima fatura 291,02",
    ]);

    assert.deepEqual(lines, [
      "04/06 PARCELAMEN FATURA 04/04 248,43",
      "L Total dos lançamentos atuais 3.434,05",
    ]);
  });
});
