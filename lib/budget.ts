// c4 — budget check, computed in code and never spoken (rubric §8.3).
// The ₹ figures come from pricing.md; they stay on the server.
import type { Verdict } from "./types";

const RESIDENTIAL_FLOOR_INR = 350_000; // pricing.md: single-room redesign minimum (₹3.5 lakh)
const RESIDENTIAL_LOWEST_PER_SQFT = 1_800; // pricing.md: standard residential lower bound
const COMMERCIAL_LOWEST_PER_SQFT = 1_200; // pricing.md: basic commercial fitout lower bound
const CLEARLY_BELOW_MARGIN = 0.5; // TODO(Q4): "half of" is our assumption, not Nikhil's

const UNIT: Record<string, number> = {
  k: 1_000, thousand: 1_000, l: 100_000, lac: 100_000, lacs: 100_000, lakh: 100_000,
  lakhs: 100_000, cr: 10_000_000, crore: 10_000_000, crores: 10_000_000,
};

/**
 * Parses a volunteered budget into rupees. A range uses the upper end (§8.3).
 * Returns null for "not mentioned" and NaN for vague answers ("reasonable").
 */
export function parseBudgetInr(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = value.toLowerCase().replace(/rs\.?|inr|₹|rupees?/g, " ");
  const re = /(\d+(?:[.,]\d+)*)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)?\b/g;
  const amounts: number[] = [];
  let lastUnit: string | undefined;
  const raw: { n: number; unit?: string }[] = [];
  for (const m of t.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    raw.push({ n, unit: m[2] });
  }
  if (!raw.length) return NaN;
  // "1–1.5 lakh": the unit on the last number applies to earlier bare numbers.
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i].unit) lastUnit = raw[i].unit;
    amounts.unshift(raw[i].n * (UNIT[raw[i].unit ?? lastUnit ?? ""] ?? 1));
  }
  return Math.max(...amounts);
}

export function computeC4(
  budget: number | null,
  spaceType: "home" | "office" | "other" | null,
  designedAreaSqft: number | null,
): Verdict {
  if (budget === null) return "pass"; // not mentioned → treat as qualified
  if (Number.isNaN(budget)) return "unclear"; // vague
  const commercial = spaceType === "office" || spaceType === "other";
  if (!commercial && budget < RESIDENTIAL_FLOOR_INR) return "fail";
  // Designed area (rooms being done), never the whole flat.
  if (designedAreaSqft && designedAreaSqft > 0) {
    const rate = commercial ? COMMERCIAL_LOWEST_PER_SQFT : RESIDENTIAL_LOWEST_PER_SQFT;
    if (budget < CLEARLY_BELOW_MARGIN * designedAreaSqft * rate) return "fail";
  }
  return "pass";
}
