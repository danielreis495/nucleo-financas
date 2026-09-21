import { createServerFn } from "@tanstack/react-start";
import { getToken } from "@vercel/connect";
import {
  adviseWithGemini,
  analyzeTransactionWithGemini,
  askFinancialQuestionWithGemini,
  extractWithGemini,
  type AdvicePayload,
  type ExtractPayload,
  type FinancialChatPayload,
  type TransactionInsightPayload,
} from "./gemini";

function readEnv(name: string) {
  try {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return String(g.process?.env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

const GEMINI_CONNECTOR_ID = "scl_motKP13qnaNp1reL9Zqovg";

type GeminiCredential = { apiKey: string } | { error: string };

async function serverGeminiCredential(): Promise<GeminiCredential> {
  const environmentKey = readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
  if (environmentKey) return { apiKey: environmentKey };

  try {
    const apiKey = (
      await getToken(readEnv("GEMINI_CONNECTOR_ID") || GEMINI_CONNECTOR_ID, {
        subject: { type: "app" },
      })
    ).trim();

    if (apiKey) return { apiKey };
  } catch (error) {
    console.error("Não foi possível obter a credencial do Gemini pelo Vercel Connect.", error);
  }

  return {
    error:
      "A conexão crimson-ribbon do Gemini não liberou a credencial. Confira a conexão no projeto da Vercel e tente novamente.",
  };
}

export const extractDocument = createServerFn({ method: "POST" })
  .validator((input: ExtractPayload) => input)
  .handler(async ({ data }) => {
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return extractWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const adviseSpending = createServerFn({ method: "POST" })
  .validator((input: AdvicePayload) => input)
  .handler(async ({ data }) => {
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return adviseWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const askFinancialQuestion = createServerFn({ method: "POST" })
  .validator((input: FinancialChatPayload) => input)
  .handler(async ({ data }) => {
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return askFinancialQuestionWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const analyzeTransaction = createServerFn({ method: "POST" })
  .validator((input: TransactionInsightPayload) => input)
  .handler(async ({ data }) => {
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return analyzeTransactionWithGemini({ ...data, apiKey: credential.apiKey });
  });
