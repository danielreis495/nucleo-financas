import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { financialAlerts } from "@/lib/alerts";
import { useDocumentStore } from "@/lib/document-store";
import { useFinanceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FinancialAlertsCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const summaries = useDocumentStore((s) => s.summaries);
  const alerts = financialAlerts(state, summaries, month);

  return (
    <section className="mt-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <ShieldAlert className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Central de alertas</p>
          <h2 className="font-display text-xl">
            {alerts.length ? `${alerts.length} ponto${alerts.length === 1 ? "" : "s"} para acompanhar` : "Nenhum alerta importante"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Regras automáticas do Núcleo: caixa, faturas, orçamento, qualidade dos dados e tendência de gastos.
          </p>
        </div>
      </div>

      {alerts.length ? (
        <ul className="mt-4 flex flex-col gap-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    alert.severity === "high" ? "text-danger" : alert.severity === "medium" ? "text-warn" : "text-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        alert.severity === "high"
                          ? "bg-danger-soft text-danger"
                          : alert.severity === "medium"
                            ? "bg-warn-soft text-warn"
                            : "bg-primary-soft text-primary",
                      )}
                    >
                      {alert.severity === "high" ? "Prioridade" : alert.severity === "medium" ? "Revisar" : "Info"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{alert.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm leading-relaxed">
            Com os dados atuais, não há fatura aberta, déficit de caixa, estouro de orçamento ou inconsistência forte para destacar.
          </p>
        </div>
      )}
    </section>
  );
}
