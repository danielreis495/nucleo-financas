import { useEffect } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarClock, Home, Plus, Receipt, Sparkles } from "lucide-react";
import { Toaster } from "sonner";
import { BankLoadingScreen, BankLoginScreen, BankSetupScreen } from "@/components/bank-gate";
import { refreshBank, useBankStatus } from "@/lib/bank/client";
import { useFinanceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV: {
  to: "/" | "/extrato" | "/captura" | "/parcelas" | "/conselhos";
  label: string;
  icon: typeof Home;
  primary?: boolean;
}[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/extrato", label: "Movimentos", icon: Receipt },
  { to: "/captura", label: "Adicionar", icon: Plus, primary: true },
  { to: "/parcelas", label: "Planejar", icon: CalendarClock },
  { to: "/conselhos", label: "Núcleo", icon: Sparkles },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bankPhase = useBankStatus((s) => s.phase);
  const hydrated = useFinanceStore((s) => s.hydrated);
  const bankBootstrapped = useFinanceStore((s) => s.bankBootstrapped);

  useEffect(() => {
    const finish = () => {
      useFinanceStore.getState().setHydrated(true);
      useFinanceStore.getState().advanceDueInstallments();
      // Depois de ler o que está salvo no aparelho, busca o retrato atualizado do banco.
      void refreshBank();
    };
    if (useFinanceStore.persist.hasHydrated()) {
      finish();
      return;
    }
    const unsub = useFinanceStore.persist.onFinishHydration(finish);
    void Promise.resolve(useFinanceStore.persist.rehydrate());
    return unsub;
  }, []);

  if (bankPhase === "login" || bankPhase === "setup") {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-surface">
          {bankPhase === "login" ? <BankLoginScreen /> : <BankSetupScreen />}
        </div>
      </div>
    );
  }

  // Primeira abertura: não mostra a casa de exemplo enquanto os dados do banco chegam.
  const waitingFirstLoad =
    !bankBootstrapped && (!hydrated || bankPhase === "idle" || bankPhase === "loading" || bankPhase === "syncing");

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-x-hidden bg-surface shadow-[var(--shadow-border)]">
        <div className="flex min-h-0 flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {waitingFirstLoad ? (
            <BankLoadingScreen />
          ) : !bankBootstrapped && bankPhase === "error" ? (
            <BankSetupScreen title="Não consegui falar com o banco" />
          ) : (
            <Outlet />
          )}
        </div>

        <nav
          className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
          aria-label="Navegação principal"
        >
          <ul className="grid grid-cols-5 px-1 pt-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <li key={item.to} className="flex justify-center">
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.primary ? "Adicionar movimentação" : item.label}
                    className={cn(
                      "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium transition-colors duration-150",
                      item.primary ? "relative -top-3" : active ? "text-primary" : "text-muted",
                    )}
                  >
                    {item.primary ? (
                      <span
                        className={cn(
                          "flex size-12 items-center justify-center rounded-full shadow-[var(--shadow-border)] transition-transform duration-150",
                          active ? "bg-primary text-primary-fg" : "bg-ink text-primary-fg",
                        )}
                      >
                        <Icon className="size-5" strokeWidth={2} />
                      </span>
                    ) : (
                      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.75} />
                    )}
                    <span className={item.primary ? "text-muted" : undefined}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <Toaster
        position="top-center"
        toastOptions={{
          className: "font-sans text-sm bg-elevated text-fg border-line shadow-[var(--shadow-border)]",
        }}
      />
    </div>
  );
}
