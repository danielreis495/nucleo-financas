/**
 * Sentido de um movimento vindo da Pluggy, usado ao gravar no banco de dados.
 *
 * No cartão, a Pluggy segue o sinal do valor: positivo é compra (aumenta a fatura) e
 * negativo é crédito (pagamento ou estorno). O campo `type` nem sempre acompanha: um
 * estorno pode chegar como DEBIT com valor negativo. https://docs.pluggy.ai/docs/transactions
 */
export function isRefundOperation(operationType: string | null | undefined) {
  return /^ESTORNO/i.test((operationType ?? "").trim());
}

export function cardDirection(input: {
  amount: number;
  type: string | null | undefined;
  operationType: string | null | undefined;
}): "DEBIT" | "CREDIT" {
  if (Number(input.amount) < 0) return "CREDIT";
  if (isRefundOperation(input.operationType)) return "CREDIT";
  return input.type === "CREDIT" ? "CREDIT" : "DEBIT";
}
