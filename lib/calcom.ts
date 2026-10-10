// Cal.com API v2 (cloud): open slots + booking (rubric §8.2b).
import { env, envOptional } from "./env";

const BASE = "https://api.cal.com/v2";
const TZ = "Asia/Kolkata";

export interface Slot {
  start: string; // ISO with offset, as Cal.com returned it
  spoken: string; // "Monday 12 October at 11 am"
}

function eventTypeId(type: "site_visit" | "studio"): number {
  return Number(env(type === "site_visit" ? "CALCOM_EVENT_TYPE_SITE_VISIT" : "CALCOM_EVENT_TYPE_STUDIO"));
}

export function spokenTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .replace(":00", "")
    .replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
  return `${day} at ${time}`;
}

/** 2–3 open slots over the next two weeks, spread across days where possible. */
export async function getSlots(type: "site_visit" | "studio", now = new Date()): Promise<Slot[]> {
  const start = new Date(now.getTime() + 2 * 3600_000); // not within the next 2 hours
  const end = new Date(now.getTime() + 14 * 86_400_000);
  const qs = new URLSearchParams({
    eventTypeId: String(eventTypeId(type)),
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: TZ,
  });
  const res = await fetch(`${BASE}/slots?${qs}`, {
    headers: { authorization: `Bearer ${env("CALCOM_API_KEY")}`, "cal-api-version": "2024-09-04" },
  });
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: Record<string, ({ start: string } | string)[]> };
  const byDay = Object.entries(json.data ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, slots]) => slots.map((s) => (typeof s === "string" ? s : s.start)));

  // First slot of each of the first 3 days; top up from the first day if fewer days.
  const picked: string[] = byDay.slice(0, 3).map((d) => d[0]).filter(Boolean);
  for (const s of byDay.flat()) {
    if (picked.length >= 3) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.slice(0, 3).map((s) => ({ start: s, spoken: spokenTime(s) }));
}

export interface BookInput {
  type: "site_visit" | "studio";
  start: string;
  name: string;
  phone: string; // international format, e.g. +919822012345
  siteAddress?: string | null;
  callId: string;
}

export async function createBooking(b: BookInput): Promise<{ id: string; uid: string; start: string }> {
  const attendee: Record<string, string> = { name: b.name || "Caller", timeZone: TZ, phoneNumber: b.phone };
  const body: Record<string, unknown> = {
    start: new Date(b.start).toISOString(),
    eventTypeId: eventTypeId(b.type),
    attendee,
    metadata: { call_id: b.callId.slice(0, 500), source: "phone-agent" },
  };
  if (b.type === "site_visit" && b.siteAddress) body.location = { type: "attendeeAddress", address: b.siteAddress };

  const post = () =>
    fetch(`${BASE}/bookings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env("CALCOM_API_KEY")}`,
        "cal-api-version": "2026-02-25",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let res = await post();
  let text = await res.text();
  // Callers give no email. If the event type still insists on one, use a placeholder (agreed).
  if (!res.ok && /email/i.test(text)) {
    const domain = envOptional("CALCOM_PLACEHOLDER_EMAIL_DOMAIN") ?? "example.com";
    attendee.email = `caller-${b.phone.replace(/\D/g, "")}@${domain}`;
    res = await post();
    text = await res.text();
  }
  if (!res.ok) throw new Error(`Cal.com booking ${res.status}: ${text}`);
  const json = JSON.parse(text) as { data: { id: number; uid: string; start?: string } };
  return { id: String(json.data.id), uid: json.data.uid, start: json.data.start ?? b.start };
}
