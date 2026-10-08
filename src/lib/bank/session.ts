/**
 * "Senha da casa": um único segredo (APP_PASSWORD na Vercel) compartilhado pelo casal.
 * Sem APP_PASSWORD, usa o mesmo código do Núcleo IA (NUCLEO_ACCESS_CODE): uma senha só.
 * Após acertar a senha, o aparelho guarda um cookie assinado por 180 dias.
 * Somente servidor: importe apenas de dentro de handlers.
 */
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { jwtVerify, SignJWT } from "jose";

const COOKIE = "nucleo_casa";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function housePassword() {
  return env("APP_PASSWORD") ?? env("NUCLEO_ACCESS_CODE");
}

export function appPasswordConfigured() {
  return Boolean(housePassword());
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/** Trocar APP_PASSWORD invalida todas as sessões abertas. */
async function signingKey() {
  const password = housePassword();
  if (!password) return null;
  return sha256(`nucleo-casa|${password}|${env("PLUGGY_CLIENT_SECRET") ?? ""}`);
}

export async function passwordMatches(input: string) {
  const password = housePassword();
  if (!password) return false;
  const [a, b] = await Promise.all([sha256(input), sha256(password)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function startSession() {
  const key = await signingKey();
  if (!key) throw new Error("APP_PASSWORD não configurada.");
  const token = await new SignJWT({ scope: "casa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key);
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function hasSession() {
  const key = await signingKey();
  if (!key) return false;
  const token = getCookie(COOKIE);
  if (!token) return false;
  try {
    await jwtVerify(token, key, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}
