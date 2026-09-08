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

export function isGenericFinancialIntermediaryName(value: string) {
  const text = normalize(value);
  if (!text) return false;
  return (
    /^(?:banco )?itau(?: unibanco)?(?: holding)?(?: s a)?$/.test(text) ||
    /^itau unibanco(?: s a)?$/.test(text) ||
    /^nu pagamentos(?: s a)?$/.test(text) ||
    /^nubank(?: pagamentos)?(?: s a)?$/.test(text) ||
    /^pagseguro(?: internet)?(?: ip)?(?: s a)?$/.test(text) ||
    /^pagbank(?: banco)?(?: s a)?$/.test(text) ||
    /^banco bradesco(?: s a)?$/.test(text) ||
    /^bradesco(?: s a)?$/.test(text) ||
    /^banco santander(?: brasil)?(?: s a)?$/.test(text) ||
    /^santander(?: brasil)?(?: s a)?$/.test(text) ||
    /^banco do brasil(?: s a)?$/.test(text) ||
    /^caixa economica federal$/.test(text) ||
    /^banco inter(?: s a)?$/.test(text) ||
    /^inter(?: pagamentos)?(?: s a)?$/.test(text) ||
    /^c6 bank(?: s a)?$/.test(text) ||
    /^mercado pago(?: instituicao de pagamento)?(?: ltda)?$/.test(text) ||
    /^picpay(?: instituicao de pagamento)?(?: s a)?$/.test(text) ||
    /^stone instituicao de pagamento(?: s a)?$/.test(text)
  );
}

function readAliases(): MerchantAliasMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const aliases = parsed as MerchantAliasMap;

    // Bancos e PSPs aparecem como intermediários de muitos fornecedores diferentes.
    // Um apelido aprendido para "Itaú"/"PagSeguro" não pode contaminar todos os Pix.
    let changed = false;
    for (const key of Object.keys(aliases)) {
      if (!isGenericFinancialIntermediaryName(key)) continue;
      delete aliases[key];
      changed = true;
    }
    if (changed) writeAliases(aliases);
    return aliases;
  } catch {
    return {};
  }
}

function writeAliases(aliases: MerchantAliasMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

export function merchantAliasFor(sourceName: string) {
  if (isGenericFinancialIntermediaryName(sourceName)) return null;
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
  if (isGenericFinancialIntermediaryName(sourceName)) return;
  const key = normalize(sourceName);
  const sourceNormalized = normalize(sourceName);
  const preferred = preferredName.trim();
  const preferredNormalized = normalize(preferred);
  if (!key || !preferredNormalized) return;

  const aliases = readAliases();

  // Se o usuário está renomeando um nome que já era um apelido aprendido,
  // atualiza também as origens que apontavam para ele.
  for (const [aliasKey, value] of Object.entries(aliases)) {
    if (normalize(value) === sourceNormalized) aliases[aliasKey] = preferred;
  }

  if (sourceNormalized === preferredNormalized) {
    delete aliases[key];
  } else {
    aliases[key] = preferred;
  }
  writeAliases(aliases);
}
