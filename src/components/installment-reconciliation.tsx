import { useState } from "react";
import { toast } from "sonner";
import { useFinanceStore } from "@/lib/store";
import { natureOf } from "@/lib/movement-nature";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
  const candidates = selected ? state.transactions.filter((row) =>
    !row.installmentId && row.status === "posted" && row.type === "expense" &&
    natureOf(row) === "budget" && row.originKind !== "credit_card" &&
    Math.round(row.amount * 100) === Math.round(selected.amount * 100) &&
    !state.transactions.some((item) => item.reconciledPaymentId === row.id),
  ).sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(selected.date)) - Math.abs(Date.parse(b.date) - Date.parse(selected.date))) : [];
  const payment = candidates.find((row) => row.id === paymentId);
  return <details className="mt-3 border-t border-line pt-3 text-sm">
    <summary className="cursor-pointer">Conciliar pagamento</summary>
    <p className="my-3">Confira credor, data e conta. Valor igual não comprova correspondência. Esta etapa aceita pagamentos integrais de dívidas e empréstimos; não pagamentos de fatura.</p>
    <label className="block">Parcela
      <select className="my-2 w-full rounded-md bg-surface p-2" value={installmentId} onChange={(event) => { setInstallmentId(event.target.value); setPaymentId(""); setManual(false); }}>
        <option value="">Selecione</option>
        {rows.map((row) => <option key={row.id} value={row.id}>{row.installmentIndex}/{row.installmentTotal} · {row.date} · {formatBRL(row.amount)} · {row.manualPayment ? "Pagamento confirmado manualmente" : row.reconciledPaymentId ? "Conciliada" : "A conferir"}</option>)}
      </select>
    </label>
    {selected?.originKind === "credit_card" ? <p>Esta parcela deve ser conferida pela fatura. Conciliação de cartões não disponível aqui.</p> : selected?.manualPayment ? <div>
      <p>Pagamento confirmado manualmente em {selected.date}. Conta: {state.accounts.find((a) => a.id === selected.accountId)?.name ?? "Conta indisponível"}.</p>
      <Button variant="secondary" onClick={() => { if (state.confirmInstallmentPaid(selected.id, null)) toast.success("Confirmação desfeita. Dados anteriores restaurados."); }}>Desfazer confirmação manual</Button>
    </div> : selected?.reconciledPaymentId ? <Button variant="secondary" onClick={() => {
      if (state.reconcileInstallment(selected.id, null)) toast.success("Vínculo desfeito. Pagamento preservado.");
    }}>Desfazer vínculo</Button> : selected ? <>
      <Button variant="secondary" className="my-3" onClick={() => {
        setManual(!manual); setPaidDate(selected.date > todayIso() ? todayIso() : selected.date); setAccountId(selected.accountId ?? "");
      }}>{manual ? "Cancelar confirmação manual" : "Já paguei esta parcela"}</Button>
      {manual ? <div className="mb-4 space-y-3 rounded-md bg-surface p-3">
        <p>Confirmar {formatBRL(selected.amount)} na própria parcela, sem criar outra despesa. Se o pagamento já estiver em outro lançamento, use o vínculo pelo extrato para evitar duplicidade.</p>
        <label className="block">Data do pagamento<input className="block w-full p-2" type="date" max={todayIso()} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></label>
        <label className="block">Conta do pagamento<select className="block w-full p-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Selecione a conta</option>{state.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <Button disabled={!paidDate || !accountId} onClick={() => {
          if (state.confirmInstallmentPaid(selected.id, { date: paidDate, accountId })) { setManual(false); toast.success("Pagamento confirmado sem criar outra despesa."); }
          else toast.error("Confira data, conta e situação da parcela.");
        }}>Confirmar pagamento manual</Button>
      </div> : null}
      <label className="block">Pagamento do extrato
        <select className="my-2 w-full rounded-md bg-surface p-2" value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
          <option value="">Selecione e confira</option>
          {candidates.map((row) => <option key={row.id} value={row.id}>{row.date} · {row.merchant} · {row.originInstitution || state.accounts.find((account) => account.id === row.accountId)?.name || "Conta não informada"}</option>)}
        </select>
      </label>
      {!candidates.length ? <p>Nenhum pagamento integral disponível. Importe ou confira o extrato. Valores parciais e agrupados ainda não são suportados.</p> : null}
      {payment ? <p className="my-2">Vincular {payment.description} ({formatBRL(payment.amount)}) à parcela {selected.installmentIndex}. A despesa será contada uma única vez, na data do pagamento. Nenhum registro será apagado.</p> : null}
      <Button disabled={!payment} onClick={() => {
        if (state.reconcileInstallment(selected.id, paymentId)) { setPaymentId(""); toast.success("Conciliado."); }
        else toast.error("Vínculo inválido ou pagamento já utilizado.");
      }}>Confirmar vínculo</Button>
    </> : null}
    {selected?.reconciliationHistory?.map((event, index) => <p className="mt-2" key={index}>{{ link: "Vinculado", unlink: "Vínculo desfeito", manual: "Pagamento confirmado manualmente", undo_manual: "Confirmação manual desfeita" }[event.action]} · {new Date(event.at).toLocaleString("pt-BR")}</p>)}
  </details>;
}
