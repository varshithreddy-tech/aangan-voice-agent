# Vaani (app.vaanivoice.ai) — what we know and what's still open

Docs: https://docs.vaanivoice.ai (index: /llms.txt)

## Answered by the public docs (built into lib/vaani.ts)
- **Post-call webhook**: Settings → Webhooks, one URL for all events. We use
  `https://<app>/api/call-ended?key=<WEBHOOK_SECRET>` (no signing is documented, so the secret goes in the URL).
  - `call_started`: `room_name`, `phone_number` → caller number
  - `call_ended`: `call_duration` (seconds), `end_reason` (e.g. `AGENT_REQUESTED_DISCONNECT`)
  - `call_postprocessing`: `call_id`, `data.{transcript, summary, entities, recording_url, call_duration (ms), end_reason}`
- **Transcript format**: "AGENT: … USER: …" (parsed into turns).
- **Post-call entity extraction** exists (agent → Analysis tab), so it could also fill fields after the call.
- **Telephony**: one inbound number routes to one agent (Deployment tab).
- **Built-in Cal.com integration** exists (Settings → Integrations), but we keep our own `/api/book` so every
  booking is logged against the call (rubric §8.2b).
- **API** (`X-API-Key`): call history, transcript, call details. Not needed for inbound.

## Answered from the dashboard ("Tools & Actions" → Create Custom Tool), see vaani/tools.md
- Custom tool = POST URL + custom headers (so `x-webhook-secret` works) + query params + typed
  parameters (string/number/boolean/array/object) + "Store Fields as Variables" (JSON path → variable).
- Timeout is configurable (default 120000 ms), so the 4 s `/qualify` budget fits (Q14).

## Still open — confirm on one test call (VAANI_DEBUG_LOG=1)
1. Does the tool request carry the call id (`room_name`) and the caller's number, and under which name?
2. Is `room_name` (webhooks) the same id as `call_postprocessing.call_id`?
3. Can a filler line play while a tool runs?
6. Full list of `end_reason` values (hang-up vs drop, Q14).
7. Pre-speech hook for the price guard? (Not documented → transcript scan, already built.)
8. Cost per minute in ₹ (`VOICE_COST_PER_MIN_INR`), or the "Total Cost" figure from call details.
9. Language setting: can the agent be locked to English?
