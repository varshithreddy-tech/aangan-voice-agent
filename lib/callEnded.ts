// /call-ended logic (rubric §8.5): transcript scan, outcome, cost.
import type { CallRow } from "./db";
import { envNumber } from "./env";
import { OFF_TOPIC_GOODBYE, OFF_TOPIC_LINE } from "./lines";
import { checkPrice } from "./priceGuard";
import type { Outcome, TranscriptTurn } from "./types";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const OFF_TOPIC_KEY = squash(OFF_TOPIC_LINE).slice(0, 60);
const GOODBYE_KEY = squash(OFF_TOPIC_GOODBYE).slice(0, 50);

export interface TranscriptScan {
  offTopicCount: number; // §6.9 lines + the goodbye
  offTopicGoodbye: boolean;
  priceViolationLines: string[];
}

/** Computed from the agent's lines only (§8.5), never from the caller's. */
export function scanTranscript(turns: TranscriptTurn[]): TranscriptScan {
  const agent = turns.filter((t) => t.role === "agent").map((t) => t.text);
  const lines = agent.map(squash);
  const strikes = lines.filter((l) => l.includes(OFF_TOPIC_KEY)).length;
  const goodbye = lines.some((l) => l.includes(GOODBYE_KEY));
  return {
    offTopicCount: strikes + (goodbye ? 1 : 0),
    offTopicGoodbye: goodbye,
    priceViolationLines: agent.filter((t) => checkPrice(t).blocked),
  };
}

export type EndReason = "completed" | "hangup" | "dropped" | "unknown";

export function computeOutcome(row: CallRow | null, endReason: EndReason, scan: TranscriptScan): { outcome: Outcome; route?: string; close_reason?: string } {
  const route = row?.route ?? null;
  if (!route) {
    if (scan.offTopicGoodbye) return { outcome: "closed", route: "close", close_reason: "off_topic" };
    if (endReason === "dropped") return { outcome: "dropped" };
    return { outcome: "incomplete" };
  }
  switch (route) {
    case "escalate_urgent":
    case "escalate_normal":
      return { outcome: "escalated" };
    case "close":
      return { outcome: "closed" };
    case "qualified":
    case "qualified_flag":
      if (row?.booking_status === "booked") return { outcome: route === "qualified" ? "booked" : "booked_flag" };
      // Booking failed or the caller didn't want to book yet: both need a designer follow-up.
      return { outcome: "qualified_not_booked" };
    case "ask_one_question":
      // The call ended before the question was answered.
      if (scan.offTopicGoodbye) return { outcome: "closed", route: "close", close_reason: "off_topic" };
      return { outcome: endReason === "dropped" ? "dropped" : "incomplete" };
    default:
      return { outcome: "incomplete" };
  }
}

export function computeCost(voiceMinutes: number, llmTokens: number): number {
  const perMin = envNumber("VOICE_COST_PER_MIN_INR", 0);
  const per1k = envNumber("GEMINI_COST_PER_1K_TOKENS_INR", 0);
  return Math.round((voiceMinutes * perMin + (llmTokens / 1000) * per1k) * 100) / 100;
}
