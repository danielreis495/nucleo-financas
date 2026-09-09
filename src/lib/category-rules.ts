import type { CategoryId, ExtractedItem } from "./types";

const STORAGE_KEY = "nucleo-category-rules-v1";

type CategoryRuleMap = Record<string, CategoryId>;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eligibleMerchant(name: string) {
  const key = normalize(name);
  if (!key || key.length < 3) return false;
  if (key === "comercio" || key === "lancamento" || key === "favorecido nao identificado") return false;
  return true;
}

function readRules(): CategoryRuleMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CategoryRuleMap;
  } catch {
    return {};
  }
}

function writeRules(rules: CategoryRuleMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function categoryRuleFor(merchant: string) {
  if (!eligibleMerchant(merchant)) return null;
  const value = readRules()[normalize(merchant)];
  return typeof value === "string" && value ? value : null;
}

export function rememberCategoryRule(merchant: string, category: CategoryId) {
  if (!eligibleMerchant(merchant) || !category) return;
  const rules = readRules();
  rules[normalize(merchant)] = category;
  writeRules(rules);
}

export function applyCategoryRules(items: ExtractedItem[]) {
  return items.map((item) => {
    if ((item.nature ?? "budget") !== "budget") return item;
    const learned = categoryRuleFor(item.merchant);
    return learned ? { ...item, category: learned } : item;
  });
}
