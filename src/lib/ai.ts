import { createServerFn } from "@tanstack/react-start";
import { CATEGORIES } from "./categories";
import type { AdviceItem, CategoryId, ExtractedItem, InstallmentKind, TxType } from "./types";
import { uid } from "./utils";

const GROK_MODEL = "grok-4.5";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id).join(", ");

type ImagePart = { mime: string; base64: string };

type ExtractPayload = {
  text?: string;
  images?: ImagePart[];
  people: { id: string; name: string; role: string }[];
  defaultPersonId: string;
  today: string;
  apiKey?: string;
};

type AdvicePayload = {
  monthKey: string;
  householdName: string;
  people: { name: string; spent: number }[];
  totals: { income: number; expense: number; balance: number };
  previous?: { expense: number };
  categories: { label: string; used: number; limit: number }[];
  subscriptions: { name: string; amount: number }[];
  installments: { title: string; remaining: number; amount: number }[];
  merchants: { name: string; amount: number; count: number }[];
  apiKey?: string;
};

type ChatInput = {
  system: string;
  text: string;
  images?: ImagePart[];
  maxTokens: number;
  apiKey?: string;
};

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Resposta sem JSON");
  return JSON.parse(body.slice(start, end + 1));
}

function readEnv(name: string) {
  try {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return String(g.process?.env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

async function geminiChat(apiKey: string, input: ChatInput) {
  const parts: Record<string, unknown>[] = [{ text: input.text }];
  for (const img of input.images ?? []) {
    parts.push({
      inline_data: {
        mime_type: img.mime,
        data: img.base64,
      },
    });
  }

  const payload = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: input.maxTokens,
      responseMimeType: "application/json",
    },
  };

  let lastStatus = 0;
  let lastBody = "";
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );
    lastStatus = res.status;
    if (res.status === 404) continue;
    if (!res.ok) {
      lastBody = await res.text().catch(() => "");
      if (res.status === 400 || res.status === 403) {
        return {
          ok: false as const,
          error: "Chave do Gemini recusada. Cole de novo em Casa, sem aspas nem espaço.",
        };
      }
      return { ok: false as const, error: `Não consegui ler o documento (${res.status}).` };
    }
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { ok: true as const, text };
  }

  return {
    ok: false as const,
    error: lastBody
      ? `Não consegui ler o documento (${lastStatus}).`
      : `Não consegui ler o documento (${lastStatus}).`,
  };
}

async function grokChat(apiKey: string, input: ChatInput) {
  const userContent: unknown[] = [{ type: "text", text: input.text }];
  for (const img of input.images ?? []) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      temperature: 0.2,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    return { ok: false as const, error: `Não consegui ler o documento (${res.status}).` };
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  return { ok: true as const, text };
}

async function llmChat(input: ChatInput) {
  const gemini = (input.apiKey ?? "").trim() || readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
  if (gemini) return geminiChat(gemini, input);
  const xai = readEnv("XAI_API_KEY");
  if (xai) return grokChat(xai, input);
  return {
    ok: false as const,
    error: "Cole a chave do Gemini em Casa (abaixo das pessoas).",
  };
}

function asCategory(value: unknown): CategoryId {
  const id = String(value ?? "outros");
  return CATEGORIES.some((c) => c.id === id) ? (id as CategoryId) : "outros";
}

function asType(value: unknown): TxType {
  return value === "income" ? "income" : "expense";
}

function asKind(value: unknown): InstallmentKind {
  if (value === "loan" || value === "card") return value;
  return "other";
}

export const extractDocument = createServerFn({ method: "POST" })
  .validator((input: ExtractPayload) => input)
  .handler(async ({ data }) => {
    const peopleList = data.people.map((p) => `${p.name} (${p.id}, ${p.role})`).join("; ");
    const system = `Você extrai lançamentos financeiros de comprovantes brasileiros (notas, faturas de cartão, boletos, extratos, planilhas).
Responda APENAS um JSON válido, sem markdown:
{
  "items": [
    {
      "description": "string curta",
      "merchant": "string",
      "amount": number,
      "date": "YYYY-MM-DD",
      "type": "expense" | "income",
      "category": one of [${CATEGORY_IDS}],
      "personId": "id da pessoa ou ${data.defaultPersonId}",
      "installment": null | { "current": number, "total": number, "kind": "card" | "loan" | "other" }
    }
  ]
}
Regras:
- Valores em reais, ponto decimal.
- Junte itens miúdos de uma mesma nota em 1 lançamento, a menos que sejam categorias diferentes.
- Detecte parcelas no formato 3/12, 10x, "em 12 vezes". amount é o valor DA PARCELA, não o total.
- Fatura de cartão: um item por compra, ignore totais e pagamentos da fatura.
- Ignore taxas de juros como lançamento separado se já estiverem no valor da parcela.
- personId só se o nome da pessoa aparecer; senão use ${data.defaultPersonId}.
- Data de hoje: ${data.today}. Se a data não aparecer, use hoje.
- Pessoas da casa: ${peopleList}
- No máximo 40 itens, os mais relevantes.`;

    const text = data.text
      ? `Documento / planilha:\n${data.text.slice(0, 18000)}`
      : "Extraia os lançamentos destas imagens.";

    const result = await llmChat({
      system,
      text,
      images: data.images,
      maxTokens: 2200,
      apiKey: data.apiKey,
    });

    if (!result.ok) return result;

    try {
      const parsed = parseJsonObject(result.text) as { items?: unknown[] };
      const items: ExtractedItem[] = (parsed.items ?? []).slice(0, 40).map((raw) => {
        const row = (raw ?? {}) as Record<string, unknown>;
        const inst = row.installment as Record<string, unknown> | null;
        return {
          id: uid(),
          description: String(row.description ?? row.merchant ?? "Lançamento"),
          merchant: String(row.merchant ?? row.description ?? "Comércio"),
          amount: Math.abs(Number(row.amount) || 0),
          date: String(row.date ?? data.today).slice(0, 10),
          type: asType(row.type),
          category: asCategory(row.category),
          personId: data.people.some((p) => p.id === row.personId)
            ? String(row.personId)
            : data.defaultPersonId,
          selected: true,
          installment:
            inst && Number(inst.total) > 1
              ? {
                  current: Math.max(1, Number(inst.current) || 1),
                  total: Math.max(2, Number(inst.total) || 2),
                  kind: asKind(inst.kind),
                }
              : null,
        };
      });
      return { ok: true as const, items };
    } catch {
      return { ok: false as const, error: "Não entendi o documento. Tente outra foto ou um PDF mais nítido." };
    }
  });

export const adviseSpending = createServerFn({ method: "POST" })
  .validator((input: AdvicePayload) => input)
  .handler(async ({ data }) => {
    const { apiKey, ...facts } = data;
    const system = `Você é um conselheiro financeiro direto, em português do Brasil, para um orçamento doméstico.
Sem moralismo, sem enrolação. Foque em cortes concretos e no peso das parcelas.
Responda APENAS JSON:
{
  "summary": "2 frases, tom calmo",
  "items": [
    {
      "title": "até 42 caracteres",
      "body": "1-2 frases com número em R$",
      "impact": number (economia mensal estimada),
      "category": one of [${CATEGORY_IDS}] | null,
      "severity": "high" | "medium" | "low"
    }
  ]
}
3 a 6 itens, os de maior impacto primeiro.`;

    const result = await llmChat({
      system,
      text: JSON.stringify(facts),
      maxTokens: 1200,
      apiKey,
    });

    if (!result.ok) return result;

    try {
      const parsed = parseJsonObject(result.text) as {
        summary?: string;
        items?: unknown[];
      };
      const items: AdviceItem[] = (parsed.items ?? []).slice(0, 6).map((raw) => {
        const row = (raw ?? {}) as Record<string, unknown>;
        const sev = row.severity === "high" || row.severity === "low" ? row.severity : "medium";
        return {
          id: uid(),
          title: String(row.title ?? "Corte possível"),
          body: String(row.body ?? ""),
          impact: Math.max(0, Number(row.impact) || 0),
          category: row.category ? asCategory(row.category) : null,
          severity: sev,
        };
      });
      return {
        ok: true as const,
        summary: String(parsed.summary ?? "Há espaço para aliviar o mês."),
        items,
      };
    } catch {
      return { ok: false as const, error: "Não consegui montar os conselhos agora." };
    }
  });
