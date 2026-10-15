import assert from "node:assert/strict";
import { test } from "node:test";
import { itemHealth } from "./item-health.ts";
import type { BankItemInfo } from "./types.ts";

const now = Date.parse("2026-10-14T15:00:00Z");
const base: BankItemInfo = {
  itemId: "11111111-1111-1111-1111-111111111111",
  status: "UPDATED",
  executionStatus: "SUCCESS",
  lastUpdatedAt: "2026-10-14T06:00:00Z",
};

test("conexão em dia não mostra aviso", () => {
  assert.deepEqual(itemHealth(base, "Itaú", now), { level: "ok", message: null });
});

test("dados parados há dias pedem conferência, mesmo com status UPDATED", () => {
  const health = itemHealth({ ...base, lastUpdatedAt: "2026-10-11T09:00:00Z" }, "Itaú", now);
  assert.equal(health.level, "action");
  assert.match(health.message ?? "", /desde 11\/10/);
  assert.match(health.message ?? "", /meu\.pluggy\.ai/);
});

test("pedido de atualização recusado aparece junto do aviso", () => {
  const health = itemHealth(
    { ...base, lastUpdatedAt: "2026-10-11T09:00:00Z", updateResult: "HTTP 403: Forbidden" },
    "Nubank",
    now,
  );
  assert.match(health.message ?? "", /recusado \(HTTP 403: Forbidden\)/);
});

test("autorização revogada ou erro de login pede reconexão", () => {
  for (const patch of [
    { status: "LOGIN_ERROR" },
    { executionStatus: "USER_AUTHORIZATION_REVOKED" },
    { errorCode: "ACCOUNT_NEEDS_ACTION", errorMessage: "Acesse o app do banco" },
  ]) {
    const health = itemHealth({ ...base, ...patch }, "Itaú", now);
    assert.equal(health.level, "action");
    assert.match(health.message ?? "", /reconecte/);
  }
});

test("consentimento vencido pede reconexão; perto de vencer avisa", () => {
  assert.equal(itemHealth({ ...base, consentExpiresAt: "2026-10-13T00:00:00Z" }, "Itaú", now).level, "action");
  const soon = itemHealth({ ...base, consentExpiresAt: "2026-10-18T12:00:00Z" }, "Itaú", now);
  assert.match(soon.message ?? "", /vence em 18\/10/);
});

test("instabilidade do banco: a Pluggy tenta de novo sozinha", () => {
  const health = itemHealth({ ...base, status: "OUTDATED", executionStatus: "SITE_NOT_AVAILABLE" }, "Itaú", now);
  assert.equal(health.level, "wait");
  assert.match(health.message ?? "", /tenta de novo/);
});

test("recusa do MeuPluggy não é erro quando os dados estão em dia", () => {
  const health = itemHealth(
    { ...base, updateResult: "HTTP 400: 400 MeuPluggy item cant be updated" },
    "Nubank",
    now,
  );
  assert.deepEqual(health, { level: "ok", message: null });
});

test("dados parados no MeuPluggy pedem atualizar no meu.pluggy.ai, sem citar a recusa", () => {
  const health = itemHealth(
    {
      ...base,
      lastUpdatedAt: "2026-10-11T09:00:00Z",
      updateResult: "HTTP 400: 400 MeuPluggy item cant be updated",
    },
    "Itaú",
    now,
  );
  assert.equal(health.level, "action");
  assert.doesNotMatch(health.message ?? "", /recusado/);
  assert.match(health.message ?? "", /meu\.pluggy\.ai/);
});
