import { CATEGORIES } from "./categories";
import { isGenericFinancialIntermediaryName } from "./merchant-aliases";
import { parseLooseAmount } from "./money";
import type { AdviceItem, CategoryId, ExtractedItem, InstallmentKind, TxNature, TxType } from "./types";
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

let modelCache: { fingerprint: string; expiresAt: number; models: string[] } | null = null;

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

type ExtractResult = { ok: true; items: ExtractedItem[] } | { ok: false; error: string };

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

function asNature(value: unknown): TxNature {
  if (
    value === "transfer" ||
    value === "investment" ||
    value === "card_payment" ||
    value === "financing" ||
    value === "neutral"
  ) {
    return value;
  }
  return "budget";
}

function asKind(value: unknown): InstallmentKind {
  if (value === "loan" || value === "card") return value;
  return "other";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMerchant(row: Record<string, unknown>, description: string, nature: TxNature) {
  const rawMerchant = String(row.merchant ?? row.counterparty ?? description ?? "Comércio").trim();
  const counterparty = String(row.counterparty ?? "").trim();
  const movementText = normalizeText(description);
  const counterpartyRequired =
    nature === "transfer" ||
    (nature === "budget" && /\bpix\b|\btransferencia\b|\btransfer\b|\bted\b/.test(movementText));

  if (counterpartyRequired && counterparty && !isGenericFinancialIntermediaryName(counterparty)) {
    return counterparty;
  }
  if (counterpartyRequired && isGenericFinancialIntermediaryName(rawMerchant)) {
    return "Favorecido não identificado";
  }
  return rawMerchant || description || "Comércio";
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

function modelFingerprint(apiKey: string) {
  return `${apiKey.slice(0, 4)}:${apiKey.slice(-4)}`;
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  const fingerprint = modelFingerprint(apiKey);
  if (modelCache && modelCache.fingerprint === fingerprint && modelCache.expiresAt > Date.now()) {
    return modelCache.models;
  }
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
    const models = names.sort((a, b) => modelRank(a) - modelRank(b));
    modelCache = { fingerprint, expiresAt: Date.now() + 30 * 60 * 1000, models };
    return models;
  } catch {
    return [];
  }
}

export async function geminiGenerate(apiKey: string, input: ChatInput): Promise<ChatResult> {
  const parts: Record<string, unknown>[] = [{ text: input.text }];
  for (const img of input.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
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
      if ([500, 502, 503, 504].includes(res.status)) {
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
          return { ok: false, error: "Chave do Gemini recusada. Cole de novo em Casa, sem aspas nem espaço." };
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

  if ([500, 502, 503, 504].includes(lastStatus)) {
    return { ok: false, error: "O Gemini está congestionado agora. Espere 20 segundos e tente de novo." };
  }
  if (lastStatus === 429) return { ok: false, error: "Gemini está no limite de hoje. Tente de novo mais tarde." };
  if (lastStatus === 404 || lastStatus === 0) {
    return { ok: false, error: "Sua chave do Gemini não liberou um modelo. Gere outra em aistudio.google.com/apikey." };
  }
  return { ok: false, error: `Não consegui ler o documento (${lastStatus}).` };
}

function buildExtractionSystem(data: ExtractPayload) {
  const peopleList = data.people.map((p) => `${p.name} (${p.id}, ${p.role})`).join("; ");
  return `Você extrai lançamentos de documentos financeiros brasileiros.
Responda APENAS JSON válido:
{"items":[{"description":"texto curto fiel ao documento","merchant":"loja/pessoa/contraparte real","counterparty":"beneficiário/remetente real ou vazio","amount":number,"date":"YYYY-MM-DD","type":"expense|income","nature":"budget|transfer|investment|card_payment|financing|neutral","category":"${CATEGORY_IDS}","personId":"id","installment":null}]}

REGRAS FINANCEIRAS:
- budget: compra, conta, salário, remuneração, reembolso ou gasto/renda real.
- transfer: dinheiro entre contas do mesmo titular ou pessoas da própria casa; não entra no orçamento.
- investment: aplicação/resgate/RDB/cofrinho; não entra no orçamento.
- card_payment: pagamento de fatura; não conte de novo.
- financing: empréstimo, Pix no Crédito ou crédito contratado; não é renda.
- neutral: saldo, limite e totalizadores; prefira não retornar.
- Pix para fornecedor/pessoa de fora da casa é budget, não transfer.

CONTRAPARTE:
- merchant/counterparty é QUEM realmente recebeu ou enviou o dinheiro.
- Banco/PSP (Itaú, Nubank, PagSeguro/PagBank, Bradesco, Santander, Caixa, Banco do Brasil, Mercado Pago, PicPay etc.) NÃO é merchant só por ser a instituição da conta/chave Pix.
- Procure favorecido, beneficiário, recebedor, destinatário, pagador ou remetente. Esse nome tem prioridade sobre banco/agência/conta.
- Se só houver a instituição e a contraparte não estiver visível, use merchant="Favorecido não identificado" e preserve a instituição em description.
- Banco pode ser merchant quando ele é o próprio serviço cobrado: tarifa, juros, empréstimo, seguro bancário ou pagamento de fatura.

FATURA DE CARTÃO:
- Um item por compra; não use o total da fatura como gasto.
- Data da compra, não vencimento. Ano de referência: ${data.today.slice(0, 4)}.
- Parcela 03/10 => installment {current:3,total:10,kind:"card"}; amount é a parcela.
- Estorno/crédito: type="income", nature="budget".
- Preserve exatamente nomes de estabelecimentos.

EXTRATO DE CONTA / CSV:
- Salário/pagamento de terceiro: income + budget.
- Compra, Pix para fornecedor, boleto de consumo e tarifa real: expense + budget.
- Transferência entre contas próprias/pessoas da casa: transfer.
- Aplicação: expense + investment. Resgate: income + investment.
- Pagamento de fatura: expense + card_payment.
- Saldo/limite: neutral e prefira não retornar.

HOLERITE:
- Retorne exatamente um item com o valor líquido recebido.
- merchant = empregador, type=income, nature=budget, category=salario.
- Não crie itens separados para descontos/proventos.

GERAL:
- Categorias permitidas: [${CATEGORY_IDS}].
- personId só se o nome aparecer; senão ${data.defaultPersonId}.
- Pessoas da casa: ${peopleList}.
- Hoje: ${data.today}.
- Não invente nem normalize nomes.`;
}

function parseExtractedItems(rawText: string, data: ExtractPayload, maxItems = 200): ExtractedItem[] {
  const parsed = parseJsonObject(rawText) as { items?: unknown[] };
  return (parsed.items ?? [])
    .slice(0, maxItems)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const inst = row.installment as Record<string, unknown> | null;
      const description = String(row.description ?? row.merchant ?? "Lançamento");
      const nature = asNature(row.nature);
      return {
        id: uid(),
        description,
        merchant: resolveMerchant(row, description, nature),
        amount: asAmount(row.amount),
        date: asDate(row.date, data.today),
        type: asType(row.type),
        nature,
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
}

function looksLikeBankStatement(text: string) {
  const normalized = normalizeText(text.slice(0, 24000));
  const accountSignals = [
    /\bextrato\b/,
    /\bsaldo em conta\b/,
    /\bsaldo do dia\b/,
    /\btransferencia enviada pix\b/,
    /\btransferencia recebida pix\b/,
    /\bpix transf\b/,
    /\baplicacao rdb\b/,
    /\bresgate rdb\b/,
  ].filter((re) => re.test(normalized)).length;
  const cardSignals = [
    /\besta e a sua fatura\b/,
    /\bresumo da fatura\b/,
    /\bpagamento total da fatura\b/,
  ].filter((re) => re.test(normalized)).length;
  return accountSignals >= 1 && accountSignals >= cardSignals;
}

function splitByLines(text: string, maxChars: number) {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function splitStatementText(text: string, maxChars = 9000) {
  const firstPage = text.indexOf("--- página");
  const prefix = firstPage > 0 ? text.slice(0, firstPage).trim() : "";
  const body = firstPage >= 0 ? text.slice(firstPage) : text;
  const pageBlocks = body.split(/(?=--- página \d+ ---)/g).filter((part) => part.trim());
  const rawChunks: string[] = [];
  let current = "";

  for (const page of pageBlocks.length ? pageBlocks : [body]) {
    if (page.length > maxChars) {
      if (current.trim()) {
        rawChunks.push(current);
        current = "";
      }
      rawChunks.push(...splitByLines(page, maxChars));
      continue;
    }
    const next = current ? `${current}\n\n${page}` : page;
    if (next.length > maxChars && current) {
      rawChunks.push(current);
      current = page;
    } else {
      current = next;
    }
  }
  if (current.trim()) rawChunks.push(current);

  return rawChunks.map((chunk, index) =>
    `${prefix ? `${prefix}\n\n` : ""}BLOCO ${index + 1} DE ${rawChunks.length}. Extraia somente os lançamentos presentes neste bloco.\n\n${chunk}`,
  );
}

async function extractOne(
  apiKey: string,
  system: string,
  text: string,
  data: ExtractPayload,
  images?: ImagePart[],
  maxTokens = 8192,
): Promise<ExtractResult> {
  const result = await geminiGenerate(apiKey, { system, text, images, maxTokens });
  if (!result.ok) return result;
  try {
    return { ok: true, items: parseExtractedItems(result.text, data) };
  } catch {
    return { ok: false, error: "Resposta do leitor ficou incompleta." };
  }
}

export async function extractWithGemini(data: ExtractPayload): Promise<ExtractResult> {
  const apiKey = (data.apiKey ?? "").trim();
  if (!apiKey) return { ok: false, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };

  const system = buildExtractionSystem(data);
  const sourceText = data.text ?? "";
  const bankStatement = Boolean(sourceText && looksLikeBankStatement(sourceText));
  const shouldChunk = bankStatement && sourceText.length > 12000;

  if (shouldChunk) {
    const chunks = splitStatementText(sourceText);
    const allItems: ExtractedItem[] = [];
    for (const chunk of chunks) {
      const result = await extractOne(apiKey, system, `Documento:\n${chunk}`, data, undefined, 6000);
      if (!result.ok) return result;
      allItems.push(...result.items);
    }
    return allItems.length
      ? { ok: true, items: allItems.slice(0, 240) }
      : { ok: false, error: "Não achei lançamentos nesse extrato." };
  }

  const text = sourceText
    ? `Documento:\n${sourceText.slice(0, 36000)}`
    : "Extraia os lançamentos destas imagens. Se for fatura, cada compra é um item.";
  const single = await extractOne(apiKey, system, text, data, data.images, 8192);
  if (single.ok) return single;

  // Extratos podem gerar JSON grande mesmo quando o texto total não ultrapassa
  // o limiar acima. Se a primeira resposta vier truncada, refazemos por blocos.
  if (bankStatement && sourceText.length > 4000) {
    const chunks = splitStatementText(sourceText, 7000);
    if (chunks.length > 1) {
      const allItems: ExtractedItem[] = [];
      for (const chunk of chunks) {
        const result = await extractOne(apiKey, system, `Documento:\n${chunk}`, data, undefined, 5000);
        if (!result.ok) return result;
        allItems.push(...result.items);
      }
      if (allItems.length) return { ok: true, items: allItems.slice(0, 240) };
    }
  }

  return single;
}

export async function adviseWithGemini(data: AdvicePayload): Promise<
  { ok: true; summary: string; items: AdviceItem[] } | { ok: false; error: string }
> {
  const { apiKey: rawKey, ...facts } = data;
  const apiKey = (rawKey ?? "").trim();
  if (!apiKey) return { ok: false, error: "Cole a chave do Gemini em Casa (abaixo das pessoas)." };

  const system = `Você é um conselheiro financeiro direto, em português do Brasil, para um orçamento doméstico.
Sem moralismo, sem enrolação. Foque em cortes concretos e no peso das parcelas.
Responda APENAS JSON:
{"summary":"2 frases, tom calmo","items":[{"title":"até 42 caracteres","body":"1-2 frases com número em R$","impact":number,"category":"categoria ou null","severity":"high|medium|low"}]}
Categorias: [${CATEGORY_IDS}]. Retorne 3 a 6 itens, os de maior impacto primeiro.`;

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


export type FinancialChatPayload = {
  question: string;
  context: unknown;
  history?: { role: "user" | "assistant"; text: string }[];
  apiKey?: string;
};

export async function askFinancialQuestionWithGemini(data: FinancialChatPayload): Promise<
  { ok: true; answer: string; suggestions: string[] } | { ok: false; error: string }
> {
  const apiKey = (data.apiKey ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: "Para conversar com o Núcleo IA, salve sua chave do Gemini em Casa." };
  }

  const system = `Você é o Núcleo IA, um assistente financeiro pessoal em português do Brasil.
Você recebe um JSON com fatos calculados pelo próprio aplicativo. Use SOMENTE esses fatos para responder.
Não invente saldo, renda, vencimento, pagamento, categoria, transação ou previsão que não esteja no contexto.

REGRAS:
- Diferencie sempre orçamento (competência do gasto) de caixa real (dinheiro nas contas).
- Fatura marcada como "paid" já foi paga; "open" ainda pesa no caixa; "future" vence fora do mês analisado.
- Recorrências e previsões são estimativas. Diga explicitamente quando usar estimativa.
- Pagamento de fatura, transferências entre contas e investimentos não são novos gastos do orçamento.
- Para perguntas de "por quê", cite os maiores fatos/lançamentos que explicam a resposta.
- Para perguntas de compra/decisão, compare o valor com caixa, faturas abertas, compromissos e previsão. Não prometa que a pessoa "pode" gastar se os dados forem insuficientes.
- Quando faltar informação, diga exatamente qual dado está faltando.
- Seja direto, prático e use valores em R$.
- Não mencione o JSON, prompt ou regras internas.

Responda APENAS JSON válido:
{"answer":"resposta clara em até 7 parágrafos curtos","suggestions":["pergunta curta 1","pergunta curta 2","pergunta curta 3"]}`;

  const result = await geminiGenerate(apiKey, {
    system,
    text: JSON.stringify({
      question: data.question,
      recentConversation: (data.history ?? []).slice(-8),
      financialContext: data.context,
    }),
    maxTokens: 2200,
  });
  if (!result.ok) return result;

  try {
    const parsed = parseJsonObject(result.text) as { answer?: unknown; suggestions?: unknown[] };
    const answer = String(parsed.answer ?? "").trim();
    if (!answer) return { ok: false, error: "Não consegui formular uma resposta com esses dados." };
    const suggestions = (parsed.suggestions ?? [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return { ok: true, answer, suggestions };
  } catch {
    return { ok: false, error: "A resposta do Núcleo IA veio incompleta. Tente novamente." };
  }
}
