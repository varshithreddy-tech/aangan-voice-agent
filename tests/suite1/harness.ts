// Suite 1 runner (rubric §9): sends a fixture through the /qualify core and checks
// route, close_reason, agent_line and flags. Modes:
//   mock (default)      — the judge is mocked from fixture.judge → tests the code routing exactly
//   live (RUN_LIVE_JUDGE=1) — real Gemini; tests Gemini + code together
import { memoryRepo } from "@/lib/db";
import type { JudgeOutput, ModelCall } from "@/lib/judge";
import { qualify } from "@/lib/qualify";
import { checkPrice } from "@/lib/priceGuard";
import type { Fixture, Step, Expect } from "../fixtures/synthetic";
import type { QualifyResult } from "@/lib/types";

export const LIVE = process.env.RUN_LIVE_JUDGE === "1";

const DEFAULT_JUDGE: JudgeOutput = {
  c1: "pass", c1_fail_kind: "none", c2: "pass", c5: "pass", scope_gap: false, scope_gap_reason: null,
  side_question: null, frustrated: false, summary: "Test summary line one\nline two\nline three",
  next_question: null, next_question_for: "none",
};

function mockModel(judge: Partial<JudgeOutput>, mode?: Fixture["mock"]): ModelCall {
  return async (_prompt, signal) => {
    if (mode === "slow") {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 6000);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    }
    if (mode === "bad_json") return { text: "{not json", tokens: 10 };
    return { text: JSON.stringify({ ...DEFAULT_JUDGE, ...judge }), tokens: 100 };
  };
}

/** §9 "agent_line follows from the result, even when a row doesn't list it". */
export function expectedAgentLine(e: Expect): string | null {
  if (e.agent_line !== undefined) return e.agent_line;
  if (e.flags?.includes("timeline_tight")) return "timeline_tight";
  if (e.close_reason === "timeline_possession") return "timeline_possession";
  return null;
}

export interface Check {
  ok: boolean;
  problems: string[];
  result: QualifyResult;
  ms: number;
}

export function compare(result: QualifyResult, e: Expect, ms: number): Check {
  const problems: string[] = [];
  if (result.route !== e.route) problems.push(`route ${result.route} ≠ ${e.route}`);
  if ((result.close_reason ?? null) !== (e.close_reason ?? null)) problems.push(`close_reason ${result.close_reason} ≠ ${e.close_reason ?? null}`);
  const line = expectedAgentLine(e);
  if ((result.agent_line ?? null) !== line) problems.push(`agent_line ${result.agent_line} ≠ ${line}`);
  if (e.flags !== undefined) {
    const got = [...result.flags].sort().join(",");
    const want = [...e.flags].sort().join(",");
    if (got !== want) problems.push(`flags [${got}] ≠ [${want}]`);
  }
  // Automatic fail: any price in the judge's summary or next_question (§9).
  for (const [k, v] of [["summary", result.summary], ["next_question", result.next_question]] as const) {
    if (checkPrice(v).blocked) problems.push(`price in ${k}: ${v}`);
  }
  return { ok: problems.length === 0, problems, result, ms };
}

export async function runFixture(fx: Fixture): Promise<{ first: Check; final?: Check }> {
  const repo = memoryRepo();
  const callId = `test-${fx.id.replace(/\W+/g, "-")}`;
  const run = async (fields: Fixture["fields"], transcript: string, askCounts: Fixture["ask_counts"], judge: Partial<JudgeOutput>) => {
    const t0 = Date.now();
    const out = await qualify(
      {
        call_id: callId,
        caller_number: "+910000000000",
        fields,
        transcript_so_far: transcript,
        test_today: fx.today,
        test_time: fx.time,
        test_ask_counts: askCounts,
      },
      { repo, isTest: true, model: LIVE && !fx.mock ? undefined : mockModel(judge, fx.mock) },
    );
    return { result: out.result, ms: Date.now() - t0 };
  };

  const a = await run(fx.fields, fx.transcript, fx.ask_counts, fx.judge);
  const first = compare(a.result, fx.expect, a.ms);
  if (!fx.then) return { first };

  const step: Step = fx.then;
  const b = await run(
    { ...fx.fields, ...(step.fields ?? {}) },
    `${fx.transcript}\n${step.transcript ?? ""}`,
    step.ask_counts,
    { ...fx.judge, ...(step.judge ?? {}) },
  );
  return { first, final: compare(b.result, step.expect, b.ms) };
}
