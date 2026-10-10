// Nikhil's dashboard numbers (rubric §8.8), computed from the call log.
import type { CallRow } from "./db";

export interface Metrics {
  calls: number;
  afterHours: number;
  afterHoursBooked: number;
  booked: number;
  bookedSiteVisit: number;
  bookedStudio: number;
  bookingRate: number | null;
  qualified: number;
  qualifiedRate: number | null;
  awaitingFollowUp: CallRow[];
  medianHoursToContact: number | null;
  contactedCount: number;
  outcomes: Record<string, number>;
  closedByReason: Record<string, number>;
  flagCounts: Record<string, number>;
  priceViolations: number;
  costTotal: number;
  costPerCall: number | null;
  costPerBooking: number | null;
  voiceMinutes: number;
  llmTokens: number;
}

const TRACKED_FLAGS = ["timeline_tight", "start_far", "rule_gap", "off_topic", "language", "frustrated", "decider_unclear"];

export function computeMetrics(rows: CallRow[]): Metrics {
  const count = (pred: (r: CallRow) => boolean) => rows.filter(pred).length;
  const isBooked = (r: CallRow) => r.outcome === "booked" || r.outcome === "booked_flag";
  const isQualified = (r: CallRow) => r.route === "qualified" || r.route === "qualified_flag";

  const outcomes: Record<string, number> = {};
  const closedByReason: Record<string, number> = {};
  const flagCounts: Record<string, number> = Object.fromEntries(TRACKED_FLAGS.map((f) => [f, 0]));
  let costTotal = 0;
  let voiceMinutes = 0;
  let llmTokens = 0;
  for (const r of rows) {
    const o = r.outcome ?? "in progress";
    outcomes[o] = (outcomes[o] ?? 0) + 1;
    if (o === "closed") closedByReason[r.close_reason ?? "unknown"] = (closedByReason[r.close_reason ?? "unknown"] ?? 0) + 1;
    for (const f of r.flags ?? []) if (f in flagCounts) flagCounts[f]++;
    costTotal += Number(r.cost_inr ?? 0);
    voiceMinutes += Number(r.voice_minutes ?? 0);
    llmTokens += Number(r.llm_tokens ?? 0);
  }

  // Booking → designer's first contact (the 4× conversion lever).
  const hours = rows
    .filter((r) => isBooked(r) && r.designer_contacted_at)
    .map((r) => (new Date(r.designer_contacted_at!).getTime() - new Date(r.call_ended_at ?? r.started_at).getTime()) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const median = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;

  const booked = count(isBooked);
  const qualified = count(isQualified);
  return {
    calls: rows.length,
    afterHours: count((r) => !!r.is_after_hours),
    afterHoursBooked: count((r) => !!r.is_after_hours && isBooked(r)),
    booked,
    bookedSiteVisit: count((r) => isBooked(r) && r.booking_type === "site_visit"),
    bookedStudio: count((r) => isBooked(r) && r.booking_type === "studio"),
    bookingRate: rows.length ? booked / rows.length : null,
    qualified,
    qualifiedRate: rows.length ? qualified / rows.length : null,
    awaitingFollowUp: rows.filter((r) => r.outcome === "qualified_not_booked" && !r.designer_contacted_at),
    medianHoursToContact: median,
    contactedCount: hours.length,
    outcomes,
    closedByReason,
    flagCounts,
    priceViolations: count((r) => r.price_violation),
    costTotal: Math.round(costTotal * 100) / 100,
    costPerCall: rows.length ? Math.round((costTotal / rows.length) * 100) / 100 : null,
    costPerBooking: booked ? Math.round((costTotal / booked) * 100) / 100 : null,
    voiceMinutes: Math.round(voiceMinutes * 10) / 10,
    llmTokens,
  };
}
