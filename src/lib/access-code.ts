/**
 * Código de acesso do Núcleo IA, guardado só neste aparelho. O servidor compara
 * com a variável NUCLEO_ACCESS_CODE antes de usar a cota do Gemini.
 */
const STORAGE_KEY = "nucleo-access-code-v1";

export function readAccessCode() {
  try {
    return typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveAccessCode(code: string) {
  try {
    const trimmed = code.trim();
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const ACCESS_CODE_MISSING_MESSAGE =
  "Informe o código de acesso do Núcleo IA em Casa → Núcleo IA para usar a leitura automática e a conversa.";
export const ACCESS_CODE_INVALID_MESSAGE =
  "Código de acesso do Núcleo IA incorreto. Confira em Casa → Núcleo IA.";
export const ACCESS_CODE_NOT_CONFIGURED_MESSAGE =
  "O Núcleo IA está bloqueado: configure a variável NUCLEO_ACCESS_CODE no projeto da Vercel.";
