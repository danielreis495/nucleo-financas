import { AlertTriangle, Landmark, RefreshCw } from "lucide-react";
import { refreshBank, useBankStatus } from "@/lib/bank/client";
import { cn } from "@/lib/utils";

function relativeTime(iso: string | null) {
  if (!iso) return "ainda não sincronizado";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

/** Mostra quais bancos estão conectados, quando atualizou e permite atualizar na hora. */
export function BankStatusCard({ className }: { className?: string }) {
  const { phase, institutions, lastSuccessAt, syncErrors, error } = useBankStatus();
  const busy = phase === "loading" || phase === "syncing";
  const problems = phase === "error" && error ? [error] : syncErrors;

  return (
    <section
      className={cn("rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]", className)}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Landmark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {institutions.length ? institutions.join(" · ") : "Bancos conectados"}
          </p>
          <p className="text-xs text-muted">
            {phase === "syncing" ? "Buscando novidades no banco…" : `Atualizado ${relativeTime(lastSuccessAt)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshBank({ force: true })}
          disabled={busy}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-line text-fg disabled:opacity-60"
          aria-label="Atualizar agora"
        >
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        </button>
      </div>
      {problems.length > 0 ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{problems.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}
