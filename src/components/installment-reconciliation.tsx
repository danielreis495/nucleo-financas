import { useState } from "react";
import { Link2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { natureOf } from "@/lib/movement-nature";
import { formatBRL, formatShortDate } from "@/lib/money";
import { useFinanceStore } from "@/lib/store";
import { todayIso } from "@/lib/utils";

export function InstallmentReconciliation({ planId }: { planId: string }) {
  const state = useFinanceStore();
  const [installmentId, setInstallmentId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [manual, setManual] = useState(false);
  const [paidDate, setPaidDate] = useState(todayIso());
  const [accountId, setAccountId] = useState("");

  const rows = state.transactions.filter((row) => row.installmentId === planId);
  const selected = rows.find((row) => row.id === installmentId);
  const candidates = selected
    ? state.transactions
        .filter(
          (row) =>
            !row.installmentId &&
            row.status === "posted" &&
            row.type === "expense" &&
            natureOf(row) === "budget" &&
            row.originKind !== "credit_card" &&
            Math.round(row.amount * 100) === Math.round(selected.amount * 100) &&
            !state.transactions.some((item) => item.reconciledPaymentId === row.id),
        )
        .sort(
          (a, b) =>
            Math.abs(Date.parse(a.date) - Date.parse(selected.date)) -
            Math.abs(Date.parse(b.date) - Date.parse(selected.date)),
        )
    : [];
  const payment = candidates.find((row) => row.id === paymentId);

  return (
    <details className="rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-border)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
        <ReceiptText className="size-4 text-primary" />
        Confirmar ou conciliar pagamento
      </summary>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Escolha uma parcela e confirme como ela foi paga. Valor igual sozinho não comprova a correspondência.
      </p>

      <label className="mt-3 block text-xs font-medium text-muted">
        Parcela
        <select
          className="mt-1 h-10 w-full rounded-lg bg-elevated px-3 text-sm shadow-[var(--shadow-border)]"
          value={installmentId}
          onChange={(event) => {
            setInstallmentId(event.target.value);
            setPaymentId("");
            setManual(false);
          }}
        >
          <option value="">Selecione</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.installmentIndex}/{row.installmentTotal} · {formatShortDate(row.date)} · {formatBRL(row.amount)} ·{" "}
              {row.manualPayment ? "paga manualmente" : row.reconciledPaymentId ? "conciliada" : "a conferir"}
            </option>
          ))}
        </select>
      </label>

      {selected?.originKind === "credit_card" ? (
        <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-primary">
          Esta parcela pertence a cartão e deve ser conferida pela fatura.
        </p>
      ) : selected?.manualPayment ? (
        <div className="mt-3 rounded-lg bg-primary-soft p-3 text-xs text-primary">
          <p>
            Pagamento confirmado em {formatShortDate(selected.date)} ·{" "}
            {state.accounts.find((account) => account.id === selected.accountId)?.name ?? "Conta indisponível"}.
          </p>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            onClick={() => {
              if (state.confirmInstallmentPaid(selected.id, null)) {
                toast.success("Confirmação desfeita. Dados anteriores restaurados.");
              }
            }}
          >
            Desfazer confirmação
          </Button>
        </div>
      ) : selected?.reconciledPaymentId ? (
        <Button
          className="mt-3 w-full"
          variant="secondary"
          onClick={() => {
            if (state.reconcileInstallment(selected.id, null)) {
              toast.success("Vínculo desfeito. Pagamento preservado.");
            }
          }}
        >
          Desfazer vínculo com extrato
        </Button>
      ) : selected ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setManual(true);
                setPaidDate(selected.date > todayIso() ? todayIso() : selected.date);
                setAccountId(selected.accountId ?? "");
              }}
              className="rounded-lg bg-primary-soft px-3 py-3 text-left text-xs font-medium text-primary"
            >
              Já paguei
              <span className="mt-0.5 block text-[10px] font-normal text-primary/75">Confirmar manualmente</span>
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="rounded-lg bg-elevated px-3 py-3 text-left text-xs font-medium shadow-[var(--shadow-border)]"
            >
              Está no extrato
              <span className="mt-0.5 block text-[10px] font-normal text-muted">Vincular pagamento</span>
            </button>
          </div>

          {manual ? (
            <div className="mt-3 rounded-lg bg-elevated p-3 shadow-[var(--shadow-border)]">
              <p className="text-xs leading-relaxed text-muted">
                Confirma {formatBRL(selected.amount)} sem criar uma segunda despesa.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[10px] font-medium text-muted">
                  Data
                  <input
                    className="mt-1 h-10 w-full rounded-lg bg-surface px-2 text-xs"
                    type="date"
                    max={todayIso()}
                    value={paidDate}
                    onChange={(event) => setPaidDate(event.target.value)}
                  />
                </label>
                <label className="text-[10px] font-medium text-muted">
                  Conta
                  <select
                    className="mt-1 h-10 w-full rounded-lg bg-surface px-2 text-xs"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {state.accounts
                      .filter((account) => account.active)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <Button
                className="mt-3 w-full"
                disabled={!paidDate || !accountId}
                onClick={() => {
                  if (state.confirmInstallmentPaid(selected.id, { date: paidDate, accountId })) {
                    setManual(false);
                    toast.success("Pagamento confirmado sem criar outra despesa.");
                  } else {
                    toast.error("Confira data, conta e situação da parcela.");
                  }
                }}
              >
                Confirmar pagamento
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs font-medium text-muted">
                Pagamento encontrado
                <select
                  className="mt-1 h-10 w-full rounded-lg bg-elevated px-3 text-sm shadow-[var(--shadow-border)]"
                  value={paymentId}
                  onChange={(event) => setPaymentId(event.target.value)}
                >
                  <option value="">Selecione e confira</option>
                  {candidates.map((row) => (
                    <option key={row.id} value={row.id}>
                      {formatShortDate(row.date)} · {row.merchant} ·{" "}
                      {row.originInstitution ||
                        state.accounts.find((account) => account.id === row.accountId)?.name ||
                        "Conta não informada"}
                    </option>
                  ))}
                </select>
              </label>

              {!candidates.length ? (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Nenhum pagamento integral com o mesmo valor está disponível no extrato.
                </p>
              ) : null}

              {payment ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-xs text-primary">
                  <Link2 className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    Vincular {payment.merchant} ({formatBRL(payment.amount)}) à parcela {selected.installmentIndex}.
                  </p>
                </div>
              ) : null}

              <Button
                className="mt-3 w-full"
                disabled={!payment}
                onClick={() => {
                  if (state.reconcileInstallment(selected.id, paymentId)) {
                    setPaymentId("");
                    toast.success("Pagamento conciliado.");
                  } else {
                    toast.error("Vínculo inválido ou pagamento já utilizado.");
                  }
                }}
              >
                Vincular ao extrato
              </Button>
            </div>
          )}
        </>
      ) : null}

      {selected?.reconciliationHistory?.length ? (
        <details className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted">
            Histórico
          </summary>
          <div className="mt-2 space-y-1">
            {selected.reconciliationHistory.map((event, index) => (
              <p className="text-[10px] text-muted" key={index}>
                {{
                  link: "Vinculado",
                  unlink: "Vínculo desfeito",
                  manual: "Pagamento confirmado",
                  undo_manual: "Confirmação desfeita",
                }[event.action]}{" "}
                · {new Date(event.at).toLocaleString("pt-BR")}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </details>
  );
}
