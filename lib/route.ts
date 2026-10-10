// Route table (rubric §7.3), applied in code in this exact order. Gemini never picks the route.
import type { C3Result } from "./timeline";
import type { JudgeOutput } from "./judge";
import { NEXT_QUESTIONS } from "./lines";
import type { AgentLine, AskCounts, CloseReason, Criteria, Fields, Flag, Route } from "./types";

export interface RouteDecision {
  route: Route;
  close_reason: CloseReason | null;
  next_question: string | null;
  agent_line: AgentLine | null;
  flags: Flag[];
  ask_counts: AskCounts;
}

export interface PreCheckInput {
  fields: Partial<Fields>;
  ask_counts: AskCounts;
  inCallbackWindow: boolean;
}

/** P1–P3: instant, free, deterministic; run before Gemini is called. */
export function preCheck({ fields, ask_counts, inCallbackWindow }: PreCheckInput): RouteDecision | null {
  const base = { close_reason: null, next_question: null, ask_counts };
  if (fields.complaint) {
    // TODO(Q10): who calls back after hours, and when.
    return { ...base, route: "escalate_urgent", agent_line: inCallbackWindow ? "callback_15min" : "callback_morning", flags: [] };
  }
  if (fields.language_issue) {
    // TODO(Q12): is a callback from the team enough for non-English callers?
    return { ...base, route: "escalate_normal", agent_line: null, flags: ["language"] };
  }
  if (!fields.locality?.trim() && (ask_counts.c2 ?? 0) >= 1) {
    return { ...base, route: "escalate_normal", agent_line: null, flags: [] };
  }
  return null;
}

/** Commercial size gaps we can see in the captured numbers (§6.8). Gemini catches the rest. */
export function codeScopeGap(fields: Partial<Fields>): string | null {
  if (fields.space_type !== "office") return null;
  const sqft = fields.designed_area_sqft ?? fields.flat_area_sqft;
  if (!sqft) return null;
  if (sqft < 500) return `commercial space of ~${sqft} sq ft (under ~500)`; // TODO(Q1): commercial minimum size
  if (sqft > 3000) return `commercial space of ~${sqft} sq ft (over ~3,000)`; // TODO(Q9): decline or escalate
  return null;
}

export function decideRoute(args: {
  judge: JudgeOutput;
  c3: C3Result;
  c4: Criteria["c4"];
  scopeGap: string | null;
  ask_counts: AskCounts;
}): { decision: RouteDecision; criteria: Criteria } {
  const { judge, c3, c4, scopeGap } = args;
  const ask_counts = { ...args.ask_counts };
  const criteria: Criteria = { c1: judge.c1, c2: judge.c2, c3: c3.verdict, c4, c5: judge.c5 };
  const frustrated: Flag[] = judge.frustrated ? ["frustrated"] : [];
  const out = (d: Partial<RouteDecision> & { route: Route }): { decision: RouteDecision; criteria: Criteria } => ({
    criteria,
    decision: { close_reason: null, next_question: null, agent_line: null, flags: [], ask_counts, ...d },
  });

  // Fails are checked before unclear answers.
  const fails = (Object.keys(criteria) as (keyof Criteria)[]).filter((k) => criteria[k] === "fail");

  // Row 3: two or more fails.
  if (fails.length >= 2) return out({ route: "close", close_reason: "multiple" });

  // Row 4: exactly one fail. TODO(Q3): qualified.md says both "fails one → close" and "two or more → decline".
  if (fails.length === 1) {
    const f = fails[0];
    const reason: CloseReason =
      f === "c1" ? (judge.c1_fail_kind === "out_of_scope" ? "out_of_scope" : "advice_only")
      : f === "c2" ? "area"
      : f === "c3" ? (c3.failReason ?? "timeline")
      : "budget";
    return out({
      route: "close",
      close_reason: reason,
      agent_line: reason === "timeline_possession" ? "timeline_possession" : null,
    });
  }

  // Row 5: scope gap → escalate.
  if (scopeGap || judge.scope_gap) return out({ route: "escalate_normal", flags: ["rule_gap", ...frustrated] });

  // Row 6: c1–c3 unclear → ask one question; at most one re-ask per criterion.
  const extraFlags: Flag[] = [];
  for (const c of ["c1", "c2", "c3"] as const) {
    if (criteria[c] !== "unclear") continue;
    if ((ask_counts[c] ?? 0) === 0) {
      ask_counts[c] = 1;
      const question =
        c === "c3"
          ? NEXT_QUESTIONS[c3.ask === "site" ? "site" : "completion"]
          : judge.next_question_for === c && judge.next_question
            ? judge.next_question
            : NEXT_QUESTIONS[c];
      return out({ route: "ask_one_question", next_question: question, flags: frustrated });
    }
    // Already re-asked once.
    if (c === "c3") {
      extraFlags.push("still_unclear");
      continue;
    }
    // c1 → don't send a designer to a project nobody understands; c2 → P3.
    return out({ route: "escalate_normal", flags: frustrated });
  }

  // Row 7 / 8.
  const flags: Flag[] = [...c3.flags, ...extraFlags];
  if (criteria.c5 === "unclear") flags.push("decider_unclear");
  if (criteria.c4 === "unclear") flags.push("budget_unclear");
  if (judge.side_question) flags.push("rule_gap");
  const needsFlag =
    criteria.c4 === "unclear" ||
    criteria.c5 === "unclear" ||
    flags.some((f) => ["timeline_tight", "start_far", "rule_gap", "still_unclear"].includes(f));

  return out({
    route: needsFlag ? "qualified_flag" : "qualified",
    agent_line: flags.includes("timeline_tight") ? "timeline_tight" : null,
    flags: [...flags, ...frustrated], // frustrated is a flag only, never a route change
  });
}
