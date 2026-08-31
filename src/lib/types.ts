export type PersonColor = "p1" | "p2" | "p3" | "p4" | "p5";

export type PersonRole = "you" | "partner" | "child" | "parent" | "other";

export type Person = {
  id: string;
  name: string;
  role: PersonRole;
  color: PersonColor;
  monthlyBudget: number | null;
};

export type CategoryId =
  | "alimentacao"
  | "mercado"
  | "transporte"
  | "moradia"
  | "saude"
  | "educacao"
  | "lazer"
  | "assinaturas"
  | "vestuario"
  | "pets"
  | "viagem"
  | "contas"
  | "salario"
  | "outros";

export type TxType = "expense" | "income";
export type TxStatus = "posted" | "scheduled";
export type TxSource = "manual" | "photo" | "pdf" | "sheet" | "seed";
export type InstallmentKind = "card" | "loan" | "other";

export type SplitShare = {
  personId: string;
  share: number;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  type: TxType;
  status: TxStatus;
  category: CategoryId;
  personId: string;
  split: SplitShare[] | null;
  installmentId: string | null;
  installmentIndex: number | null;
  installmentTotal: number | null;
  source: TxSource;
  createdAt: string;
};

export type InstallmentPlan = {
  id: string;
  title: string;
  merchant: string;
  kind: InstallmentKind;
  installmentAmount: number;
  totalCount: number;
  startDate: string;
  personId: string;
  category: CategoryId;
  account: string;
};

export type CategoryBudget = {
  category: CategoryId;
  monthlyLimit: number;
};

export type AdviceItem = {
  id: string;
  title: string;
  body: string;
  impact: number;
  category: CategoryId | null;
  severity: "high" | "medium" | "low";
};

export type AdviceCache = {
  monthKey: string;
  generatedAt: string;
  summary: string;
  items: AdviceItem[];
};

export type ExtractedItem = {
  id: string;
  description: string;
  merchant: string;
  amount: number;
  date: string;
  type: TxType;
  category: CategoryId;
  personId: string;
  selected: boolean;
  installment: {
    current: number;
    total: number;
    kind: InstallmentKind;
  } | null;
};

export type FinanceState = {
  householdName: string;
  people: Person[];
  transactions: Transaction[];
  plans: InstallmentPlan[];
  budgets: CategoryBudget[];
  advice: AdviceCache | null;
  demo: boolean;
};
