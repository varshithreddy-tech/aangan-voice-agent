// Price guard (rubric §8.6). Blocks ₹ amounts, lakh/crore, per-sq-ft rates, multipliers,
// and "around / starts at / typically / roughly" only when near a money word.
import { PRICE_LINE } from "./lines";

const HARD_PATTERNS: RegExp[] = [
  /₹\s*\d/,
  /\b(rs|inr)\.?\s*\d/i,
  /\d[\d,.]*\s*(rupees?|rs\b|inr\b)/i,
  /\b(lakhs?|lacs?|lac|crores?|cr)\b/i,
  /\d[\d,.]*\s*(\/|per|a)\s*(sq\.?\s*(ft|feet)|square\s*(foot|feet)|sqft)\b/i,
  /\b\d+(\.\d+)?\s*(x|×)(?=\s|$|[.,!?])/i,
  /×/,
  /\b(two|three|four|five|ten|double|triple|twice)\s+(times|the)\s+(the\s+)?(cost|price|rate|amount)/i,
  /\b(two|three|four|five|ten)\s+times\b/i,
];

const MONEY_WORDS = /\b(price|prices|pricing|cost|costs|costing|rate|rates|₹|rupees?|lakhs?|budget|charge|charges|fee|fees|expensive|cheap|cheaper|afford)\b|₹/i;
const HEDGES = /\b(around|starts? at|starting at|starting from|typically|roughly|approximately|approx|about|in the range|ballpark|somewhere)\b/i;
const HEDGE_WINDOW_WORDS = 4;

export interface GuardResult {
  blocked: boolean;
  reasons: string[];
}

export function checkPrice(text: string | null | undefined): GuardResult {
  if (!text) return { blocked: false, reasons: [] };
  // The fixed pricing line is always allowed.
  const t = text.replace(PRICE_LINE, " ");
  const reasons: string[] = [];
  for (const p of HARD_PATTERNS) if (p.test(t)) reasons.push(p.source);

  // Hedge words count only within a few words of a money word ("Around 1,200 sq ft?" passes).
  const words = t.split(/\s+/);
  words.forEach((w, i) => {
    if (!HEDGES.test(words.slice(i, i + 2).join(" "))) return;
    const window = words.slice(Math.max(0, i - HEDGE_WINDOW_WORDS), i + HEDGE_WINDOW_WORDS + 3).join(" ");
    if (MONEY_WORDS.test(window)) reasons.push(`hedge near money word: "${window}"`);
  });
  return { blocked: reasons.length > 0, reasons };
}

/** Pre-speech replacement (used if Vaani has a hook) and for model-written next_question. */
export function guardSpoken(text: string | null): string | null {
  if (text === null) return null;
  return checkPrice(text).blocked ? PRICE_LINE : text;
}

/** Removes ₹ figures from text that goes to designers (the judge summary). */
export function stripRupeeFigures(text: string): string {
  return text
    .replace(/₹\s*[\d,.]+\s*(lakhs?|lacs?|crores?|cr|k)?/gi, "[amount]")
    .replace(/\b(rs|inr)\.?\s*[\d,.]+\s*(lakhs?|lacs?|crores?|cr|k)?/gi, "[amount]")
    .replace(/\b[\d,.]+\s*(lakhs?|lacs?|crores?)\b/gi, "[amount]");
}
