import { extractWithGenerator, type ChatInput, type ChatResult, type ExtractPayload } from "./gemini";
import { buildOpenAIRequest, readOpenAIText } from "./openai-client";

type Fetcher = typeof fetch;

export async function openaiGenerate(
  apiKey: string,
  model: string,
  input: ChatInput,
  fetcher: Fetcher = fetch,
): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAIRequest(model, input)),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return { ok: false, error: "O serviço de análise demorou demais. Tente novamente." };
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "A chave da OpenAI configurada na Vercel foi recusada." };
    }
    if (response.status === 429) {
      return { ok: false, error: "A OpenAI atingiu o limite de uso ou de créditos. Tente novamente mais tarde." };
    }
    return { ok: false, error: `O serviço de análise não respondeu corretamente (${response.status}).` };
  }

  const text = readOpenAIText(await response.json());
  return text
    ? { ok: true, text }
    : { ok: false, error: "A OpenAI não retornou uma leitura do documento." };
}

export function extractWithOpenAI(data: ExtractPayload, apiKey: string, model: string) {
  return extractWithGenerator(
    { ...data, apiKey: undefined },
    (input) => openaiGenerate(apiKey, model, input),
  );
}
