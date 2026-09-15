import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { financialAlerts } from "@/lib/alerts";
import { useDocumentStore } from "@/lib/document-store";
import { useFinanceStore } from "@/lib/store";
import { cn, todayIso } from "@/lib/utils";

export function TodayBriefCard({ month }: { month: string }) {
  const state = useFinanceStore();
  const summaries = useDocumentStore((s) => s.summaries);
  const alerts = financialAlerts(state, summaries, month).slice(0, 3);
  const current = month === todayIso().slice(0, 7);
  const first = alerts[0];

  if (!first) {
    return (
      <section className="mx-5 flex items-center gap-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <CheckCircle2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Tudo sob controle</p>
          <p className="truncate text-xs text-muted">
            {current ? "Nenhum alerta importante para hoje." : "Nenhum alerta importante neste mês."}
          </p>
        </div>
        <Link to="/conselhos" className="shrink-0 text-xs font-medium text-primary">
          Ver
        </Link>
      </section>
    );
  }

  const issue =
    first.kind === "duplicate"
      ? "duplicate"
      : first.id === "quality-unidentified"
        ? "unidentified"
        : null;

  return (
    <section className="mx-5 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            first.severity === "high" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
          )}
        >
          <ShieldAlert className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{first.title}</p>
            {alerts.length > 1 ? (
              <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[10px] font-medium text-muted">
                +{alerts.length - 1}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{first.body}</p>

          <div className="mt-2 flex items-center gap-3">
            {issue ? (
              <Link
                to="/extrato"
                search={{ issue }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                Conferir <ArrowRight className="size-3" />
              </Link>
            ) : null}
            <Link to="/conselhos" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              {alerts.length > 1 ? `Ver ${alerts.length} alertas` : "Ver detalhes"}
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        <AlertTriangle
          className={cn(
            "mt-0.5 size-4 shrink-0",
            first.severity === "high" ? "text-danger" : "text-warn",
          )}
        />
      </div>
    </section>
  );
}
