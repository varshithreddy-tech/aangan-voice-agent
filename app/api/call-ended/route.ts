// POST /api/call-ended — Vaani's webhook (Settings → Webhooks), which receives every event
// (rubric §3 step 9, §8.5):
//   call_started        → caller's number + start time
//   call_ended          → duration + end reason
//   call_postprocessing → transcript etc.; completes the row, THEN sends Telegram + HubSpot
// Configure in Vaani as: https://<app>/api/call-ended?key=<WEBHOOK_SECRET>
import { after } from "next/server";
import { getRepo } from "@/lib/db";
import { sweepPending } from "@/lib/sweep";
import { computeCost, computeOutcome, scanTranscript } from "@/lib/callEnded";
import { deliver } from "@/lib/delivery";
import { appUrl } from "@/lib/env";
import { isAfterHours, istNow } from "@/lib/time";
import { parseVaaniEvent, verifyRequest } from "@/lib/vaani";
import type { Flag } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!verifyRequest(request.headers, request.url)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let ev;
  try {
    ev = parseVaaniEvent(await request.json());
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  // Opportunistic backup sweep (the cron only runs daily on the Hobby plan).
  after(() => sweepPending(getRepo(false)).catch((e) => console.error("sweep failed", e)));

  if (ev.kind === "ignored") return Response.json({ ok: true, ignored: ev.event });

  if (ev.kind === "call_started") {
    if (!ev.call_id) return Response.json({ ok: true });
    const repo = getRepo(false);
    const row = await repo.get(ev.call_id);
    await repo.upsert(ev.call_id, {
      caller_number: row?.caller_number ?? ev.caller_number,
      ...(row ? {} : { started_at: ev.at, is_after_hours: isAfterHours(istNow(new Date(ev.at))) }),
    });
    return Response.json({ ok: true });
  }

  if (ev.kind === "call_ended") {
    if (!ev.call_id) return Response.json({ ok: true });
    await getRepo(false).upsert(ev.call_id, { duration_s: ev.duration_s === null ? null : Math.round(ev.duration_s), end_reason: ev.end_reason });
    return Response.json({ ok: true });
  }

  // postprocessing (or our own test shape)
  const input = ev.input;
  if (!input.call_id) return Response.json({ error: "call_id is required" }, { status: 400 });

  const repo = getRepo(input.is_test);
  const row = await repo.get(input.call_id);
  const scan = scanTranscript(input.transcript);
  const endReason = input.end_reason !== "unknown" ? input.end_reason : ((row?.end_reason as typeof input.end_reason) ?? "unknown");
  const { outcome, route, close_reason } = computeOutcome(row, endReason, scan);

  const durationS = input.duration_s ?? row?.duration_s ?? null;
  const voiceMinutes = input.voice_minutes ?? (durationS ? durationS / 60 : 0);
  const llmTokens = row?.llm_tokens ?? 0;
  const cost = input.vaani_cost_inr !== null
    ? Math.round((input.vaani_cost_inr + computeCost(0, llmTokens)) * 100) / 100
    : computeCost(voiceMinutes, llmTokens);

  const flags = new Set<Flag>(row?.flags ?? []);
  if (scan.offTopicCount > 0) flags.add("off_topic");

  const startedAt = row ? undefined : input.started_at ?? new Date(Date.now() - (durationS ?? 0) * 1000).toISOString();
  await repo.upsert(input.call_id, {
    ...(startedAt ? { started_at: startedAt, is_after_hours: isAfterHours(istNow(new Date(startedAt))) } : {}),
    caller_number: row?.caller_number ?? input.caller_number,
    is_test: row?.is_test ?? input.is_test,
    duration_s: durationS,
    transcript: input.transcript,
    transcript_url: `${appUrl()}/calls/${encodeURIComponent(input.call_id)}`,
    recording_url: input.recording_url,
    end_reason: endReason,
    outcome,
    ...(route ? { route, close_reason } : {}),
    flags: [...flags],
    off_topic_count: scan.offTopicCount,
    price_violation: scan.priceViolationLines.length > 0,
    price_violation_lines: scan.priceViolationLines,
    voice_minutes: Math.round(voiceMinutes * 100) / 100,
    cost_inr: cost,
    call_ended_at: input.ended_at ?? new Date().toISOString(),
  });

  // Telegram note + HubSpot record, at most once each (a second webhook changes nothing).
  const delivery = input.is_test ? null : await deliver(repo, input.call_id);
  return Response.json({ ok: true, outcome, delivery });
}
