// ============================================================================
// VAANI ADAPTER — the ONLY file that knows Vaani's payload shapes.
// ============================================================================
// Platform: Vaani AI (app.vaanivoice.ai, docs.vaanivoice.ai).
// DONE from the public docs (guides/webhook-setup):
//   - parseVaaniEvent(): one webhook URL receives every event; call_started has the
//     caller's phone_number, call_ended has duration (s) + end_reason, and
//     call_postprocessing has transcript/summary/entities/recording (duration in ms).
//   - verifyRequest(): no signing is documented, so the secret may also come as ?key=…
// STILL A STUB (not in the public docs — needs the "Tools & Actions" screen):
//   - parseQualifyRequest() / parseBookRequest(): mid-call tool payloads
//   - toolResponse(): how a tool result must be returned
// See vaani/NEEDED_FROM_VAANI.md.
// ============================================================================
import { envOptional } from "./env";
import type { EndReason } from "./callEnded";
import type { Fields, QualifyRequest, QualifyResponse, TranscriptTurn } from "./types";

export interface BookRequest {
  call_id: string;
  action: "slots" | "book";
  consultation_type: "site_visit" | "studio";
  /** For "book": ISO start from the offered slots, or the 1-based index of the offered slot. */
  slot?: string | number;
  name?: string;
  phone?: string;
  site_address?: string | null;
}

export interface CallEndedInput {
  call_id: string;
  caller_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  transcript: TranscriptTurn[];
  end_reason: EndReason;
  recording_url: string | null;
  /** If Vaani reports its own billed minutes/cost, prefer those over our estimate. */
  voice_minutes: number | null;
  vaani_cost_inr: number | null;
  /** Test harness only: routes the write to the Neon test branch. */
  is_test: boolean;
}

/**
 * §8.7: both Vaani webhooks require the shared secret. Vaani's docs describe no signing or
 * custom headers for the post-call webhook, so the secret may also be put in the URL
 * configured in Vaani: https://<app>/api/call-ended?key=<WEBHOOK_SECRET>
 */
export function verifyRequest(headers: Headers, url?: string): boolean {
  const expected = envOptional("WEBHOOK_SECRET");
  if (!expected) return false;
  const fromQuery = url ? new URL(url).searchParams.get("key") : null;
  const got = headers.get("x-webhook-secret") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? fromQuery;
  return !!got && timingSafeEqual(got, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Unwraps common tool-call envelopes. TODO(Vaani): replace with Vaani's real envelope. */
function unwrap(body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const inner = (b.arguments ?? b.args ?? b.parameters ?? b.input) as Record<string, unknown> | string | undefined;
  const args = typeof inner === "string" ? (JSON.parse(inner) as Record<string, unknown>) : inner;
  return { ...b, ...(args ?? {}) };
}

/**
 * Vaani custom tools (Design → Tools & Actions → Create Custom Tool) are configured with:
 * name, description, POST URL, timeout (ms, default 120000), headers, query params,
 * typed parameters (string|number|boolean|array|object) the agent extracts, and
 * "Store Fields as Variables" (Response JSON Path → variable name).
 * Not documented: whether Vaani adds the call id / caller number to the request.
 * We look in the usual places; set VAANI_DEBUG_LOG=1 to log one raw request and confirm.
 */
function callIdFrom(b: Record<string, unknown>, headers?: Headers): string {
  const fromBody = b.call_id ?? b.room_name ?? b.callId ?? b.roomName ?? b.session_id ?? b.conversation_id;
  const fromHeader =
    headers?.get("x-call-id") ?? headers?.get("x-room-name") ?? headers?.get("x-vaani-call-id") ?? headers?.get("x-session-id");
  return String(fromBody ?? fromHeader ?? "");
}

function callerFrom(b: Record<string, unknown>, headers?: Headers): string {
  return String(b.caller_number ?? b.phone_number ?? b.from_number ?? b.from ?? headers?.get("x-caller-number") ?? "");
}

/** Logs one raw tool request (header names + body) so the real Vaani shape can be confirmed. */
export function debugLogRequest(route: string, headers: Headers, body: unknown): void {
  if (envOptional("VAANI_DEBUG_LOG") !== "1") return;
  const headerNames = [...headers.keys()].filter((k) => !/authorization|cookie|secret|key/i.test(k));
  console.log(`[vaani-debug] ${route} headers=${JSON.stringify(headerNames)} body=${JSON.stringify(body).slice(0, 4000)}`);
}

/**
 * The voice model fills tool parameters itself and doesn't always use our exact names
 * (Suite 2 caught "area", "completion_date", "home_or_office", "caller_name").
 * Accept flat parameters or a nested `fields` object, and map common aliases.
 */
const FIELD_ALIASES: Record<string, keyof Fields> = {
  name: "name", caller_name: "name", customer_name: "name", full_name: "name",
  space_type: "space_type", home_or_office: "space_type", property_type: "space_type", type: "space_type",
  scope: "scope", project_scope: "scope", work: "scope", rooms: "scope", requirement: "scope",
  locality: "locality", area: "locality", location: "locality", site_location: "locality", city: "locality", property_location: "locality",
  completion_text: "completion_text", completion_date: "completion_text", deadline: "completion_text", timeline: "completion_text", completion: "completion_text",
  site_available_text: "site_available_text", site_availability: "site_available_text", possession: "site_available_text", possession_date: "site_available_text", site_available: "site_available_text",
  designed_area_sqft: "designed_area_sqft", sqft: "designed_area_sqft", area_sqft: "designed_area_sqft", size_sqft: "designed_area_sqft",
  flat_area_sqft: "flat_area_sqft", decision_maker: "decision_maker",
  volunteered_budget_inr: "volunteered_budget_inr", budget: "volunteered_budget_inr",
  consultation_type: "consultation_type", site_address: "site_address", address: "site_address",
  complaint: "complaint", complaint_designer: "complaint_designer", designer: "complaint_designer",
  complaint_project: "complaint_project", language_issue: "language_issue", source: "source",
};

function normaliseFields(b: Record<string, unknown>): Partial<Fields> {
  const raw: Record<string, unknown> = {
    ...b,
    ...(typeof b.fields === "string" ? (JSON.parse(b.fields) as Record<string, unknown>) : ((b.fields as Record<string, unknown>) ?? {})),
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    let key = FIELD_ALIASES[k.toLowerCase()];
    if (!key || v === null || v === undefined || v === "") continue;
    // "area" can mean the locality or the size: a number means size.
    if (key === "locality" && /^\s*~?\d[\d,.]*\s*(sq\.?\s*ft|sqft|square feet)?\s*$/i.test(String(v))) key = "designed_area_sqft";
    if (key in out && FIELD_ALIASES[k.toLowerCase()] !== k.toLowerCase()) continue; // an exact name beats an alias
    out[key] = v;
  }
  // Light value clean-up for the enum-ish fields.
  const st = String(out.space_type ?? "").toLowerCase();
  if (st) out.space_type = /office|commercial|clinic|studio/.test(st) ? "office" : /home|flat|apartment|house|villa|residen/.test(st) ? "home" : "other";
  const dm = String(out.decision_maker ?? "").toLowerCase();
  if (dm) out.decision_maker = /someone|other|parent|spouse|not/.test(dm) ? "someone_else" : /author/.test(dm) ? "authorised" : "self";
  const ct = String(out.consultation_type ?? "").toLowerCase();
  if (ct) out.consultation_type = /site|visit|home/.test(ct) ? "site_visit" : "studio";
  for (const k of ["complaint", "language_issue"] as const) if (k in out) out[k] = out[k] === true || out[k] === "true";
  for (const k of ["designed_area_sqft", "flat_area_sqft"] as const) {
    if (k in out) {
      const n = Number(String(out[k]).replace(/[^\d.]/g, ""));
      out[k] = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return out as Partial<Fields>;
}

export function parseQualifyRequest(body: unknown, headers?: Headers): QualifyRequest {
  const b = unwrap(body);
  return {
    call_id: callIdFrom(b, headers),
    caller_number: callerFrom(b, headers),
    fields: normaliseFields(b),
    transcript_so_far: String(b.transcript_so_far ?? ""),
    test_today: b.test_today as string | undefined,
    test_time: b.test_time as string | undefined,
    test_ask_counts: b.test_ask_counts as QualifyRequest["test_ask_counts"],
  };
}

export function parseBookRequest(body: unknown, headers?: Headers): BookRequest {
  const b = unwrap(body);
  return {
    call_id: callIdFrom(b, headers),
    action: b.action === "book" ? "book" : "slots",
    consultation_type: b.consultation_type === "site_visit" ? "site_visit" : "studio",
    slot: b.slot as string | number | undefined,
    name: b.name as string | undefined,
    phone: b.phone as string | undefined,
    site_address: (b.site_address as string | undefined) ?? null,
  };
}

function toTurns(t: unknown): TranscriptTurn[] {
  if (Array.isArray(t)) {
    return t.map((x) => {
      const o = x as Record<string, unknown>;
      const role = String(o.role ?? o.speaker ?? "").toLowerCase();
      return {
        role: ["agent", "assistant", "bot", "ai"].includes(role) ? "agent" : "caller",
        text: String(o.text ?? o.content ?? o.message ?? ""),
      } as TranscriptTurn;
    });
  }
  if (typeof t === "string") {
    // Vaani: "AGENT: … USER: …", possibly with timestamps ("[00:03] AGENT: …") and on one line.
    const re = /(?:\[[^\]]*\]\s*)?\b(AGENT|ASSISTANT|BOT|USER|CALLER|CUSTOMER)\s*:\s*/gi;
    const marks = [...t.matchAll(re)];
    return marks
      .map((m, i) => {
        const start = m.index! + m[0].length;
        const end = i + 1 < marks.length ? marks[i + 1].index! : t.length;
        const text = t.slice(start, end).trim();
        return { role: /user|caller|customer/i.test(m[1]) ? "caller" : "agent", text } as TranscriptTurn;
      })
      .filter((x) => x.text);
  }
  return [];
}

/** Vaani end_reason → ours. Documented example: AGENT_REQUESTED_DISCONNECT. TODO(Q14): confirm the others. */
function mapEndReason(raw: unknown): EndReason {
  const r = String(raw ?? "").toLowerCase();
  if (!r) return "unknown";
  if (/fail|error|sip|network|timeout|drop|lost/.test(r)) return "dropped";
  if (/user|client|participant|caller|customer|hang/.test(r)) return "hangup";
  if (/agent|assistant|complete|normal|idle|max_duration/.test(r)) return "completed";
  return "unknown";
}

const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Our own shape (tests, curl) — kept for the harness. */
export function parseCallEnded(body: unknown): CallEndedInput {
  const b = unwrap(body);
  return {
    call_id: String(b.call_id ?? ""),
    caller_number: (b.caller_number as string | undefined) ?? null,
    started_at: (b.started_at as string | undefined) ?? null,
    ended_at: (b.ended_at as string | undefined) ?? null,
    duration_s: num(b.duration_s ?? b.duration),
    transcript: toTurns(b.transcript),
    end_reason: mapEndReason(b.end_reason ?? b.ended_reason),
    recording_url: (b.recording_url as string | undefined) ?? null,
    voice_minutes: num(b.voice_minutes),
    vaani_cost_inr: num(b.cost_inr),
    is_test: b.is_test === true,
  };
}

export type VaaniEvent =
  | { kind: "call_started"; call_id: string; caller_number: string | null; at: string }
  | { kind: "call_ended"; call_id: string; duration_s: number | null; end_reason: EndReason }
  | { kind: "postprocessing"; input: CallEndedInput; summary: string | null; entities: Record<string, unknown> | null }
  | { kind: "ignored"; event: string };

/**
 * Vaani posts every event to one webhook URL (docs: guides/webhook-setup).
 * TODO(Vaani): confirm on a test call that `room_name` (call_started/call_ended) equals the
 * `call_id` in call_postprocessing and in mid-call tool calls. The docs' example call id is
 * "room-…", which suggests they are the same.
 */
export function parseVaaniEvent(body: unknown): VaaniEvent {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = String(b.event ?? "");
  const data = (b.data ?? {}) as Record<string, unknown>;

  if (!event) {
    // Not a Vaani event: our own /call-ended shape.
    return { kind: "postprocessing", input: parseCallEnded(b), summary: null, entities: null };
  }
  if (event === "call_started") {
    return {
      kind: "call_started",
      call_id: String(b.room_name ?? b.call_id ?? ""),
      caller_number: (b.phone_number as string | undefined) ?? null,
      at: (b.timestamp as string | undefined) ?? new Date().toISOString(),
    };
  }
  if (event === "call_ended") {
    return {
      kind: "call_ended",
      call_id: String(b.room_name ?? b.call_id ?? ""),
      duration_s: num(b.call_duration), // seconds on call_ended
      end_reason: mapEndReason(b.end_reason),
    };
  }
  if (event === "call_postprocessing") {
    const ms = num(data.call_duration); // milliseconds on call_postprocessing
    const entities = data.entities && typeof data.entities === "object" ? (data.entities as Record<string, unknown>) : null;
    return {
      kind: "postprocessing",
      summary: typeof data.summary === "string" ? data.summary : null,
      entities,
      input: {
        call_id: String(data.call_id ?? b.call_id ?? data.room_name ?? ""),
        caller_number: null, // only call_started carries the number
        started_at: null,
        ended_at: (b.timestamp as string | undefined) ?? null,
        duration_s: ms === null ? null : Math.round(ms / 1000),
        transcript: toTurns(data.transcript),
        end_reason: mapEndReason(data.end_reason),
        recording_url: (data.recording_url as string | undefined) ?? null,
        voice_minutes: null,
        vaani_cost_inr: null,
        is_test: false,
      },
    };
  }
  return { kind: "ignored", event };
}

/** What Vaani gets back from a tool call. TODO(Vaani): wrap if Vaani expects e.g. { result: ... }. */
export function toolResponse(payload: QualifyResponse | Record<string, unknown>): Response {
  return Response.json(payload);
}
