import type { CategoryId } from "./types";

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  group: "gasto" | "entrada";
}[] = [
  { id: "mercado", label: "Mercado", group: "gasto" },
  { id: "alimentacao", label: "Alimentação", group: "gasto" },
  { id: "transporte", label: "Transporte", group: "gasto" },
  { id: "moradia", label: "Moradia", group: "gasto" },
  { id: "contas", label: "Contas", group: "gasto" },
  { id: "saude", label: "Saúde", group: "gasto" },
  { id: "educacao", label: "Educação", group: "gasto" },
  { id: "lazer", label: "Lazer", group: "gasto" },
  { id: "assinaturas", label: "Assinaturas", group: "gasto" },
  { id: "vestuario", label: "Vestuário", group: "gasto" },
  { id: "pets", label: "Pets", group: "gasto" },
  { id: "viagem", label: "Viagem", group: "gasto" },
  { id: "outros", label: "Outros", group: "gasto" },
  { id: "salario", label: "Salário", group: "entrada" },
];

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.group === "gasto");

export function categoryLabel(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const DEFAULT_BUDGETS: { category: CategoryId; monthlyLimit: number }[] = [
  { category: "mercado", monthlyLimit: 2200 },
  { category: "alimentacao", monthlyLimit: 900 },
  { category: "transporte", monthlyLimit: 700 },
  { category: "moradia", monthlyLimit: 4200 },
  { category: "contas", monthlyLimit: 500 },
  { category: "saude", monthlyLimit: 1100 },
  { category: "educacao", monthlyLimit: 1600 },
  { category: "lazer", monthlyLimit: 600 },
  { category: "assinaturas", monthlyLimit: 200 },
  { category: "vestuario", monthlyLimit: 350 },
  { category: "pets", monthlyLimit: 200 },
  { category: "viagem", monthlyLimit: 400 },
  { category: "outros", monthlyLimit: 300 },
];
