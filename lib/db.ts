// Data access for the `calls` table. All DB access goes through here (the browser never talks to Neon).
// Tests run against the Neon "test" branch (§8.5) or an in-memory repo.
import { neon } from "@neondatabase/serverless";
import { env } from "./env";
import type { AskCounts, Criteria, Fields, Flag, Outcome, TranscriptTurn } from "./types";

export interface CallRow {
  call_id: string;
  channel: string;
  started_at: string;
  caller_number: string | null;
  previous_call_id: string | null;
  duration_s: number | null;
  is_after_hours: boolean | null;
  fields: Partial<Fields>;
  criteria: Criteria | null;
  route: string | null;
  close_reason: string | null;
  flags: Flag[];
  ask_counts: AskCounts;
  summary: string | null;
  next_question: string | null;
  agent_line: string | null;
  completion_date: string | null;
  site_available_date: string | null;
  volunteered_budget_inr: number | null;
  outcome: Outcome | null;
  end_reason: string | null;
  is_test: boolean;
  designer_contacted_at: string | null;
  site_address: string | null;
  off_topic_count: number;
  price_violation: boolean;
  price_violation_lines: string[];
  offered_slots: { start: string; spoken: string }[] | null;
  booking_status: "booked" | "failed" | null;
  booking_id: string | null;
  booking_type: "site_visit" | "studio" | null;
  booking_slot: string | null;
  booking_slot_spoken: string | null;
  telegram_sent: boolean;
  urgent_alert_sent: boolean;
  telegram_message_id: string | null;
  hubspot_id: string | null;
  hubspot_contact_id: string | null;
  transcript: TranscriptTurn[] | null;
  transcript_url: string | null;
  recording_url: string | null;
  voice_minutes: number | null;
  llm_tokens: number;
  cost_inr: number | null;
  call_ended_at: string | null;
  updated_at: string;
}

export type CallPatch = Partial<Omit<CallRow, "call_id">>;

const JSON_COLS = new Set(["fields", "criteria", "ask_counts", "offered_slots", "transcript"]);
const WRITABLE = new Set<keyof CallRow>([
  "channel", "started_at", "caller_number", "previous_call_id", "duration_s", "is_after_hours", "fields",
  "criteria", "route", "close_reason", "flags", "ask_counts", "summary", "next_question", "agent_line",
  "completion_date", "site_available_date", "volunteered_budget_inr", "outcome", "end_reason", "is_test",
  "designer_contacted_at", "site_address", "off_topic_count", "price_violation", "price_violation_lines",
  "offered_slots", "booking_status", "booking_id", "booking_type", "booking_slot", "booking_slot_spoken",
  "telegram_sent", "urgent_alert_sent", "telegram_message_id", "hubspot_id", "hubspot_contact_id",
  "transcript", "transcript_url", "recording_url", "voice_minutes", "llm_tokens", "cost_inr", "call_ended_at",
]);

/** Boolean columns that can be claimed once (no duplicate notes, §8.5). */
export type ClaimColumn = "telegram_sent" | "urgent_alert_sent";

export interface Repo {
  get(callId: string): Promise<CallRow | null>;
  /** Insert if missing, then apply the patch. */
  upsert(callId: string, patch: CallPatch): Promise<CallRow>;
  update(callId: string, patch: CallPatch): Promise<void>;
  /** Earlier non-test calls from the same number in the last 60 days. */
  history(callerNumber: string, excludeCallId: string): Promise<CallRow[]>;
  /** Atomically flips a false boolean to true; returns false if someone already did. */
  claim(callId: string, column: ClaimColumn): Promise<boolean>;
  release(callId: string, column: ClaimColumn): Promise<void>;
  /** Atomically sets hubspot_id = 'pending' if it is null. */
  claimHubspot(callId: string): Promise<boolean>;
  /** Rows the backup cron must deliver (§8.5). */
  pendingDeliveries(olderThanMinutes: number): Promise<CallRow[]>;
  list(opts: { limit: number; includeTest?: boolean; sinceDays?: number }): Promise<CallRow[]>;
}

// ---------------- Neon ----------------

function neonRepo(url: string): Repo {
  const sql = neon(url);
  const q = async (text: string, params: unknown[] = []) => (await sql.query(text, params)) as Record<string, unknown>[];

  const toParams = (patch: CallPatch) => {
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!WRITABLE.has(k as keyof CallRow) || v === undefined) continue;
      cols.push(k);
      vals.push(JSON_COLS.has(k) && v !== null ? JSON.stringify(v) : v);
    }
    return { cols, vals };
  };

  return {
    async get(callId) {
      const rows = await q("SELECT * FROM calls WHERE call_id = $1", [callId]);
      return (rows[0] as unknown as CallRow) ?? null;
    },
    async upsert(callId, patch) {
      const { cols, vals } = toParams(patch);
      const insertCols = ["call_id", ...cols];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`);
      const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).concat("updated_at = now()");
      const rows = await q(
        `INSERT INTO calls (${insertCols.join(", ")}) VALUES (${placeholders.join(", ")})
         ON CONFLICT (call_id) DO UPDATE SET ${updates.join(", ")} RETURNING *`,
        [callId, ...vals],
      );
      return rows[0] as unknown as CallRow;
    },
    async update(callId, patch) {
      const { cols, vals } = toParams(patch);
      if (!cols.length) return;
      const sets = cols.map((c, i) => `${c} = $${i + 2}`).concat("updated_at = now()");
      await q(`UPDATE calls SET ${sets.join(", ")} WHERE call_id = $1`, [callId, ...vals]);
    },
    async history(callerNumber, excludeCallId) {
      const rows = await q(
        `SELECT * FROM calls WHERE caller_number = $1 AND call_id <> $2 AND is_test = false
           AND started_at > now() - interval '60 days' ORDER BY started_at DESC LIMIT 5`,
        [callerNumber, excludeCallId],
      );
      return rows as unknown as CallRow[];
    },
    async claim(callId, column) {
      const rows = await q(
        `UPDATE calls SET ${column} = true, updated_at = now() WHERE call_id = $1 AND ${column} = false RETURNING call_id`,
        [callId],
      );
      return rows.length === 1;
    },
    async release(callId, column) {
      await q(`UPDATE calls SET ${column} = false, updated_at = now() WHERE call_id = $1`, [callId]);
    },
    async claimHubspot(callId) {
      const rows = await q(
        `UPDATE calls SET hubspot_id = 'pending', updated_at = now() WHERE call_id = $1 AND hubspot_id IS NULL RETURNING call_id`,
        [callId],
      );
      return rows.length === 1;
    },
    async pendingDeliveries(olderThanMinutes) {
      const rows = await q(
        `SELECT * FROM calls
          WHERE telegram_sent = false AND is_test = false
            AND route IN ('qualified', 'qualified_flag', 'escalate_normal')
            AND started_at < now() - ($1 || ' minutes')::interval
            AND started_at > now() - interval '7 days'
          ORDER BY started_at LIMIT 25`,
        [String(olderThanMinutes)],
      );
      return rows as unknown as CallRow[];
    },
    async list({ limit, includeTest, sinceDays }) {
      const rows = await q(
        `SELECT * FROM calls
          WHERE ($2::boolean OR is_test = false)
            AND ($3::int IS NULL OR started_at > now() - make_interval(days => $3::int))
          ORDER BY started_at DESC LIMIT $1`,
        [limit, Boolean(includeTest), sinceDays ?? null],
      );
      return rows as unknown as CallRow[];
    },
  };
}

// ---------------- In-memory (unit tests) ----------------

export function memoryRepo(): Repo & { rows: Map<string, CallRow> } {
  const rows = new Map<string, CallRow>();
  const blank = (callId: string): CallRow => ({
    call_id: callId, channel: "phone", started_at: new Date().toISOString(), caller_number: null,
    previous_call_id: null, duration_s: null, is_after_hours: null, fields: {}, criteria: null, route: null,
    close_reason: null, flags: [], ask_counts: {}, summary: null, next_question: null, agent_line: null,
    completion_date: null, site_available_date: null, volunteered_budget_inr: null, outcome: null,
    end_reason: null, is_test: true, designer_contacted_at: null, site_address: null, off_topic_count: 0,
    price_violation: false, price_violation_lines: [], offered_slots: null, booking_status: null,
    booking_id: null, booking_type: null, booking_slot: null, booking_slot_spoken: null, telegram_sent: false,
    urgent_alert_sent: false, telegram_message_id: null, hubspot_id: null, hubspot_contact_id: null,
    transcript: null, transcript_url: null, recording_url: null, voice_minutes: null, llm_tokens: 0,
    cost_inr: null, call_ended_at: null, updated_at: new Date().toISOString(),
  });
  const apply = (row: CallRow, patch: CallPatch) => {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
    row.updated_at = new Date().toISOString();
  };
  return {
    rows,
    async get(id) {
      return rows.has(id) ? structuredClone(rows.get(id)!) : null;
    },
    async upsert(id, patch) {
      const row = rows.get(id) ?? blank(id);
      apply(row, patch);
      rows.set(id, row);
      return structuredClone(row);
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (row) apply(row, patch);
    },
    async history(num, exclude) {
      return [...rows.values()].filter((r) => r.caller_number === num && r.call_id !== exclude && !r.is_test);
    },
    async claim(id, column) {
      const row = rows.get(id);
      if (!row || row[column]) return false;
      row[column] = true;
      return true;
    },
    async release(id, column) {
      const row = rows.get(id);
      if (row) row[column] = false;
    },
    async claimHubspot(id) {
      const row = rows.get(id);
      if (!row || row.hubspot_id) return false;
      row.hubspot_id = "pending";
      return true;
    },
    async pendingDeliveries(olderThanMinutes) {
      const cutoff = Date.now() - olderThanMinutes * 60_000;
      return [...rows.values()].filter(
        (r) =>
          !r.telegram_sent &&
          ["qualified", "qualified_flag", "escalate_normal"].includes(r.route ?? "") &&
          new Date(r.started_at).getTime() < cutoff,
      );
    },
    async list({ limit }) {
      return [...rows.values()].slice(0, limit);
    },
  };
}

/** The Neon driver may return `date` columns as Date objects; normalise to YYYY-MM-DD. */
export function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    // A Postgres `date` parsed as local midnight: read back the local calendar day.
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

// ---------------- selection ----------------

const cache = new Map<string, Repo>();

/** Test requests always go to the Neon test branch; live calls to production. */
export function getRepo(isTest: boolean): Repo {
  const key = isTest ? "test" : "prod";
  if (!cache.has(key)) {
    cache.set(key, neonRepo(env(isTest ? "NEON_TEST_DATABASE_URL" : "NEON_DATABASE_URL")));
  }
  return cache.get(key)!;
}
