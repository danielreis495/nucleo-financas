import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/openai-client.ts", import.meta.url), "utf8")
  .replace(/^import type .*$/m, "");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("builds a private Responses API request with image data URLs", () => {
  const request = api.buildOpenAIRequest("gpt-5-mini", {
    system: "system",
    text: "document",
    images: [{ mime: "image/jpeg", base64: "YWJj" }],
    maxTokens: 1200,
  });
  assert.equal(request.store, false);
  assert.equal(request.instructions, "system");
  assert.equal(request.input[0].content[1].image_url, "data:image/jpeg;base64,YWJj");
  assert.equal(request.max_output_tokens, 1200);
});

test("reads output text from a Responses API response", () => {
  assert.equal(api.readOpenAIText({ output: [{ content: [{ type: "output_text", text: '{"items":[]}' }] }] }), '{"items":[]}');
});
