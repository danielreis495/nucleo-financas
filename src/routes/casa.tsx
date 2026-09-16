import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, Database, Plus, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import { PersonAvatar, personColorClass } from "@/components/person-avatar";
import { AccountsCard } from "@/components/accounts-card";
import { CardsOverviewCard } from "@/components/cards-overview-card";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/lib/document-store";
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
const IMPORT_FINGERPRINTS_KEY = "nucleo-import-fingerprints-v1";
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
    const state = { ...parsed.state };
    delete state.geminiKey;
    const backup: BackupFile = {
      app: "nucleo-financas",
      backupVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      data: { ...parsed, state },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
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
      const restored = {
        ...backup.data,
        state: { ...state, geminiKey: currentGeminiKey },
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
  const clearFinancialHistory = useFinanceStore((s) => s.clearFinancialHistory);
  const reclassifyMovements = useFinanceStore((s) => s.reclassifyMovements);
  const clearSummaries = useDocumentStore((s) => s.clearSummaries);

  const [name, setName] = useState("");
  const [role, setRole] = useState<PersonRole>("partner");
  const [color, setColor] = useState<PersonColor>("p2");
  const [addingPerson, setAddingPerson] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);

  return (
    <main className="flex flex-col px-5 pb-8 pt-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Configurações</p>
        <h1 className="font-display text-3xl tracking-tight">Sua casa financeira</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Organize quem participa, quais contas você acompanha e como o Núcleo trabalha com seus dados.
        </p>
      </div>

      <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Nome da casa</p>
        <input
          value={state.householdName}
          onChange={(event) => setHouseholdName(event.target.value)}
          className="mt-1 w-full bg-transparent font-display text-2xl tracking-tight outline-none"
          aria-label="Nome da casa"
        />
        <p className="mt-1 text-xs text-muted">Toque no nome para editar.</p>
      </section>

      <AccountsCard />

      <CardsOverviewCard />

      <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pessoas</p>
            <h2 className="font-display text-xl">Quem participa da casa</h2>
          </div>
          <button
            type="button"
            aria-label="Adicionar pessoa"
            onClick={() => setAddingPerson((value) => !value)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"
          >
            <Plus className={cn("size-4 transition-transform", addingPerson && "rotate-45")} />
          </button>
        </div>

        <div className="mt-3 divide-y divide-line rounded-xl bg-surface px-3 shadow-[var(--shadow-border)]">
          {spent.map(({ person, amount }) => (
            <div key={person.id} className="py-3">
              <div className="flex items-center gap-3">
                <PersonAvatar person={person} size="lg" />
                <div className="min-w-0 flex-1">
                  <input
                    value={person.name}
                    onChange={(event) => updatePerson(person.id, { name: event.target.value })}
                    className="w-full bg-transparent text-sm font-medium outline-none"
                  />
                  <p className="text-[11px] text-muted">
                    {ROLES.find((item) => item.id === person.role)?.label} · {formatBRL(amount)} este mês
                  </p>
                </div>
                {state.people.length > 1 ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-danger"
                    onClick={() => removePerson(person.id)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>

              <details className="mt-2 pl-13">
                <summary className="cursor-pointer text-[10px] font-medium text-muted">Limite pessoal</summary>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {[null, 400, 800, 1500, 2500, 4000].map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => updatePerson(person.id, { monthlyBudget: value })}
                      className={cn(
                        "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
                        person.monthlyBudget === value ? "bg-primary text-primary-fg" : "bg-line",
                      )}
                    >
                      {value === null ? "Sem teto" : formatBRLCompact(value)}
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
              </details>
            </div>
          ))}
        </div>

        {addingPerson ? (
          <div className="mt-3 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
            <p className="text-sm font-medium">Nova pessoa</p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome"
              className="mt-3 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
            />
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {ROLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(item.id)}
                  className={cn(
                    "h-8 shrink-0 rounded-full px-3 text-xs font-medium",
                    role === item.id ? "bg-primary text-primary-fg" : "bg-line",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Cor ${item}`}
                  onClick={() => setColor(item)}
                  className={cn(
                    "size-8 rounded-full",
                    personColorClass(item),
                    color === item ? "outline-2 outline-offset-2 outline-fg" : "",
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
                setAddingPerson(false);
                toast.success("Pessoa adicionada");
              }}
            >
              Adicionar pessoa
            </Button>
          </div>
        ) : null}
      </section>

      <GeminiKeyCard />

      <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Seus dados</p>
            <h2 className="font-display text-xl">Backup e restauração</h2>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Os dados financeiros ficam neste aparelho. Faça um backup antes de trocar de celular ou fazer mudanças importantes.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={downloadBackup}>Fazer backup</Button>
          <Button variant="secondary" onClick={() => restoreInput.current?.click()}>Restaurar</Button>
        </div>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) restoreBackup(file, state.geminiKey);
          }}
        />
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          A chave do Gemini nunca entra no arquivo de backup.
        </p>
      </section>

      <details className="group mt-4 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Wrench className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Manutenção dos dados</span>
              <span className="block text-xs text-muted">Reclassificar ou reimportar movimentos</span>
            </span>
          </span>
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-xs leading-relaxed text-muted">
            Use estas opções somente quando transferências, aplicações, resgates ou pagamentos de fatura precisarem ser revistos.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                reclassifyMovements();
                toast.success("Movimentações revisadas");
              }}
            >
              Reclassificar histórico atual
            </Button>
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() => {
                const ok = window.confirm(
                  "Apagar lançamentos, parcelamentos, saldos/faturas lidos e histórico de arquivos para reimportar? Pessoas, contas, categorias e chave do Gemini serão mantidas.",
                );
                if (!ok) return;
                clearFinancialHistory();
                clearSummaries();
                localStorage.removeItem(IMPORT_FINGERPRINTS_KEY);
                toast.success("Importações financeiras zeradas. Você já pode reenviar os arquivos.");
              }}
            >
              Limpar histórico para reimportar
            </Button>
          </div>
        </div>
      </details>

      <details className="group mt-3 rounded-xl bg-elevated shadow-[var(--shadow-border)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Database className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Opções avançadas</span>
              <span className="block text-xs text-muted">Exemplo e limpeza completa</span>
            </span>
          </span>
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="flex flex-col gap-2">
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
                const ok = window.confirm("Apagar todos os dados desta casa e começar do zero?");
                if (!ok) return;
                clearAll();
                clearSummaries();
                localStorage.removeItem(IMPORT_FINGERPRINTS_KEY);
                toast.success("Casa zerada");
              }}
            >
              Começar do zero
            </Button>
          </div>
        </div>
      </details>
    </main>
  );
}

function GeminiKeyCard() {
  const saved = useFinanceStore((s) => s.geminiKey);
  const setGeminiKey = useFinanceStore((s) => s.setGeminiKey);
  const [draft, setDraft] = useState("");
  const tail = saved.length > 6 ? saved.slice(-4) : "";

  return (
    <section className="mt-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Núcleo IA</p>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">Conversa com IA</h2>
            <span className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
              saved ? "bg-primary-soft text-primary" : "bg-line text-muted",
            )}>
              {saved ? "Ativa" : "Opcional"}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        O Núcleo funciona normalmente sem chave. Ela só libera a conversa livre com seus dados e interpretações que precisem do Gemini.
      </p>

      {saved ? (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2.5 text-primary">
          <div>
            <p className="text-xs font-medium">Gemini conectado</p>
            <p className="text-[10px] text-primary/75">Chave termina em {tail}</p>
          </div>
          <Link to="/conselhos" className="text-xs font-medium">Abrir Núcleo</Link>
        </div>
      ) : null}

      <details className="group mt-3 rounded-xl bg-surface shadow-[var(--shadow-border)]" open={!saved}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium">
          {saved ? "Alterar configuração da IA" : "Ativar conversa com IA"}
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-3 pb-3 pt-3">
          <p className="text-xs leading-relaxed text-muted">
            Crie uma chave no Google AI Studio e cole somente neste aparelho.
          </p>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-medium text-primary underline underline-offset-2"
          >
            Abrir Google AI Studio
          </a>
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="AIza…"
            className="mt-3 h-11 w-full rounded-xl bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:outline-2 focus:outline-primary"
          />
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              disabled={!draft.trim()}
              onClick={() => {
                setGeminiKey(draft.trim());
                setDraft("");
                toast.success("Conversa com IA ativada neste aparelho");
              }}
            >
              {saved ? "Trocar chave" : "Ativar"}
            </Button>
            {saved ? (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  setGeminiKey("");
                  setDraft("");
                  toast.success("Conversa com IA desativada");
                }}
              >
                Desativar
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            A chave não entra no backup do Núcleo.
          </p>
        </div>
      </details>
    </section>
  );
}
