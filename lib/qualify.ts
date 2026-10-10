// /qualify core (rubric §7, §8.1, §8.2). The HTTP handler is a thin wrapper around this.
import type { Repo, CallRow } from "./db";
import { computeC3 } from "./timeline";
import { computeC4, parseBudgetInr } from "./budget";
import { runJudge, type ModelCall, geminiCall } from "./judge";
import { codeScopeGap, decideRoute, preCheck, type RouteDecision } from "./route";
import { guardSpoken, stripRupeeFigures } from "./priceGuard";
import { inCallbackWindow, isAfterHours, resolveNow, type IstNow } from "./time";
import { EMPTY_FIELDS, type Criteria, type Fields, type QualifyRequest, type QualifyResult } from "./types";

export const QUALIFY_BUDGET_MS = 4000; // §8.2: total, retry included
const PERSIST_MARGIN_MS = 350; // time kept back for the response itself

export interface QualifyDeps {
  repo: Repo;
  model?: ModelCall;
  isTest: boolean;
  /** Overrides the clock (tests). */
  now?: IstNow;
}

/** Later answers win; a null in this request never erases an earlier answer. */
export function mergeFields(stored: Partial<Fields> | undefined, incoming: Partial<Fields>): Fields {
  const merged: Fields = { ...EMPTY_FIELDS, ...(stored ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && v !== "") (merged as unknown as Record<string, unknown>)[k] = v;
  }
  return merged;
}

function plainSummary(f: Fields, kind: "complaint" | "language" | "fallback"): string {
  if (kind === "complaint") {
    return [
      `EXISTING CLIENT COMPLAINT — ${f.name ?? "name not given"}`,
      `Project: ${f.complaint_project ?? "not given"} · Designer: ${f.complaint_designer ?? "not given"}`,
      "Needs a senior callback.",
    ].join("\n");
  }
  if (kind === "language") return `Caller could not continue in English. ${f.name ?? ""}`.trim() + "\nNeeds a callback from the team.";
  return [
    `${f.name ?? "Caller"} · ${f.space_type ?? "space not given"} · ${f.scope ?? "scope not given"}`,
    `Area: ${f.locality ?? "not given"} · Timing: ${f.completion_text ?? "not given"} · Site: ${f.site_available_text ?? "not given"}`,
    "Automatic judging was unavailable on this call; please review the transcript.",
  ].join("\n");
}

export async function qualify(req: QualifyRequest, deps: QualifyDeps): Promise<{ result: QualifyResult; existing: CallRow | null; history: CallRow[]; now: IstNow; fields: Fields }> {
  const started = Date.now();
  const now = deps.now ?? (deps.isTest ? resolveNow(req.test_today, req.test_time) : resolveNow());

  const [existing, history] = await Promise.all([
    deps.repo.get(req.call_id),
    req.caller_number ? deps.repo.history(req.caller_number, req.call_id) : Promise.resolve([] as CallRow[]),
  ]);

  const fields = mergeFields(existing?.fields, req.fields ?? {});
  const ask_counts = (deps.isTest && req.test_ask_counts) || existing?.ask_counts || {};
  const budget = parseBudgetInr(fields.volunteered_budget_inr);
  const budgetNumber = budget !== null && Number.isFinite(budget) ? budget : null;

  const blankCriteria: Criteria = { c1: "unclear", c2: "unclear", c3: "unclear", c4: "pass", c5: "unclear" };
  const finish = (d: RouteDecision, extra: Partial<QualifyResult>): QualifyResult => ({
    route: d.route,
    close_reason: d.close_reason,
    agent_line: d.agent_line,
    next_question: guardSpoken(d.next_question), // §8.6: model-written text is spoken aloud
    flags: d.flags,
    ask_counts: d.ask_counts,
    criteria: blankCriteria,
    volunteered_budget_inr: budgetNumber,
    summary: "",
    completion_date: null,
    site_available_date: null,
    llm_tokens: 0,
    side_question: null,
    ...extra,
  });

  // P1–P3, before Gemini.
  const pre = preCheck({ fields, ask_counts, inCallbackWindow: inCallbackWindow(now) });
  if (pre) {
    const kind = fields.complaint ? "complaint" : fields.language_issue ? "language" : "fallback";
    return { result: finish(pre, { summary: plainSummary(fields, kind) }), existing, history, now, fields };
  }

  // Code: c3, c4, visible scope gaps.
  const c3 = computeC3(fields.completion_text, fields.site_available_text, now.date);
  const c4 = computeC4(budget, fields.space_type, fields.designed_area_sqft);
  const scopeGap = codeScopeGap(fields);

  // Gemini: c1, c2, c5, gaps, summary, next question — within what is left of the 4 s.
  const remaining = QUALIFY_BUDGET_MS - (Date.now() - started) - PERSIST_MARGIN_MS;
  const judged = await runJudge(
    {
      today: now.date,
      fields,
      transcript: req.transcript_so_far ?? "",
      history: history.map((h) => ({ started_at: String(h.started_at), route: h.route, fields: h.fields })),
    },
    remaining,
    deps.model ?? geminiCall,
  );

  const dates = { completion_date: c3.completionDate, site_available_date: c3.siteDate };
  if (!judged.ok) {
    // JSON failed twice, timed out, or errored → escalate_normal (§8.2).
    const d: RouteDecision = { route: "escalate_normal", close_reason: null, next_question: null, agent_line: null, flags: [], ask_counts };
    return {
      result: finish(d, { ...dates, summary: plainSummary(fields, "fallback"), llm_tokens: judged.tokens, criteria: { ...blankCriteria, c3: c3.verdict, c4 } }),
      existing,
      history,
      now,
      fields,
    };
  }

  const { decision, criteria } = decideRoute({ judge: judged.output, c3, c4, scopeGap, ask_counts });
  const gapNote = scopeGap ?? judged.output.scope_gap_reason;
  let summary = stripRupeeFigures(judged.output.summary.trim());
  if (judged.output.side_question && !summary.includes(judged.output.side_question)) {
    summary += `\nSide question to confirm: "${judged.output.side_question}"`;
  }
  if (decision.route === "escalate_normal" && gapNote) summary += `\nScope gap: ${gapNote}`;

  return {
    result: finish(decision, {
      ...dates,
      criteria,
      summary,
      llm_tokens: judged.tokens,
      side_question: judged.output.side_question,
    }),
    existing,
    history,
    now,
    fields,
  };
}

/** Writes the /qualify outcome to the call row (§8.5: /qualify creates or updates the row). */
export async function persistQualify(
  repo: Repo,
  req: QualifyRequest,
  out: Awaited<ReturnType<typeof qualify>>,
  isTest: boolean,
): Promise<CallRow> {
  const { result, existing, history, now, fields } = out;
  return repo.upsert(req.call_id, {
    caller_number: req.caller_number || existing?.caller_number || null,
    previous_call_id: existing?.previous_call_id ?? history[0]?.call_id ?? null,
    is_after_hours: existing?.is_after_hours ?? isAfterHours(now),
    is_test: isTest,
    fields,
    criteria: result.criteria,
    route: result.route,
    close_reason: result.close_reason,
    flags: result.flags,
    ask_counts: result.ask_counts,
    summary: result.summary,
    next_question: result.next_question,
    agent_line: result.agent_line,
    completion_date: result.completion_date,
    site_available_date: result.site_available_date,
    volunteered_budget_inr: result.volunteered_budget_inr,
    site_address: fields.site_address ?? existing?.site_address ?? null,
    llm_tokens: (existing?.llm_tokens ?? 0) + result.llm_tokens,
  });
}
