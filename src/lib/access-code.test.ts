import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCESS_CODE_INVALID_MESSAGE,
  ACCESS_CODE_MISSING_MESSAGE,
  ACCESS_CODE_NOT_CONFIGURED_MESSAGE,
} from "./access-code.ts";
import { accessCodeError } from "./access-code.server.ts";

describe("código de acesso do Núcleo IA", () => {
  const env = { NUCLEO_ACCESS_CODE: "casa-123", NODE_ENV: "production" };

  it("libera com o código correto", () => {
    assert.equal(accessCodeError("casa-123", env), null);
    assert.equal(accessCodeError("  casa-123 ", env), null);
  });

  it("bloqueia sem código ou com código errado", () => {
    assert.equal(accessCodeError(undefined, env), ACCESS_CODE_MISSING_MESSAGE);
    assert.equal(accessCodeError("outro", env), ACCESS_CODE_INVALID_MESSAGE);
  });

  it("em produção sem variável configurada, fica bloqueado em vez de aberto", () => {
    assert.equal(accessCodeError("qualquer", { NODE_ENV: "production" }), ACCESS_CODE_NOT_CONFIGURED_MESSAGE);
    assert.equal(accessCodeError("qualquer", { VERCEL_ENV: "preview" }), ACCESS_CODE_NOT_CONFIGURED_MESSAGE);
  });

  it("no desenvolvimento local sem variável, não atrapalha", () => {
    assert.equal(accessCodeError(undefined, { NODE_ENV: "development" }), null);
  });
});
