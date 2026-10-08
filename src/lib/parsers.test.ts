import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTabularBankStatement, inferYearForDayMonth } from "./bank-statement-parser.ts";
import { asDate, extractWithGenerator } from "./gemini.ts";
import { parseMoneyValue } from "./money.ts";
import { analyzeStructuredSheetText } from "./sheet-parser.ts";

const people = [{ id: "p-you", name: "Você" }];

describe("parseMoneyValue", () => {
  it("lê formatos brasileiro e internacional", () => {
    assert.equal(parseMoneyValue("1.234,56"), 1234.56);
    assert.equal(parseMoneyValue("1234,56"), 1234.56);
    assert.equal(parseMoneyValue("1234.56"), 1234.56);
    assert.equal(parseMoneyValue("1,234.56"), 1234.56);
    assert.equal(parseMoneyValue("-45.90"), -45.9);
    assert.equal(parseMoneyValue("R$ -45,90"), -45.9);
    assert.equal(parseMoneyValue("(45,90)"), -45.9);
    assert.equal(parseMoneyValue("45,90-"), -45.9);
    assert.equal(parseMoneyValue("1.234"), 1234);
    assert.equal(parseMoneyValue("1.234.567,89"), 1234567.89);
    assert.equal(parseMoneyValue(1234.56), 1234.56);
    assert.equal(parseMoneyValue("abc"), null);
  });
});

describe("planilha estruturada", () => {
  it("não multiplica valores com ponto decimal", () => {
    const text = [
      "data: 05/09/2026 | descricao: Mercado | valor: -45.90",
      "data: 06/09/2026 | descricao: Farmacia | valor: -1234.56",
      "data: 07/09/2026 | descricao: Salario | valor: 3500",
    ].join("\n");
    const result = analyzeStructuredSheetText(text, "p-you");
    assert.deepEqual(
      result.items.map((item) => [item.amount, item.type]),
      [
        [45.9, "expense"],
        [1234.56, "expense"],
        [3500, "income"],
      ],
    );
  });

  it("aceita datas ISO vindas de células de data", () => {
    const result = analyzeStructuredSheetText(
      "data: 2026-09-05 | historico: Uber | debito: 23.50\ndata: 2026-09-06 | historico: Pix recebido | credito: 100",
      "p-you",
    );
    assert.deepEqual(
      result.items.map((item) => [item.date, item.amount, item.type]),
      [
        ["2026-09-05", 23.5, "expense"],
        ["2026-09-06", 100, "income"],
      ],
    );
  });
});

describe("extrato bancário estruturado", () => {
  it("usa o saldo corrente para saber se entrou ou saiu quando não há sinal", () => {
    const text = [
      "EXTRATO CONTA CORRENTE",
      "Lançamentos e saldo do dia",
      "01/09/2026 SALDO ANTERIOR 1.150,00",
      "02/09/2026 PAG BOLETO LIGHT 150,00 1.000,00",
      "03/09/2026 COMPRA CARTAO MERCADO 300,00 700,00",
      "04/09/2026 PIX TRANSF FULANO 50,00 650,00",
      "05/09/2026 TEF CREDITO SALARIO 3.000,00 3.650,00",
      "06/09/2026 COMPRA FARMACIA 80,00 3.570,00",
    ].join("\n");
    const result = analyzeTabularBankStatement(text, people, "p-you");
    assert.deepEqual(
      result.items.map((item) => item.type),
      ["expense", "expense", "expense", "income", "expense"],
    );
    assert.ok(result.confidence >= 0.78);
  });

  it("não usa o caminho rápido quando a direção do dinheiro é ambígua", () => {
    const text = [
      "EXTRATO CONTA CORRENTE",
      "Lançamentos e saldo do dia",
      "02/09/2026 PAG BOLETO LIGHT 150,00",
      "03/09/2026 COMPRA CARTAO MERCADO 300,00",
      "04/09/2026 PIX TRANSF FULANO 50,00",
      "05/09/2026 TEF CREDITO SALARIO 3.000,00",
      "06/09/2026 COMPRA FARMACIA 80,00",
    ].join("\n");
    assert.equal(analyzeTabularBankStatement(text, people, "p-you").confidence, 0);
  });

  it("mantém o comportamento quando o extrato marca débitos com sinal", () => {
    const text = [
      "EXTRATO CONTA CORRENTE",
      "Lançamentos e saldo do dia",
      "02/09/2026 PAG BOLETO LIGHT -150,00",
      "03/09/2026 COMPRA MERCADO -300,00",
      "04/09/2026 PIX TRANSF FULANO -50,00",
      "05/09/2026 TEF CREDITO SALARIO 3.000,00",
      "06/09/2026 COMPRA FARMACIA -80,00",
    ].join("\n");
    const result = analyzeTabularBankStatement(text, people, "p-you");
    assert.deepEqual(
      result.items.map((item) => item.type),
      ["expense", "expense", "expense", "income", "expense"],
    );
    assert.ok(result.confidence >= 0.78);
  });

  it("coloca datas dd/mm de dezembro no ano anterior em extrato emitido em janeiro", () => {
    assert.equal(inferYearForDayMonth("28", "12", "2027-01-05"), "2026-12-28");
    assert.equal(inferYearForDayMonth("02", "01", "2027-01-05"), "2027-01-02");
    const text = [
      "EXTRATO CONTA CORRENTE",
      "Lançamentos e saldo do dia",
      "28/12 PAG BOLETO -150,00",
      "29/12 COMPRA MERCADO -300,00",
      "30/12 PIX TRANSF FULANO -50,00",
      "02/01 TEF CREDITO SALARIO 3.000,00",
      "03/01 COMPRA FARMACIA -80,00",
      "Emitido em 05/01/2027",
    ].join("\n");
    const dates = analyzeTabularBankStatement(text, people, "p-you").items.map((item) => item.date);
    assert.deepEqual(dates, ["2026-12-28", "2026-12-29", "2026-12-30", "2027-01-02", "2027-01-03"]);
  });
});

describe("datas vindas da IA", () => {
  it("recua um ano quando a data cairia muito no futuro", () => {
    assert.equal(asDate("15/12", "2027-01-10"), "2026-12-15");
    assert.equal(asDate("2027-12-15", "2027-01-10"), "2026-12-15");
    assert.equal(asDate("20/01", "2027-01-10"), "2027-01-20");
  });

  it("permite datas futuras quando o usuário cadastra um compromisso", () => {
    assert.equal(asDate("2027-04-15", "2027-01-10", true), "2027-04-15");
  });
});

describe("extração por IA sem cortes silenciosos", () => {
  it("divide documentos longos em blocos e devolve todos os itens", async () => {
    const lines = Array.from(
      { length: 900 },
      (_, index) => `data: 05/09/2026 | descricao: Compra ${index} loja exemplo comercio | valor: -10.00`,
    );
    let calls = 0;
    const result = await extractWithGenerator(
      { text: lines.join("\n"), people: [], defaultPersonId: "p-you", today: "2026-09-30" },
      async (input) => {
        calls += 1;
        const count = (input.text.match(/descricao: Compra/g) ?? []).length;
        const items = Array.from({ length: count }, (_, index) => ({
          description: `Compra ${calls}-${index}`,
          merchant: "Loja",
          amount: 10,
          date: "2026-09-05",
          type: "expense",
        }));
        return { ok: true, text: JSON.stringify({ items }) };
      },
    );
    assert.ok(calls > 1);
    assert.equal(result.ok && result.items.length, 900);
  });
});
