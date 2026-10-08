import { createServerFn } from "@tanstack/react-start";
import { getToken } from "@vercel/connect";
import { z } from "zod";
import { aiAccessMiddleware } from "./ai-access-middleware";
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

const GEMINI_CONNECTORS = ["generativelanguage.googleapis.com/nucleo-financas1"];

type GeminiCredential = { apiKey: string } | { error: string };

async function serverGeminiCredential(): Promise<GeminiCredential> {
  const environmentKey = readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
  if (environmentKey) return { apiKey: environmentKey };

  const configuredConnector = readEnv("GEMINI_CONNECTOR_ID");
  const connectors = [...new Set([configuredConnector, ...GEMINI_CONNECTORS].filter(Boolean))];
  let lastError: unknown;

  for (const connector of connectors) {
    try {
      const apiKey = (await getToken(connector, { subject: { type: "app" } })).trim();

      if (apiKey) return { apiKey };
    } catch (error) {
      lastError = error;
    }
  }

  console.error("Não foi possível obter a credencial do Gemini pelo Vercel Connect.", lastError);

  return {
    error:
      "A conexão nucleo-financas1 do Gemini não liberou a credencial. Confira a conexão no projeto da Vercel e tente novamente.",
  };
}

const shortText = (max: number) => z.string().max(max);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const txType = z.enum(["expense", "income"]);
const txNature = z.enum(["budget", "transfer", "investment", "card_payment", "financing", "neutral"]);
const money = z.number().finite();
const boundedJson = (maxChars: number) =>
  z.unknown().refine((value) => JSON.stringify(value ?? null).length <= maxChars, {
    message: "Contexto grande demais.",
  });

const extractSchema = z.object({
  text: shortText(250_000).optional(),
  images: z
    .array(z.object({ mime: shortText(40), base64: shortText(6_000_000) }))
    .max(6)
    .optional(),
  people: z.array(z.object({ id: shortText(80), name: shortText(120), role: shortText(20) })).max(30),
  defaultPersonId: shortText(80),
  today: isoDay,
});

const adviceSchema = z.object({
  monthKey: shortText(7),
  householdName: shortText(120),
  people: z.array(z.object({ name: shortText(120), spent: money })).max(30),
  totals: z.object({ income: money, expense: money, balance: money }),
  previous: z.object({ expense: money }).optional(),
  categories: z.array(z.object({ label: shortText(80), used: money, limit: money })).max(300),
  subscriptions: z.array(z.object({ name: shortText(160), amount: money })).max(300),
  installments: z
    .array(z.object({ title: shortText(160), remaining: money, amount: money }))
    .max(500),
  merchants: z.array(z.object({ name: shortText(160), amount: money, count: money })).max(300),
});

const chatSchema = z.object({
  question: shortText(4000),
  context: boundedJson(250_000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: shortText(8000) }))
    .max(30)
    .optional(),
});

const insightSchema = z.object({
  transaction: z.object({
    merchant: shortText(400),
    description: shortText(1000),
    amount: money,
    date: shortText(10),
    type: txType,
    nature: txNature,
    category: shortText(60),
    originLabel: shortText(120).optional(),
    originInstitution: shortText(120).optional(),
    originKind: shortText(40).optional(),
    paymentMethod: shortText(80).optional(),
    installmentIndex: z.number().nullable().optional(),
    installmentTotal: z.number().nullable().optional(),
  }),
  similarTransactions: z
    .array(
      z.object({
        merchant: shortText(200),
        amount: money,
        date: shortText(10),
        type: txType,
        nature: txNature,
        category: shortText(60),
      }),
    )
    .max(30),
  categories: z
    .array(z.object({ id: shortText(60), label: shortText(80), group: z.enum(["gasto", "entrada"]) }))
    .max(300),
});

export const extractDocument = createServerFn({ method: "POST" })
  .middleware([aiAccessMiddleware])
  .validator((input: Omit<ExtractPayload, "apiKey">) => extractSchema.parse(input) as ExtractPayload)
  .handler(async ({ data, context }) => {
    if (context.accessError) return { ok: false as const, error: context.accessError };
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return extractWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const adviseSpending = createServerFn({ method: "POST" })
  .middleware([aiAccessMiddleware])
  .validator((input: Omit<AdvicePayload, "apiKey">) => adviceSchema.parse(input) as AdvicePayload)
  .handler(async ({ data, context }) => {
    if (context.accessError) return { ok: false as const, error: context.accessError };
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return adviseWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const askFinancialQuestion = createServerFn({ method: "POST" })
  .middleware([aiAccessMiddleware])
  .validator(
    (input: Omit<FinancialChatPayload, "apiKey">) => chatSchema.parse(input) as FinancialChatPayload,
  )
  .handler(async ({ data, context }) => {
    if (context.accessError) return { ok: false as const, error: context.accessError };
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return askFinancialQuestionWithGemini({ ...data, apiKey: credential.apiKey });
  });

export const analyzeTransaction = createServerFn({ method: "POST" })
  .middleware([aiAccessMiddleware])
  .validator(
    (input: Omit<TransactionInsightPayload, "apiKey">) =>
      insightSchema.parse(input) as TransactionInsightPayload,
  )
  .handler(async ({ data, context }) => {
    if (context.accessError) return { ok: false as const, error: context.accessError };
    const credential = await serverGeminiCredential();
    if ("error" in credential) return { ok: false as const, error: credential.error };
    return analyzeTransactionWithGemini({ ...data, apiKey: credential.apiKey });
  });
