import { CATEGORIES } from "./categories";
import { parseLooseAmount } from "./money";
import type { AdviceItem, CategoryId, ExtractedItem, InstallmentKind, TxType } from "./types";
import { uid } from "./utils";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id).join(", ");

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
];

export type ImagePart = { mime: string; base64: string };

export type ExtractPayload = {
  text?: string;
  images?: ImagePart[];
  people: { id: string; name: string; role: string }[];
  defaultPersonId: string;
  today: string;
  apiKey?: string;
};

export type AdvicePayload = {
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
};

type ChatResult = { ok: true; text: string } | { ok: false; error: string };

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Resposta sem JSON");
  return JSON.parse(body.slice(start, end + 1));
}

function asAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  return Math.abs(parseLooseAmount(String(value ?? "")));
}

function asDate(value: unknown, today: string) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    return `${y}-${m}-${d}`;
  }
  const dm = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (dm) {
    const year = today.slice(0, 4);
    return `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }
  return today;
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelRank(name: string) {
  const exact = FALLBACK_MODELS.indexOf(name);
  if (exact >= 0) return exact;
  if (/2\.5-flash/.test(name)) return 0;
  if (/2\.0-flash/.test(name)) return 1;
  if (/1\.5-flash/.test(name)) return 2;
  if (/flash-lite/.test(name)) return 3;
  if (/3\.7/.test(name)) return 9;
  return 5;
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = (body.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter((n) => /flash/i.test(n) && !/tts|image|exp|preview/i.test(n));
    return names.sort((a, b) => modelRank(a) - modelRank(b));
  } catch {
    return [];
  }
}

export async function geminiGenerate(apiKey: string, input: ChatInput): Promise<ChatResult> {
  const parts: Record<string, unknown>[] = [{ text: input.text }];
  for (const img of input.images ?? []) {
    parts.push({
      inlineData: {
        mimeType: img.mime,
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

  const listed = await listGeminiModels(apiKey);
  const models = [...listed, ...FALLBACK_MODELS.filter((m) => !listed.includes(m))].slice(0, 6);

  let lastStatus = 0;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        lastStatus = 0;
        break;
      }
      lastStatus = res.status;
      if (res.status === 404) break;
      if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504) {
        if (attempt === 0) {
          await wait(900);
          continue;
        }
        break;
      }
      if (res.status === 429) {
        if (attempt === 0) {
          await wait(1200);
          continue;
        }
        break;
      }
      if (!res.ok) {
        if (res.status === 400 || res.status === 403) {
          return {
            ok: false,
            error: "Chave do Gemini recusada. Cole de novo em Casa, sem aspas nem espaço.",
          };
        }
        break;
      }
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) break;
      return { ok: true, text };
    }
  }

  if (lastStatus === 503 || lastStatus === 500 || lastStatus === 502 || lastStatus === 504) {
    return {
      ok: false,
      error: "O Gemini está congestionado agora. Espere 20 segundos e tire a foto de novo.",
    };
  }
  if (lastStatus === 429) {
    return { ok: false, error: "Gemini está no limite de hoje. Tente de novo mais tarde." };
  }
  if (lastStatus === 404 || lastStatus === 0) {
    return {
      ok: false,
      error: "Sua chave do Gemini não liberou um modelo. Gere outra em aistudio.google.com/apikey.",
    };
  }
  return { ok: false, error: `Não consegui ler o documento (${lastStatus}).` };
}

export async function extractWithGemini(data: ExtractPayload): Promise<
  { ok: true; items: ExtractedItem[] } | { ok: false; error: string }
> {
  const apiKey = (data.apiKey ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };
  }

  const peopleList = data.people.map((p) => `${p.name} (${p.id}, ${p.role})`).join("; ");
  const system = `Você extrai lançamentos de documentos financeiros brasileiros: fatura de cartão, extrato, boleto, NF e planilha.
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

FATURA / EXTRATO DE CARTÃO (Nubank, Inter, Itaú, C6, Bradesco, Santander, PicPay, etc.):
- UM item para CADA compra da lista de lançamentos.
- NÃO junte compras. NÃO use o total da fatura como um único gasto.
- Ignore: pagamento recebido, valor total, saldo anterior, limite, vencimento, rotativo, encargo, IOF isolado, anuidade se for zero, publicidade.
- Data da compra (não a do vencimento). Formato no PDF costuma ser DD/MM ou DD/MM/AA → converta para YYYY-MM-DD. Ano de referência: ${data.today.slice(0, 4)}.
- amount é o valor daquela linha, em reais com ponto decimal (32,90 → 32.9).
- Parcela na linha (ex.: 03/10, 3/12, 10x): installment.current/total, kind "card", amount = valor da parcela.
- Estorno / crédito na fatura: type "income".
- Pix, TED e boleto no extrato: cada um é um item.

NOTA FISCAL / CUPOM (uma loja só):
- Aí sim pode juntar itens miúdos da mesma categoria.

Geral:
- personId só se o nome aparecer; senão ${data.defaultPersonId}.
- Pessoas da casa: ${peopleList}
- Hoje: ${data.today}
- Até 80 itens, todos os lançamentos reais.`;

  const text = data.text
    ? `Documento:\n${data.text.slice(0, 36000)}`
    : "Extraia os lançamentos destas imagens. Se for fatura, cada compra é um item.";

  const result = await geminiGenerate(apiKey, {
    system,
    text,
    images: data.images,
    maxTokens: 8192,
  });
  if (!result.ok) return result;

  try {
    const parsed = parseJsonObject(result.text) as { items?: unknown[] };
    const items: ExtractedItem[] = (parsed.items ?? [])
      .slice(0, 80)
      .map((raw) => {
        const row = (raw ?? {}) as Record<string, unknown>;
        const inst = row.installment as Record<string, unknown> | null;
        return {
          id: uid(),
          description: String(row.description ?? row.merchant ?? "Lançamento"),
          merchant: String(row.merchant ?? row.description ?? "Comércio"),
          amount: asAmount(row.amount),
          date: asDate(row.date, data.today),
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
      })
      .filter((item) => item.amount > 0);
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Não entendi o documento. Tente outra foto ou um PDF mais nítido." };
  }
}

export async function adviseWithGemini(data: AdvicePayload): Promise<
  { ok: true; summary: string; items: AdviceItem[] } | { ok: false; error: string }
> {
  const { apiKey: rawKey, ...facts } = data;
  const apiKey = (rawKey ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };
  }

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

  const result = await geminiGenerate(apiKey, {
    system,
    text: JSON.stringify(facts),
    maxTokens: 1200,
  });
  if (!result.ok) return result;

  try {
    const parsed = parseJsonObject(result.text) as { summary?: string; items?: unknown[] };
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
      ok: true,
      summary: String(parsed.summary ?? "Há espaço para aliviar o mês."),
      items,
    };
  } catch {
    return { ok: false, error: "Não consegui montar os conselhos agora." };
  }
}
