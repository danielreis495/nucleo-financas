import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return crypto.randomUUID();
}

export function monthKey(date: Date | string) {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

export function addMonthsKey(key: string, delta: number) {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Soma meses a uma data ISO preservando o dia quando possível e usando o último
 * dia do mês quando ele não existe (31/01 + 1 mês = 28 ou 29/02, não 03/03).
 */
export function addMonthsIso(iso: string, delta: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(year, month - 1 + delta, 1, 12, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, lastDay));
  return isoDate(target);
}

export function todayIso() {
  return isoDate(new Date());
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
