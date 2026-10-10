// Date convention (§4) and c3 timeline rule (§7.2), checked against the rubric's own numbers.
import { describe, expect, it } from "vitest";
import { parseCompletion, parseSiteAvailable } from "@/lib/dates";
import { computeC3 } from "@/lib/timeline";
import { computeC4, parseBudgetInr } from "@/lib/budget";

describe("date convention §4", () => {
  const cases: [string, string, unknown][] = [
    ["by November", "2026-09-03", { kind: "date", date: "2026-11-01" }],
    ["December", "2026-09-05", { kind: "date", date: "2026-12-01" }],
    ["By 8 November.", "2026-09-08", { kind: "date", date: "2026-11-08" }],
    ["by the end of March", "2026-10-01", { kind: "date", date: "2027-03-31" }],
    ["by June", "2026-10-01", { kind: "date", date: "2027-06-01" }],
    ["by October", "2026-10-10", { kind: "date", date: "2026-10-31" }],
    ["December or January", "2026-10-01", { kind: "date", date: "2026-12-01" }],
    ["done by 1 December", "2026-10-01", { kind: "date", date: "2026-12-01" }],
    ["in 14 weeks", "2026-10-01", { kind: "date", date: "2027-01-07" }],
    ["in 3 weeks", "2026-09-08", { kind: "date", date: "2026-09-29" }],
    ["no deadline, whenever", "2026-10-01", { kind: "no_deadline" }],
    ["before Diwali", "2026-09-08", { kind: "unknown" }],
    ["not sure yet", "2026-10-01", { kind: "unknown" }],
  ];
  it.each(cases)("completion %s (today %s)", (text, today, expected) => {
    expect(parseCompletion(text, today)).toEqual(expected);
  });

  it.each([
    ["now", { kind: "now" }],
    ["we've lived here two years", { kind: "now" }],
    ["new possession", { kind: "now" }],
    ["possession was last month", { kind: "now" }],
    ["possession in 6 weeks", { kind: "date", date: "2026-11-12" }],
    ["possession date not known yet", { kind: "unknown" }],
    ["Bare shell", { kind: "now" }],
    ["getting possession in about six weeks", { kind: "date", date: "2026-11-12" }],
  ])("site %s", (text, expected) => {
    expect(parseSiteAvailable(text, "2026-10-01")).toEqual(expected);
  });
});

describe("c3 timeline rule §7.2", () => {
  it("T02: 'November' on 3 Sep → tight (~8.4 wks)", () => {
    const r = computeC3("by November", null, "2026-09-03");
    expect(r.verdict).toBe("pass");
    expect(r.flags).toEqual(["timeline_tight"]);
  });
  it("T06: 'December' on 5 Sep → pass (~12 wks)", () => {
    expect(computeC3("December", null, "2026-09-05")).toMatchObject({ verdict: "pass", flags: [] });
  });
  it("T07b: needed in 3 weeks → fail (timeline)", () => {
    expect(computeC3("in 3 weeks", null, "2026-09-08")).toMatchObject({ verdict: "fail", failReason: "timeline" });
  });
  it("both dates: possession in 6 wks, completion in 14 wks → tight (8 wks)", () => {
    expect(computeC3("in 14 weeks", "possession in 6 weeks", "2026-10-01")).toMatchObject({
      verdict: "pass",
      flags: ["timeline_tight"],
    });
  });
  it("current month → fail", () => {
    expect(computeC3("by October", null, "2026-10-10")).toMatchObject({ verdict: "fail", failReason: "timeline" });
  });
  it("possession fail: possession 1 Dec, by 1 Jan → timeline_possession", () => {
    expect(computeC3("by 1 January", "possession on 1 December", "2026-10-01")).toMatchObject({
      verdict: "fail",
      failReason: "timeline_possession",
    });
  });
  it("far site: possession in 5 months, no completion → start_far", () => {
    expect(computeC3(null, "possession in 5 months", "2026-10-01")).toMatchObject({ verdict: "pass", flags: ["start_far"] });
  });
  it("no deadline + occupied → pass", () => {
    expect(computeC3("no deadline, whenever", "occupied", "2026-10-01")).toMatchObject({ verdict: "pass", flags: [] });
  });
  it("possession unknown, no completion → unclear (ask site)", () => {
    expect(computeC3(null, "possession date not known yet", "2026-10-01")).toMatchObject({ verdict: "unclear", ask: "site" });
  });
  it("festival only → unclear (ask completion)", () => {
    expect(computeC3("before Diwali", null, "2026-09-08")).toMatchObject({ verdict: "unclear", ask: "completion" });
  });
  it("no completion, site now → pass", () => {
    expect(computeC3(null, "we moved in last year", "2026-10-01")).toMatchObject({ verdict: "pass" });
  });
});

describe("c4 budget §8.3", () => {
  it("T10: ₹1.5L for a flat → fail", () => {
    expect(computeC4(parseBudgetInr("₹1–1.5 lakh"), "home", null)).toBe("fail");
    expect(parseBudgetInr("₹1–1.5 lakh")).toBe(150_000);
  });
  it("₹20 lakh, 1,100 sq ft designed → pass", () => {
    expect(parseBudgetInr("20 lakh")).toBe(2_000_000);
    expect(computeC4(2_000_000, "home", 1100)).toBe("pass");
  });
  it("not mentioned → pass; vague → unclear", () => {
    expect(computeC4(parseBudgetInr(null), "home", null)).toBe("pass");
    expect(computeC4(parseBudgetInr("something reasonable"), "home", null)).toBe("unclear");
  });
  it("5,00,000 parses", () => {
    expect(parseBudgetInr("5,00,000")).toBe(500_000);
  });
});
