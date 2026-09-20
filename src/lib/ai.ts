import { createServerFn } from "@tanstack/react-start";
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

function serverGeminiKey() {
  return readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
}

export const extractDocument = createServerFn({ method: "POST" })
  .validator((input: ExtractPayload) => input)
  .handler(async ({ data }) => {
    const gemini = serverGeminiKey();
    if (!gemini) {
      return { ok: false as const, error: "A chave do Gemini ainda não foi configurada no servidor." };
    }
    return extractWithGemini({ ...data, apiKey: gemini });
  });

export const adviseSpending = createServerFn({ method: "POST" })
  .validator((input: AdvicePayload) => input)
  .handler(async ({ data }) => {
    const gemini = serverGeminiKey();
    if (!gemini) {
      return { ok: false as const, error: "A chave do Gemini ainda não foi configurada no servidor." };
    }
    return adviseWithGemini({ ...data, apiKey: gemini });
  });

export const askFinancialQuestion = createServerFn({ method: "POST" })
  .validator((input: FinancialChatPayload) => input)
  .handler(async ({ data }) => {
    const gemini = serverGeminiKey();
    if (!gemini) {
      return { ok: false as const, error: "A chave do Gemini ainda não foi configurada no servidor." };
    }
    return askFinancialQuestionWithGemini({ ...data, apiKey: gemini });
  });

export const analyzeTransaction = createServerFn({ method: "POST" })
  .validator((input: TransactionInsightPayload) => input)
  .handler(async ({ data }) => {
    const gemini = serverGeminiKey();
    if (!gemini) {
      return { ok: false as const, error: "A chave do Gemini ainda não foi configurada no servidor." };
    }
    return analyzeTransactionWithGemini({ ...data, apiKey: gemini });
  });
