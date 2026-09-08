const STORAGE_KEY = "nucleo-merchant-aliases-v1";

type MerchantAliasMap = Record<string, string>;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAliases(): MerchantAliasMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as MerchantAliasMap;
  } catch {
    return {};
  }
}

function writeAliases(aliases: MerchantAliasMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

export function merchantAliasFor(sourceName: string) {
  const key = normalize(sourceName);
  if (!key) return null;
  const aliases = readAliases();
  const value = aliases[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function applyMerchantAlias(sourceName: string) {
  return merchantAliasFor(sourceName) ?? sourceName;
}

export function rememberMerchantAlias(sourceName: string, preferredName: string) {
  const key = normalize(sourceName);
  const preferred = preferredName.trim();
  if (!key || !preferred) return;

  const aliases = readAliases();
  if (normalize(sourceName) === normalize(preferred)) {
    delete aliases[key];
  } else {
    aliases[key] = preferred;
  }
  writeAliases(aliases);
}
