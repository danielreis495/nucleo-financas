import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { financialAlerts } from "@/lib/alerts";
import { useDocumentStore } from "@/lib/document-store";
import { useFinanceStore } from "@/lib/store";
import { todayIso } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function TodayBriefCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const summaries = useDocumentStore((s) => s.summaries);
  const alerts = financialAlerts(state, summaries, month).slice(0, 3);
  const current = month === todayIso().slice(0, 7);

  return (
    <section className="mx-5 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            {current ? "Hoje no Núcleo" : "Destaques do mês"}
          </p>
          <h2 className="mt-1 font-display text-xl">
            {alerts.length ? "O que merece sua atenção" : "Tudo sob controle"}
          </h2>
        </div>
        {alerts.length ? (
          <ShieldAlert className="size-5 shrink-0 text-primary" />
        ) : (
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
        )}
      </div>

      {alerts.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {alerts.map((alert) => {
            const issue =
              alert.kind === "duplicate"
                ? "duplicate"
                : alert.id === "quality-unidentified"
                  ? "unidentified"
                  : null;
            return (
            <li key={alert.id} className="rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    alert.severity === "high" ? "text-danger" : "text-warn",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{alert.body}</p>
                  {issue ? (
                    <Link
                      to="/extrato"
                      search={{ issue }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"
                    >
                      Conferir agora <ArrowRight className="size-3" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Não encontrei alerta crítico nos dados que já estão no app. Continue importando contas e faturas para manter essa leitura atualizada.
        </p>
      )}

      <Link to="/conselhos" className="mt-3 inline-flex text-xs font-medium text-primary">
        Abrir Central de alertas e Núcleo IA
      </Link>
    </section>
  );
}
