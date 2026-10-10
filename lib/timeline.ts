// c3 — timeline rule, computed in code (rubric §7.2). Gemini never does date maths.
import { parseCompletion, parseSiteAvailable, weeksBetween, type CompletionParse, type SiteParse } from "./dates";
import type { Flag, Verdict } from "./types";

export const MIN_WEEKS_FROM_TODAY = 6; // services.md: "cannot begin ... under 6 weeks from today"
export const TIGHT_UNDER_WEEKS = 11; // TODO(Q8): 6–11 weeks → book + timeline_tight
export const SITE_WITHIN_WEEKS = 10; // qualified.md: site available within 8–10 weeks

export interface C3Result {
  verdict: Verdict;
  flags: Flag[];
  failReason: "timeline" | "timeline_possession" | null;
  /** Which date to ask for if unclear. */
  ask: "completion" | "site" | null;
  completion: CompletionParse;
  site: SiteParse;
  completionDate: string | null;
  siteDate: string | null;
  weeksAvailable: number | null;
}

export function computeC3(
  completionText: string | null | undefined,
  siteText: string | null | undefined,
  today: string,
): C3Result {
  const completion = parseCompletion(completionText, today);
  const site = parseSiteAvailable(siteText, today);
  const base = {
    completion,
    site,
    completionDate: completion.kind === "date" ? completion.date : null,
    siteDate: site.kind === "date" ? site.date : null,
    weeksAvailable: null as number | null,
  };
  const r = (verdict: Verdict, extra: Partial<C3Result> = {}): C3Result => ({
    verdict,
    flags: [],
    failReason: null,
    ask: null,
    ...base,
    ...extra,
  });

  // Possession date not known yet → unclear (§4).
  if (site.kind === "unknown") return r("unclear", { ask: "site" });

  // A festival/event, "not sure", or unparseable completion text → unclear; ask for an actual date (H6).
  if (completion.kind === "unknown") return r("unclear", { ask: "completion" });

  const siteFar = site.kind === "date" && weeksBetween(today, site.date) > SITE_WITHIN_WEEKS;

  if (completion.kind === "not_given" || completion.kind === "no_deadline") {
    // Neither date → unclear.
    if (completion.kind === "not_given" && site.kind === "not_given") return r("unclear", { ask: "completion" });
    // TODO(Q2): far-off site passes with start_far; strictly qualified.md would fail it.
    if (siteFar) return r("pass", { flags: ["start_far"] });
    // Site available now / within 10 weeks (or not said, with "no deadline") → pass.
    return r("pass");
  }

  // completion.kind === "date"
  const weeksFromToday = weeksBetween(today, completion.date);
  if (weeksFromToday < MIN_WEEKS_FROM_TODAY) return r("fail", { failReason: "timeline" });

  // Site date not given → counts as today (§4).
  const start = site.kind === "date" && site.date > today ? site.date : today;
  const weeksAvailable = weeksBetween(start, completion.date);
  base.weeksAvailable = weeksAvailable;

  // TODO(Q15): under 6 weeks between possession and completion fails; services.md only says "from today".
  if (weeksAvailable < MIN_WEEKS_FROM_TODAY) {
    return r("fail", { failReason: "timeline_possession", weeksAvailable });
  }

  const flags: Flag[] = [];
  if (weeksAvailable < TIGHT_UNDER_WEEKS) flags.push("timeline_tight");
  if (siteFar) flags.push("start_far");
  return r("pass", { flags, weeksAvailable });
}
