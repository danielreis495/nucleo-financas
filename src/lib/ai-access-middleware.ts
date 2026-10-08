import { createMiddleware } from "@tanstack/react-start";
import { readAccessCode } from "./access-code";

/**
 * Protege as funções que usam a cota do Gemini:
 * - no cliente, envia o código de acesso guardado neste aparelho;
 * - no servidor, bloqueia chamadas de outros sites e confere o código com
 *   NUCLEO_ACCESS_CODE. O resultado vai em `context.accessError` para que cada
 *   função responda com uma mensagem amigável em vez de estourar uma exceção.
 */
export const aiAccessMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next({ sendContext: { accessCode: readAccessCode() } }))
  .server(async ({ next, context }) => {
    // Somente módulos `.server` aqui (mesma regra de auth/middleware.ts).
    const { assertSameSiteRequest } = await import("./auth/isolation.server");
    const { accessCodeError } = await import("./access-code.server");
    assertSameSiteRequest();
    const accessError = accessCodeError(context.accessCode);
    return next({ context: { accessError } });
  });
