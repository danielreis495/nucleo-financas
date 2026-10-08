import { useState, type FormEvent, type ReactNode } from "react";
import { Landmark, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginToBank, refreshBank, useBankStatus } from "@/lib/bank/client";

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}

export function BankLoadingScreen() {
  return (
    <Screen>
      <Loader2 className="size-7 animate-spin text-primary" />
      <h1 className="mt-4 font-display text-2xl">Buscando seus dados no banco…</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
        Na primeira vez isso pode levar até um minuto, porque o Núcleo baixa os últimos meses de
        Itaú e Nubank.
      </p>
    </Screen>
  );
}

export function BankSetupScreen({ title = "Falta um passo na Vercel" }: { title?: string }) {
  const error = useBankStatus((s) => s.error);
  return (
    <Screen>
      <span className="flex size-12 items-center justify-center rounded-full bg-warn-soft text-warn">
        <LockKeyhole className="size-5" />
      </span>
      <h1 className="mt-4 font-display text-2xl">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{error}</p>
      <Button className="mt-5" variant="secondary" onClick={() => void refreshBank()}>
        Tentar de novo
      </Button>
    </Screen>
  );
}

export function BankLoginScreen() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const problem = await loginToBank(password);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Screen>
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Landmark className="size-5" />
      </span>
      <h1 className="mt-4 font-display text-3xl">Núcleo</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
        Digite a senha da casa. Cada aparelho só precisa dela uma vez.
      </p>
      <form onSubmit={submit} className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha da casa"
          className="h-12 w-full rounded-xl bg-elevated px-4 text-center text-base shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          autoFocus
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={!password || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Entrar
        </Button>
      </form>
    </Screen>
  );
}
