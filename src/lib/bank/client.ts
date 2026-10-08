/**
 * Lado do app: busca o retrato do Open Finance, converte e entrega ao store.
 * O estado da conexão fica num store próprio (não persistido).
 */
import { create } from "zustand";
import { useFinanceStore } from "../store";
import { bankLogin, loadBankSnapshot, saveBankEdit, syncBankNow } from "./api";
import { buildBankState, connectedInstitutions, merchantKey, BANK_TX_PREFIX } from "./mapper";
import type { BankEditInput, BankSnapshot, BankSyncInfo } from "./types";

export type BankPhase = "idle" | "loading" | "syncing" | "ready" | "login" | "setup" | "error";

type BankStatus = {
  phase: BankPhase;
  error: string | null;
  syncErrors: string[];
  institutions: string[];
  lastSync: BankSyncInfo | null;
  lastSuccessAt: string | null;
};

export const useBankStatus = create<BankStatus>(() => ({
  phase: "idle",
  error: null,
  syncErrors: [],
  institutions: [],
  lastSync: null,
  lastSuccessAt: null,
}));

let inFlight: Promise<void> | null = null;

function apply(snapshot: BankSnapshot) {
  const finance = useFinanceStore.getState();
  const bankState = buildBankState(snapshot, finance.people);
  // Sem nenhuma conta vinda do banco (ex.: PLUGGY_ITEMS ainda não configurado), não trata
  // como primeira conexão: apagar o histórico local aqui deixaria o app vazio.
  const empty = bankState.accounts.length === 0 && bankState.transactions.length === 0;
  if (!finance.bankBootstrapped && empty) {
    useBankStatus.setState({
      institutions: [],
      lastSync: snapshot.lastSync,
      lastSuccessAt: snapshot.lastSuccessAt,
    });
    return;
  }
  // Primeira conexão com o banco: começa do zero (pedido do casal) e some a casa de exemplo.
  if (finance.demo) finance.clearAll();
  const people = useFinanceStore.getState().people;
  useFinanceStore.getState().applyBankSnapshot(buildBankState(snapshot, people));
  useBankStatus.setState({
    institutions: connectedInstitutions(snapshot),
    lastSync: snapshot.lastSync,
    lastSuccessAt: snapshot.lastSuccessAt,
  });
}

type Outcome = Awaited<ReturnType<typeof loadBankSnapshot>>;

function handle(result: Outcome) {
  if (result.ok) {
    apply(result.snapshot);
    useBankStatus.setState({
      phase: "ready",
      error: null,
      syncErrors: result.sync && !result.sync.ok ? result.sync.errors : [],
    });
    return;
  }
  useBankStatus.setState({
    phase: result.setupMissing ? "setup" : result.needsLogin ? "login" : "error",
    error: result.error,
  });
}

/** Carrega os dados do servidor. `force` busca no banco agora, mesmo que tenha sincronizado há pouco. */
export function refreshBank(options: { force?: boolean } = {}) {
  if (inFlight) return inFlight;
  const current = useBankStatus.getState().phase;
  useBankStatus.setState({
    phase: options.force ? "syncing" : current === "ready" ? "ready" : "loading",
  });
  inFlight = (async () => {
    try {
      const result = options.force
        ? await syncBankNow()
        : await loadBankSnapshot({ data: { autoSync: true } });
      handle(result);
    } catch (error) {
      useBankStatus.setState({
        phase: "error",
        error: error instanceof Error ? error.message : "Sem conexão com o servidor.",
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function loginToBank(password: string) {
  const result = await bankLogin({ data: { password } });
  if (!result.ok) {
    if (result.setupMissing) useBankStatus.setState({ phase: "setup", error: result.error });
    return result.error;
  }
  await refreshBank();
  return null;
}

/**
 * Guarda no servidor um ajuste feito num movimento do banco. Ao mudar a categoria,
 * as próximas compras do mesmo estabelecimento passam a vir com ela.
 */
export async function persistBankEdit(
  transactionId: string,
  merchant: string,
  edit: Omit<BankEditInput, "txId" | "merchantKey">,
) {
  if (!transactionId.startsWith(BANK_TX_PREFIX)) return;
  const txId = transactionId.slice(BANK_TX_PREFIX.length);
  const result = await saveBankEdit({
    data: {
      txId,
      ...edit,
      merchantKey: edit.category ? merchantKey(merchant) : undefined,
    },
  });
  if (result.ok && edit.category) await refreshBank();
  return result;
}
