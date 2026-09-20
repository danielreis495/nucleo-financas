import type { ChatInput } from "./gemini";

export function buildOpenAIRequest(model: string, input: ChatInput) {
  return {
    model,
    store: false,
    instructions: input.system,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: input.text },
        ...(input.images ?? []).map((image) => ({
          type: "input_image",
          detail: "high",
          image_url: `data:${image.mime};base64,${image.base64}`,
        })),
      ],
    }],
    max_output_tokens: input.maxTokens,
  };
}

export function readOpenAIText(body: unknown) {
  const response = body as { output?: { content?: { type?: string; text?: string }[] }[] };
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
}
