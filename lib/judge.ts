// Gemini Flash judge (rubric §8.2): returns only c1, c2, c5, scope/side-question gaps,
// `frustrated`, the summary and the next question. Code does everything else.
import { readFileSync } from "node:fs";
import path from "node:path";
import { envOptional } from "./env";
import type { Fields, Verdict } from "./types";

export interface JudgeOutput {
  c1: Verdict;
  c1_fail_kind: "advice_only" | "out_of_scope" | "none";
  c2: Verdict;
  c5: "pass" | "unclear";
  scope_gap: boolean;
  scope_gap_reason: string | null;
  side_question: string | null;
  frustrated: boolean;
  summary: string;
  next_question: string | null;
  next_question_for: "c1" | "c2" | "none";
}

export interface JudgeInput {
  today: string;
  fields: Partial<Fields>;
  transcript: string;
  history: { started_at: string; route: string | null; fields: Partial<Fields> }[];
}

/** One raw model call. Injected so tests can mock bad JSON and slow responses. */
export type ModelCall = (prompt: { system: string; user: string }, signal: AbortSignal) => Promise<{ text: string; tokens: number }>;

export type JudgeResult =
  | { ok: true; output: JudgeOutput; tokens: number }
  | { ok: false; reason: "timeout" | "bad_json" | "error"; tokens: number; detail?: string };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    c1: { type: "STRING", enum: ["pass", "fail", "unclear"] },
    c1_fail_kind: { type: "STRING", enum: ["advice_only", "out_of_scope", "none"] },
    c2: { type: "STRING", enum: ["pass", "fail", "unclear"] },
    c5: { type: "STRING", enum: ["pass", "unclear"] },
    scope_gap: { type: "BOOLEAN" },
    scope_gap_reason: { type: "STRING", nullable: true },
    side_question: { type: "STRING", nullable: true },
    frustrated: { type: "BOOLEAN" },
    summary: { type: "STRING" },
    next_question: { type: "STRING", nullable: true },
    next_question_for: { type: "STRING", enum: ["c1", "c2", "none"] },
  },
  required: [
    "c1", "c1_fail_kind", "c2", "c5", "scope_gap", "scope_gap_reason", "side_question",
    "frustrated", "summary", "next_question", "next_question_for",
  ],
  propertyOrdering: [
    "c1", "c1_fail_kind", "c2", "c5", "scope_gap", "scope_gap_reason", "side_question",
    "frustrated", "summary", "next_question", "next_question_for",
  ],
};

let systemPromptCache: string | null = null;

/** Judge system prompt + qualified.md + services.md + rubric §7 (§8.2). */
export function judgeSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  // Statically scoped paths so the bundler traces only these files.
  const rubric = readFileSync(path.join(process.cwd(), "docs", "rubric.md"), "utf8");
  const s7 = rubric.slice(rubric.indexOf("## 7."), rubric.indexOf("## 8."));
  systemPromptCache = [
    readFileSync(path.join(process.cwd(), "prompts", "judge.md"), "utf8"),
    "\n\n=== qualified.md (Nikhil's rubric) ===\n",
    readFileSync(path.join(process.cwd(), "context", "qualified.md"), "utf8"),
    "\n\n=== services.md ===\n",
    readFileSync(path.join(process.cwd(), "context", "services.md"), "utf8"),
    "\n\n=== Rubric §7 (who judges what; code handles c3, c4 and routing) ===\n",
    s7,
  ].join("");
  return systemPromptCache;
}

export function judgeUserPrompt(input: JudgeInput): string {
  const { today, fields, transcript, history } = input;
  // Budget is code's job (c4) and must never reach the summary: keep it out of the judge input.
  const { volunteered_budget_inr: _omit, ...safeFields } = fields;
  return JSON.stringify(
    {
      today,
      fields: safeFields,
      earlier_calls_from_this_number: history,
      transcript_so_far: transcript,
    },
    null,
    1,
  );
}

/** Real Gemini call via the REST generateContent endpoint. */
export const geminiCall: ModelCall = async ({ system, user }, signal) => {
  const key = envOptional("GEMINI_API_KEY");
  if (!key) throw new Error("Missing env var GEMINI_API_KEY");
  const model = envOptional("GEMINI_MODEL") ?? "gemini-3.6-flash";
  const thinkingLevel = envOptional("GEMINI_THINKING_LEVEL") ?? "minimal";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel },
      },
    }),
  });
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? "error"}`);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const u = body.usageMetadata ?? {};
  const tokens = u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0);
  return { text, tokens };
};

function validate(raw: string): JudgeOutput | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  const v3 = ["pass", "fail", "unclear"];
  if (!o || typeof o !== "object") return null;
  if (!v3.includes(o.c1 as string) || !v3.includes(o.c2 as string)) return null;
  if (!["pass", "unclear"].includes(o.c5 as string)) return null;
  if (typeof o.summary !== "string" || typeof o.scope_gap !== "boolean") return null;
  return {
    c1: o.c1 as Verdict,
    c1_fail_kind: (["advice_only", "out_of_scope"].includes(o.c1_fail_kind as string) ? o.c1_fail_kind : "none") as JudgeOutput["c1_fail_kind"],
    c2: o.c2 as Verdict,
    c5: o.c5 as "pass" | "unclear",
    scope_gap: o.scope_gap,
    scope_gap_reason: typeof o.scope_gap_reason === "string" ? o.scope_gap_reason : null,
    side_question: typeof o.side_question === "string" && o.side_question.trim() ? o.side_question : null,
    frustrated: o.frustrated === true,
    summary: o.summary,
    next_question: typeof o.next_question === "string" && o.next_question.trim() ? o.next_question : null,
    next_question_for: (["c1", "c2"].includes(o.next_question_for as string) ? o.next_question_for : "none") as JudgeOutput["next_question_for"],
  };
}

/**
 * Calls the model with a hard deadline. JSON parse failure → retry once (§8.2).
 * The deadline covers both attempts.
 */
export async function runJudge(input: JudgeInput, deadlineMs: number, call: ModelCall = geminiCall): Promise<JudgeResult> {
  const controller = new AbortController();
  const started = Date.now();
  let tokens = 0;
  const prompt = { system: judgeSystemPrompt(), user: judgeUserPrompt(input) };

  const timeout = new Promise<"timeout">((resolve) => {
    const t = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, Math.max(0, deadlineMs));
    controller.signal.addEventListener("abort", () => clearTimeout(t));
  });

  const attempts = async (): Promise<JudgeResult> => {
    let lastBad = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() - started >= deadlineMs) break;
      try {
        const r = await call(prompt, controller.signal);
        tokens += r.tokens;
        const output = validate(r.text);
        if (output) return { ok: true, output, tokens };
        lastBad = r.text.slice(0, 200);
      } catch (e) {
        if (controller.signal.aborted) return { ok: false, reason: "timeout", tokens };
        return { ok: false, reason: "error", tokens, detail: String(e) };
      }
    }
    return { ok: false, reason: "bad_json", tokens, detail: lastBad };
  };

  const result = await Promise.race([attempts(), timeout]);
  if (result === "timeout") return { ok: false, reason: "timeout", tokens };
  controller.abort(); // clears the timer
  return result;
}
