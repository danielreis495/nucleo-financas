import type {
  CategoryBudget,
  FinanceState,
  InstallmentPlan,
  Person,
  Transaction,
} from "./types";
import { DEFAULT_BUDGETS } from "./categories";

const ANA = "p-ana";
const BRUNO = "p-bruno";
const SOFIA = "p-sofia";
const CASA = "p-casa";

const people: Person[] = [
  { id: ANA, name: "Ana", role: "you", color: "p1", monthlyBudget: 2500 },
  { id: BRUNO, name: "Bruno", role: "partner", color: "p2", monthlyBudget: 2800 },
  { id: SOFIA, name: "Sofia", role: "child", color: "p3", monthlyBudget: 400 },
  { id: CASA, name: "Casa", role: "other", color: "p4", monthlyBudget: null },
];

function tx(
  id: string,
  date: string,
  description: string,
  merchant: string,
  amount: number,
  category: Transaction["category"],
  personId: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date,
    description,
    merchant,
    amount,
    type: extra.type ?? "expense",
    status: extra.status ?? "posted",
    category,
    personId,
    split: extra.split ?? null,
    installmentId: extra.installmentId ?? null,
    installmentIndex: extra.installmentIndex ?? null,
    installmentTotal: extra.installmentTotal ?? null,
    source: extra.source ?? "seed",
    createdAt: `${date}T12:00:00.000Z`,
  };
}

const plans: InstallmentPlan[] = [
  {
    id: "plan-iphone",
    title: "iPhone 15",
    merchant: "Apple / Nubank",
    kind: "card",
    installmentAmount: 416.58,
    totalCount: 12,
    startDate: "2025-11-12",
    personId: ANA,
    category: "vestuario",
    account: "Nubank",
  },
  {
    id: "plan-sofa",
    title: "Sofá retrátil",
    merchant: "Madeira Madeira",
    kind: "card",
    installmentAmount: 389.0,
    totalCount: 10,
    startDate: "2026-04-08",
    personId: CASA,
    category: "moradia",
    account: "Nubank",
  },
  {
    id: "plan-emprestimo",
    title: "Empréstimo pessoal",
    merchant: "Itaú",
    kind: "loan",
    installmentAmount: 520.0,
    totalCount: 24,
    startDate: "2026-02-05",
    personId: BRUNO,
    category: "contas",
    account: "Itaú",
  },
];

function expandPlan(
  plan: InstallmentPlan,
  today: string,
): Transaction[] {
  const start = new Date(plan.startDate + "T12:00:00");
  const rows: Transaction[] = [];
  for (let i = 0; i < plan.totalCount; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const date = `${y}-${m}-${day}`;
    rows.push(
      tx(
        `${plan.id}-${i + 1}`,
        date,
        `${plan.title} ${i + 1}/${plan.totalCount}`,
        plan.merchant,
        plan.installmentAmount,
        plan.category,
        plan.personId,
        {
          installmentId: plan.id,
          installmentIndex: i + 1,
          installmentTotal: plan.totalCount,
          status: date <= today ? "posted" : "scheduled",
        },
      ),
    );
  }
  return rows;
}

const today = "2026-08-29";

const posted: Transaction[] = [
  tx("t-sal-ana-08", "2026-08-05", "Salário", "Estúdio Norte", 8400, "salario", ANA, {
    type: "income",
  }),
  tx("t-sal-bru-08", "2026-08-05", "Salário", "Atlas Eng.", 11200, "salario", BRUNO, {
    type: "income",
  }),
  tx("t-aluguel-08", "2026-08-08", "Aluguel", "Imobiliária Leme", 3200, "moradia", CASA),
  tx("t-cond-08", "2026-08-08", "Condomínio", "SíndicoNet", 680, "moradia", CASA),
  tx("t-energia-08", "2026-08-12", "Energia elétrica", "Enel", 312.4, "contas", CASA),
  tx("t-net-08", "2026-08-10", "Internet fibra", "Vivo", 129.9, "contas", CASA),
  tx("t-escola-08", "2026-08-05", "Mensalidade escolar", "Colégio São Bento", 1450, "educacao", SOFIA),
  tx("t-unimed-08", "2026-08-07", "Plano de saúde", "Unimed", 890, "saude", CASA),
  tx("t-extra-1", "2026-08-03", "Compras da semana", "Extra", 486.2, "mercado", CASA),
  tx("t-extra-2", "2026-08-10", "Compras da semana", "Extra", 512.8, "mercado", CASA),
  tx("t-extra-3", "2026-08-17", "Compras da semana", "Extra", 448.15, "mercado", CASA),
  tx("t-extra-4", "2026-08-24", "Compras da semana", "Extra", 401.7, "mercado", CASA),
  tx("t-ifood-1", "2026-08-02", "Jantar", "iFood", 86.9, "alimentacao", ANA),
  tx("t-ifood-2", "2026-08-06", "Almoço no escritório", "iFood", 42.5, "alimentacao", BRUNO),
  tx("t-ifood-3", "2026-08-09", "Pizza sexta", "iFood", 118.4, "alimentacao", CASA),
  tx("t-ifood-4", "2026-08-13", "Jantar", "iFood", 74.2, "alimentacao", ANA),
  tx("t-ifood-5", "2026-08-16", "Almoço", "iFood", 39.9, "alimentacao", BRUNO),
  tx("t-ifood-6", "2026-08-20", "Hambúrguer", "iFood", 92.3, "alimentacao", CASA),
  tx("t-ifood-7", "2026-08-23", "Jantar", "iFood", 67.8, "alimentacao", ANA),
  tx("t-ifood-8", "2026-08-27", "Açaí da Sofia", "iFood", 28.5, "alimentacao", SOFIA),
  tx("t-uber-1", "2026-08-04", "Corrida", "Uber", 32.4, "transporte", ANA),
  tx("t-uber-2", "2026-08-11", "Corrida", "Uber", 28.9, "transporte", BRUNO),
  tx("t-uber-3", "2026-08-18", "Corrida", "Uber", 41.2, "transporte", ANA),
  tx("t-uber-4", "2026-08-25", "Aeroporto", "Uber", 78.6, "transporte", BRUNO),
  tx("t-metro", "2026-08-01", "Bilhete mensal", "Top / CPTM", 278.8, "transporte", ANA),
  tx("t-netflix", "2026-08-14", "Netflix", "Netflix", 55.9, "assinaturas", CASA),
  tx("t-spotify", "2026-08-14", "Spotify família", "Spotify", 34.9, "assinaturas", CASA),
  tx("t-disney", "2026-08-16", "Disney+", "Disney", 33.9, "assinaturas", CASA),
  tx("t-max", "2026-08-19", "Max", "Max", 37.9, "assinaturas", CASA),
  tx("t-gym", "2026-08-03", "Academia", "Smart Fit", 149.9, "saude", ANA),
  tx("t-farmacia", "2026-08-21", "Farmácia", "Droga Raia", 86.4, "saude", CASA),
  tx("t-cinema", "2026-08-15", "Cinema", "Cinemark", 92.0, "lazer", CASA),
  tx("t-parque", "2026-08-22", "Parque da Sofia", "Playcenter", 180.0, "lazer", SOFIA),
  tx("t-roupa", "2026-08-09", "Roupa de cama", "Renner", 129.9, "vestuario", CASA),
  tx("t-pet", "2026-08-11", "Ração Luna", "Petz", 167.5, "pets", CASA),

  tx("t-sal-ana-07", "2026-07-05", "Salário", "Estúdio Norte", 8400, "salario", ANA, {
    type: "income",
  }),
  tx("t-sal-bru-07", "2026-07-05", "Salário", "Atlas Eng.", 11200, "salario", BRUNO, {
    type: "income",
  }),
  tx("t-aluguel-07", "2026-07-08", "Aluguel", "Imobiliária Leme", 3200, "moradia", CASA),
  tx("t-cond-07", "2026-07-08", "Condomínio", "SíndicoNet", 680, "moradia", CASA),
  tx("t-energia-07", "2026-07-12", "Energia elétrica", "Enel", 298.1, "contas", CASA),
  tx("t-net-07", "2026-07-10", "Internet fibra", "Vivo", 129.9, "contas", CASA),
  tx("t-escola-07", "2026-07-05", "Mensalidade escolar", "Colégio São Bento", 1450, "educacao", SOFIA),
  tx("t-unimed-07", "2026-07-07", "Plano de saúde", "Unimed", 890, "saude", CASA),
  tx("t-extra-j1", "2026-07-05", "Compras da semana", "Extra", 430.0, "mercado", CASA),
  tx("t-extra-j2", "2026-07-12", "Compras da semana", "Extra", 455.4, "mercado", CASA),
  tx("t-extra-j3", "2026-07-19", "Compras da semana", "Extra", 412.2, "mercado", CASA),
  tx("t-extra-j4", "2026-07-26", "Compras da semana", "Extra", 398.6, "mercado", CASA),
  tx("t-ifood-j1", "2026-07-04", "Jantar", "iFood", 54.9, "alimentacao", ANA),
  tx("t-ifood-j2", "2026-07-12", "Pizza", "iFood", 98.0, "alimentacao", CASA),
  tx("t-ifood-j3", "2026-07-21", "Almoço", "iFood", 41.2, "alimentacao", BRUNO),
  tx("t-ifood-j4", "2026-07-28", "Jantar", "iFood", 62.4, "alimentacao", ANA),
  tx("t-uber-j1", "2026-07-08", "Corrida", "Uber", 24.5, "transporte", ANA),
  tx("t-uber-j2", "2026-07-22", "Corrida", "Uber", 31.8, "transporte", BRUNO),
  tx("t-netflix-07", "2026-07-14", "Netflix", "Netflix", 55.9, "assinaturas", CASA),
  tx("t-spotify-07", "2026-07-14", "Spotify família", "Spotify", 34.9, "assinaturas", CASA),
  tx("t-disney-07", "2026-07-16", "Disney+", "Disney", 33.9, "assinaturas", CASA),
  tx("t-max-07", "2026-07-19", "Max", "Max", 37.9, "assinaturas", CASA),
  tx("t-gym-07", "2026-07-03", "Academia", "Smart Fit", 149.9, "saude", ANA),
];

export function createSeedState(): FinanceState {
  const installmentTx = plans.flatMap((p) => expandPlan(p, today));
  return {
    householdName: "Família Almeida",
    people,
    transactions: [...posted, ...installmentTx],
    plans,
    budgets: DEFAULT_BUDGETS as CategoryBudget[],
    advice: null,
    demo: true,
  };
}

export const SAMPLE_RECEIPT_EXTRACT = {
  merchant: "Padaria São João",
  items: [
    { description: "Pão na chapa e café", amount: 18.5, category: "alimentacao" as const },
    { description: "Pão francês 6un", amount: 9.6, category: "mercado" as const },
    { description: "Queijo minas", amount: 22.9, category: "mercado" as const },
  ],
};
