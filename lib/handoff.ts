// Text of the Telegram messages (rubric §8.4). Pure functions so they can be tested.
import { isoDate, type CallRow } from "./db";

const FLAG_LABELS: Record<string, string> = {
  timeline_tight: "timeline tight",
  start_far: "site available far off",
  decider_unclear: "decider unclear",
  budget_unclear: "budget unclear",
  still_unclear: "timeline still unclear",
  frustrated: "frustrated repeat caller",
  rule_gap: "rule gap",
  language: "language",
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function dateText(v: unknown): string | null {
  const iso = isoDate(v);
  if (!iso) return null;
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function consultationLine(row: CallRow): string {
  const type =
    row.booking_type === "site_visit" || row.fields.consultation_type === "site_visit"
      ? `site visit${row.site_address ? ` · ${row.site_address}` : ""}`
      : "studio";
  if (row.booking_status === "booked") return `${row.booking_slot_spoken ?? row.booking_slot} · ${type}`;
  if (row.booking_status === "failed") return `BOOKING FAILED: call to schedule · ${type}`;
  return `Caller didn't book: follow up · ${type}`;
}

export function handoffNote(row: CallRow, transcriptLink: string): string {
  const f = row.fields;
  const label = row.route === "qualified_flag" ? "Qualified + flag" : "Qualified";
  const area = f.designed_area_sqft ? ` · ~${f.designed_area_sqft} sq ft` : f.flat_area_sqft ? ` · flat ~${f.flat_area_sqft} sq ft` : "";
  const timeline = row.completion_date ? `${dateText(row.completion_date)} (“${f.completion_text}”)` : f.completion_text ?? "not given";
  const site = row.site_available_date
    ? `possession ${dateText(row.site_available_date)} (“${f.site_available_text}”)`
    : f.site_available_text ?? "available now / not said";
  const decider =
    f.decision_maker === "self" ? "self"
    : f.decision_maker === "authorised" ? "authorised"
    : row.flags.includes("decider_unclear") ? "unclear"
    : "self";
  const budget = row.volunteered_budget_inr ? inr(Number(row.volunteered_budget_inr)) : "not mentioned";
  const flags = row.flags.filter((x) => x !== "language" && x !== "off_topic");
  const flagText = flags.length
    ? flags.map((x) => FLAG_LABELS[x] ?? x).join(" / ")
    : "none";

  return [
    `NEW LEAD · ${label}`,
    `Name: ${f.name ?? "not given"} · Phone: ${row.caller_number ?? "unknown"}`,
    `Project: ${f.space_type ?? "?"} · ${f.scope ?? "scope not given"}${area}`,
    `Area: ${f.locality ?? "not given"}`,
    `Timeline: ${timeline} · Site: ${site}`,
    `Decision-maker: ${decider}`,
    `Budget mentioned by caller: ${budget}`,
    `Flags: ${flagText}`,
    `Consultation: ${consultationLine(row)}`,
    `Summary: ${row.summary ?? ""}`,
    `Transcript: ${transcriptLink}`,
  ].join("\n");
}

export function urgentNote(row: CallRow): string {
  const f = row.fields;
  return [
    "🚨 URGENT · Existing client complaint",
    `Client: ${f.name ?? "name not given"} · Phone: ${row.caller_number ?? "unknown"}`,
    `Project: ${f.complaint_project ?? "not given"}`,
    `Designer: ${f.complaint_designer ?? "not given"}`,
    row.agent_line === "callback_15min"
      ? "Caller was told: someone senior will call back within 15 minutes."
      : "Caller was told: someone senior will call first thing tomorrow morning.",
  ].join("\n");
}

export function escalationNote(row: CallRow, transcriptLink: string): string {
  const f = row.fields;
  const why = row.flags.includes("language")
    ? "Caller couldn't continue in English — needs a callback."
    : row.flags.includes("rule_gap")
      ? "Scope gap: the files don't say whether we take this on."
      : "Couldn't qualify automatically (unclear scope/locality or judge unavailable).";
  return [
    "Escalation · needs a senior person",
    `Name: ${f.name ?? "not given"} · Phone: ${row.caller_number ?? "unknown"}`,
    `Project: ${f.space_type ?? "?"} · ${f.scope ?? "scope not given"} · ${f.locality ?? "area not given"}`,
    `Why: ${why}`,
    `Summary: ${row.summary ?? ""}`,
    `Transcript: ${transcriptLink}`,
  ].join("\n");
}
