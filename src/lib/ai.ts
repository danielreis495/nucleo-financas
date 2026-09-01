import { createServerFn } from "@tanstack/react-start";
import { adviseWithGemini, extractWithGemini, type AdvicePayload, type ExtractPayload } from "./gemini";

function readEnv(name: string) {
  try {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return String(g.process?.env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

function geminiFrom(data: { apiKey?: string }) {
  return (data.apiKey ?? "").trim() || readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
}

export const extractDocument = createServerFn({ method: "POST" })
  .validator((input: ExtractPayload) => input)
  .handler(async ({ data }) => {
    const gemini = geminiFrom(data);
    if (!gemini) {
      return { ok: false as const, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };
    }
    return extractWithGemini({ ...data, apiKey: gemini });
  });

export const adviseSpending = createServerFn({ method: "POST" })
  .validator((input: AdvicePayload) => input)
  .handler(async ({ data }) => {
    const gemini = geminiFrom(data);
    if (!gemini) {
      return { ok: false as const, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };
    }
    return adviseWithGemini({ ...data, apiKey: gemini });
  });
