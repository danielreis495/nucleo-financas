import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PersonAvatar, personColorClass } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { monthTransactions, spendByPerson } from "@/lib/selectors";
import { useFinanceStore } from "@/lib/store";
import type { PersonColor, PersonRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/casa")({ component: CasaPage });

const ROLES: { id: PersonRole; label: string }[] = [
  { id: "you", label: "Você" },
  { id: "partner", label: "Parceiro(a)" },
  { id: "child", label: "Filho(a)" },
  { id: "parent", label: "Pai/mãe" },
  { id: "other", label: "Outro / Casa" },
];

const COLORS: PersonColor[] = ["p1", "p2", "p3", "p4", "p5"];
const STORAGE_KEY = "nucleo-finance-v1";
const BACKUP_VERSION = 1;

type BackupFile = {
  app: "nucleo-financas";
  backupVersion: number;
  createdAt: string;
  storageKey: string;
  data: {
    state: Record<string, unknown>;
    version?: number;
  };
};

function downloadBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("Não encontrei os dados deste aparelho.");
    const parsed = JSON.parse(raw) as BackupFile["data"];
    if (!parsed?.state || typeof parsed.state !== "object") {
      throw new Error("Os dados locais estão em um formato inesperado.");
    }

    // A chave do Gemini não entra no arquivo de backup. Além de ser desnecessária
    // para os dados financeiros, isso evita colocar um segredo em um arquivo que
    // pode ser compartilhado. O restore preserva a chave que já estiver no aparelho.
    const state = { ...parsed.state };
    delete state.geminiKey;

    const backup: BackupFile = {
      app: "nucleo-financas",
      backupVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      data: {
        ...parsed,
        state,
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nucleo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Backup criado. Guarde o arquivo em um local seguro.");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Não consegui criar o backup.");
  }
}

function restoreBackup(file: File, currentGeminiKey: string) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(String(reader.result)) as BackupFile;
      const state = backup?.data?.state;
      if (
        backup?.app !== "nucleo-financas" ||
        backup.backupVersion !== BACKUP_VERSION ||
        !state ||
        typeof state !== "object" ||
        !Array.isArray(state.people) ||
        !Array.isArray(state.transactions) ||
        !Array.isArray(state.plans) ||
        !Array.isArray(state.budgets) ||
        !Array.isArray(state.customCategories)
      ) {
        throw new Error("Esse arquivo não é um backup válido do Núcleo.");
      }

      // Mantém a chave do Gemini já existente no aparelho; ela nunca é importada
      // de um arquivo externo.
      const restored = {
        ...backup.data,
        state: {
          ...state,
          geminiKey: currentGeminiKey,
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      toast.success("Backup restaurado. Reabrindo o Núcleo…");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui restaurar o backup.");
    }
  };
  reader.onerror = () => toast.error("Não consegui ler o arquivo de backup.");
  reader.readAsText(file);
}

function CasaPage() {
  const state = useFinanceStore();
  const month = state.viewMonth;
  const rows = monthTransactions(state, month);
  const spent = spendByPerson(rows, state.people);
  const addPerson = useFinanceStore((s) => s.addPerson);
  const updatePerson = useFinanceStore((s) => s.updatePerson);
  const removePerson = useFinanceStore((s) => s.removePerson);
  const setHouseholdName = useFinanceStore((s) => s.setHouseholdName);
  const resetDemo = useFinanceStore((s) => s.resetDemo);
  const clearAll = useFinanceStore((s) => s.clearAll);

  const [name, setName] = useState("");
  const [role, setRole] = useState<PersonRole>("partner");
  const [color, setColor] = useState<PersonColor>("p2");
  const restoreInput = useRef<HTMLInputElement>(null);

  return (
    <main className="flex flex-col px-5 pt-6 pb-8">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Casa</p>
      <input
        value={state.householdName}
        onChange={(e) => setHouseholdName(e.target.value)}
        className="font-display text-3xl tracking-tight bg-transparent outline-none"
        aria-label="Nome da casa"
      />
      <p className="mt-1 text-sm text-muted">Quem entra no orçamento. Toque no nome da casa para mudar.</p>

      <ul className="mt-5 flex flex-col gap-2">
        {spent.map(({ person, amount }) => (
          <li key={person.id} className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-center gap-3">
              <PersonAvatar person={person} size="lg" />
              <div className="min-w-0 flex-1">
                <input
                  value={person.name}
                  onChange={(e) => updatePerson(person.id, { name: e.target.value })}
                  className="w-full bg-transparent text-base font-medium outline-none"
                />
                <p className="text-xs text-muted">
                  {ROLES.find((r) => r.id === person.role)?.label} · {formatBRL(amount)} este mês
                </p>
              </div>
              {state.people.length > 1 ? (
                <button
                  className="text-xs text-muted hover:text-danger"
                  onClick={() => removePerson(person.id)}
                >
                  Remover
                </button>
              ) : null}
            </div>
            <div className="mt-3">
              <p className="text-xs text-muted">Teto pessoal (opcional)</p>
              <div className="mt-1 flex gap-1.5 overflow-x-auto">
                {[null, 400, 800, 1500, 2500, 4000].map((n) => (
                  <button
                    key={String(n)}
                    onClick={() => updatePerson(person.id, { monthlyBudget: n })}
                    className={cn(
                      "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
                      person.monthlyBudget === n ? "bg-primary text-primary-fg" : "bg-line",
                    )}
                  >
                    {n === null ? "Sem teto" : formatBRLCompact(n)}
                  </button>
                ))}
              </div>
              {person.monthlyBudget ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      amount > person.monthlyBudget ? "bg-danger" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, (amount / person.monthlyBudget) * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl">Adicionar pessoa</h2>
        <p className="mt-1 text-sm text-muted">Parceiro, filho, quem divide a casa.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="mt-3 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium",
                role === r.id ? "bg-primary text-primary-fg" : "bg-line",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Cor ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-8 rounded-full",
                personColorClass(c),
                color === c ? "outline-2 outline-offset-2 outline-fg" : "",
              )}
            />
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          disabled={!name.trim()}
          onClick={() => {
            addPerson({ name: name.trim(), role, color });
            setName("");
            toast.success("Pessoa adicionada");
          }}
        >
          Incluir na casa
        </Button>
      </section>

      <Link
        to="/conselhos"
        className="mt-4 flex h-12 items-center justify-center rounded-lg bg-primary-soft text-sm font-medium text-primary"
      >
        Ver conselhos de corte
      </Link>

      <GeminiKeyCard />

      <section className="mt-6 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl">Segurança dos dados</h2>
        <p className="mt-1 text-sm text-muted">
          Seus dados financeiros atuais ficam neste aparelho. Faça um backup antes de trocar de celular ou de fazer mudanças importantes no app.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={downloadBackup}>
            Fazer backup
          </Button>
          <Button variant="secondary" onClick={() => restoreInput.current?.click()}>
            Restaurar backup
          </Button>
        </div>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) restoreBackup(file, state.geminiKey);
          }}
        />
        <p className="mt-3 text-xs text-muted">
          O backup não inclui a chave do Gemini. Isso é intencional: segredos não devem viajar junto com seus dados.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            resetDemo();
            toast.success("Voltou o exemplo da família Almeida");
          }}
        >
          Restaurar casa de exemplo
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => {
            clearAll();
            toast.success("Casa zerada");
          }}
        >
          Começar do zero
        </Button>
      </div>
    </main>
  );
}

function GeminiKeyCard() {
  const saved = useFinanceStore((s) => s.geminiKey);
  const setGeminiKey = useFinanceStore((s) => s.setGeminiKey);
  const [draft, setDraft] = useState("");

  const tail = saved.length > 6 ? saved.slice(-4) : "";

  return (
    <section className="mt-6 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">Chave do Gemini</h2>
      <p className="mt-1 text-sm text-muted">
        Cole aqui, no app. Não precisa da Vercel. Pegue em{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          aistudio.google.com/apikey
        </a>
        .
      </p>
      {saved ? (
        <p className="mt-3 text-sm text-primary">Salva · termina em {tail}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">Ainda não tem chave neste aparelho.</p>
      )}
      <input
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="AIza…"
        className="mt-3 h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
      />
      <div className="mt-3 flex gap-2">
        <Button
          className="flex-1"
          disabled={!draft.trim()}
          onClick={() => {
            setGeminiKey(draft);
            setDraft("");
            toast.success("Chave salva neste celular");
          }}
        >
          Salvar
        </Button>
        {saved ? (
          <Button
            variant="ghost"
            className="text-danger"
            onClick={() => {
              setGeminiKey("");
              setDraft("");
              toast.success("Chave apagada");
            }}
          >
            Apagar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
