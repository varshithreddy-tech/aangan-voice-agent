// Turns the caller's own words into dates, using the date convention in rubric §4.
// The voice agent never computes dates; only this code does.

export type CompletionParse =
  | { kind: "date"; date: string }
  | { kind: "no_deadline" }
  | { kind: "not_given" }
  | { kind: "unknown" }; // festival/event, "not sure", or unparseable → c3 unclear

export type SiteParse =
  | { kind: "now" }
  | { kind: "date"; date: string }
  | { kind: "not_given" }
  | { kind: "unknown" }; // "possession date not known yet" → c3 unclear

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_RE =
  "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  "a couple of": 2, "couple of": 2, "a few": 3, few: 3,
};
const NUM_RE = "(\\d+(?:\\.\\d+)?|a couple of|couple of|a few|few|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)";

const NO_DEADLINE_RE = /\b(no (fixed )?deadline|no rush|no hurry|not in a hurry|flexible|whenever|any ?time|no particular (date|time)|open timeline)\b/;
const UNKNOWN_RE = /\b(not sure|unsure|don'?t know|do not know|not known|unknown|no idea|not decided|undecided|not confirmed|tbd|yet to (be )?(decided|confirmed|known)|haven'?t decided)\b/;
const FESTIVAL_RE = /\b(diwali|deepavali|ganpati|ganesh|ganeshotsav|dussehra|dasara|navratri|christmas|new year|eid|holi|pongal|sankranti|gudi padwa|onam|wedding|marriage|function|baby|festival|housewarming|griha ?pravesh)\b/;
const SITE_PAST_RE = /\b(already|ago|last (week|month|year)|was|happened|received|got (the )?(keys|possession)|have (the )?(keys|possession)|taken possession|new possession|recent(ly)? possession|moved in|living|lived|live (there|in it)|staying|occupied|been here)\b/;
const SITE_NOW_RE = /\b(now|ready|immediately|vacant|empty|available|right away|today|bare|bare shell|shell and core|handed over|handover|just got (it|the (space|keys|flat|office)))\b/;

// ---------- date helpers (UTC-based, dates as YYYY-MM-DD) ----------

export function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(s: string, n: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}
export function weeksBetween(from: string, to: string): number {
  return daysBetween(from, to) / 7;
}
function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function ymd(y: number, m: number, d: number): string {
  return fmt(new Date(Date.UTC(y, m, d)));
}

function num(word: string): number {
  const n = Number(word);
  return Number.isFinite(n) ? n : NUMBER_WORDS[word] ?? NaN;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9.' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every date the text mentions, by the §4 convention:
 *  "by/in [month]" → 1st; "end of [month]" → last day; current month → last day;
 *  passed month → next year; "in N weeks" → today + N weeks; "in N months" → today + N × 4.3 weeks.
 */
function datesIn(t: string, today: string): string[] {
  const out: string[] = [];
  const [ty, tm] = [toDate(today).getUTCFullYear(), toDate(today).getUTCMonth()];
  let rest = t;

  // Relative: N weeks / N months
  const rel = new RegExp(`\\b${NUM_RE}\\s*(weeks?|months?)\\b`, "g");
  for (const m of t.matchAll(rel)) {
    const n = num(m[1]);
    if (!Number.isFinite(n)) continue;
    const days = m[2].startsWith("week") ? Math.round(n * 7) : Math.round(n * 4.3 * 7);
    out.push(addDays(today, days));
  }
  rest = rest.replace(rel, " ");

  if (/\bnext month\b/.test(rest)) {
    out.push(ymd(tm === 11 ? ty + 1 : ty, (tm + 1) % 12, 1));
  }
  if (/\b(end of (the|this) year|year end|year-end)\b/.test(rest)) {
    out.push(ymd(ty, 11, 31));
  }

  // Specific day + month ("8 november", "1st dec", "november 8")
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:\\s+(\\d{4}))?\\b`, "g");
  const monthFirst = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, "g");
  for (const m of rest.matchAll(dayFirst)) {
    out.push(withYear(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, today));
  }
  rest = rest.replace(dayFirst, " ");
  for (const m of rest.matchAll(monthFirst)) {
    out.push(withYear(Number(m[2]), MONTHS[m[1]], m[3] ? Number(m[3]) : null, today));
  }
  rest = rest.replace(monthFirst, " ");

  // Month only, with "end of" handling
  const monthOnly = new RegExp(`\\b(end of\\s+(?:the\\s+month\\s+of\\s+)?)?${MONTH_RE}(?:\\s+(\\d{4}))?\\b`, "g");
  for (const m of rest.matchAll(monthOnly)) {
    const month = MONTHS[m[2]];
    if (month === undefined) continue;
    // "may" is also a verb ("it may take..."): only count it with a date-ish lead word.
    if (m[2] === "may" && !/\b(by|in|before|till|until|of|end of|around|from)\s+may\b/.test(rest)) continue;
    const explicitYear = m[3] ? Number(m[3]) : null;
    let year = explicitYear ?? ty;
    if (explicitYear === null && month < tm) year = ty + 1; // passed month → next year
    const isEnd = Boolean(m[1]) || (explicitYear === null && month === tm && year === ty); // current month → last day
    out.push(ymd(year, month, isEnd ? lastDay(year, month) : 1));
  }
  return out;
}

function withYear(day: number, month: number, year: number | null, today: string): string {
  const ty = toDate(today).getUTCFullYear();
  let y = year ?? ty;
  let candidate = ymd(y, month, Math.min(day, lastDay(y, month)));
  if (year === null && candidate < today) {
    y = ty + 1;
    candidate = ymd(y, month, Math.min(day, lastDay(y, month)));
  }
  return candidate;
}

function earliest(dates: string[]): string | null {
  return dates.length ? [...dates].sort()[0] : null; // range → the earlier date (§4)
}

export function parseCompletion(text: string | null | undefined, today: string): CompletionParse {
  if (!text || !text.trim()) return { kind: "not_given" };
  const t = normalise(text);
  if (NO_DEADLINE_RE.test(t)) return { kind: "no_deadline" };
  const date = earliest(datesIn(t, today));
  if (date) return { kind: "date", date };
  // Festival/event, "not sure", or anything else we can't turn into a date: the agent must ask for a date.
  return { kind: "unknown" };
}

export function parseSiteAvailable(text: string | null | undefined, today: string): SiteParse {
  if (!text || !text.trim()) return { kind: "not_given" };
  const t = normalise(text);
  if (UNKNOWN_RE.test(t)) return { kind: "unknown" };
  if (SITE_PAST_RE.test(t)) return { kind: "now" };
  const date = earliest(datesIn(t, today));
  if (date) return date <= today ? { kind: "now" } : { kind: "date", date };
  if (SITE_NOW_RE.test(t)) return { kind: "now" };
  return { kind: "unknown" };
}

export function mentionsFestival(text: string | null | undefined): boolean {
  return !!text && FESTIVAL_RE.test(normalise(text));
}
