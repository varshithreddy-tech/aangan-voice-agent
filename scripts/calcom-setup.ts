// Creates the Cal.com availability schedule and the two event types, then saves their IDs to .env.
// Safe to re-run: existing ones (matched by name/slug) are reused.
// Usage: npm run calcom:setup   (needs CALCOM_API_KEY in .env)
//
// Agreed with Varshith (2026-10-10): both consultations 30 min; bookable Mon–Sat 10:00–19:00 IST;
// studio address is a placeholder until Nikhil confirms it; phone required, email hidden.
import { config } from "dotenv";
config({ path: ".env", quiet: true });
import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.CALCOM_API_KEY;
if (!KEY) {
  console.error("CALCOM_API_KEY is not in .env yet.");
  process.exit(1);
}

const SCHEDULE_NAME = "Aangan consultations";
const STUDIO_ADDRESS = "Aangan Studio, Pune (address to be confirmed)"; // TODO: Nikhil to confirm the real address
const BOOKING_FIELDS = [
  { field: "email", slug: "email", required: false, hidden: true },
  { field: "attendeePhoneNumber", slug: "attendeePhoneNumber", required: true, hidden: false },
];

async function cal<T>(method: string, path: string, version: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cal.com/v2${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "cal-api-version": version, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.status === "error") throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 400)}`);
  return json.data as T;
}

function saveEnv(values: Record<string, string>) {
  let t = readFileSync(".env", "utf8");
  if (!t.endsWith("\n")) t += "\n";
  for (const [k, v] of Object.entries(values)) {
    t = t.replace(new RegExp(`^${k}=.*\\n?`, "m"), "");
    t += `${k}=${v}\n`;
  }
  writeFileSync(".env", t);
}

async function main() {
  // 1. Availability: Mon–Sat 10:00–19:00 IST (not made the account default).
  const schedules = await cal<{ id: number; name: string }[]>("GET", "/schedules", "2024-06-11");
  let schedule = schedules.find((s) => s.name === SCHEDULE_NAME);
  if (!schedule) {
    schedule = await cal<{ id: number; name: string }>("POST", "/schedules", "2024-06-11", {
      name: SCHEDULE_NAME,
      timeZone: "Asia/Kolkata",
      isDefault: false,
      availability: [
        { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], startTime: "10:00", endTime: "19:00" },
      ],
    });
    console.log(`Created schedule "${SCHEDULE_NAME}" (${schedule.id})`);
  } else {
    console.log(`Reusing schedule "${SCHEDULE_NAME}" (${schedule.id})`);
  }

  // 2. Event types.
  const existing = await cal<{ id: number; slug: string; title: string }[]>("GET", "/event-types", "2026-06-12");
  const ensure = async (title: string, slug: string, locations: unknown[]) => {
    const found = existing.find((e) => e.slug === slug);
    if (found) {
      console.log(`Reusing event type "${found.title}" (${found.id})`);
      return found.id;
    }
    const created = await cal<{ id: number }>("POST", "/event-types", "2026-06-12", {
      title,
      slug,
      lengthInMinutes: 30,
      description: "Consultation with an Aangan Studio designer.",
      locations,
      bookingFields: BOOKING_FIELDS,
      scheduleId: schedule!.id,
    });
    console.log(`Created event type "${title}" (${created.id})`);
    return created.id;
  };

  const siteVisit = await ensure("Site visit", "aangan-site-visit", [{ type: "attendeeAddress" }]);
  const studio = await ensure("Studio consultation", "aangan-studio-consultation", [
    { type: "address", address: STUDIO_ADDRESS, public: true },
  ]);

  saveEnv({ CALCOM_EVENT_TYPE_SITE_VISIT: String(siteVisit), CALCOM_EVENT_TYPE_STUDIO: String(studio) });
  console.log(`\nSaved to .env: CALCOM_EVENT_TYPE_SITE_VISIT=${siteVisit}, CALCOM_EVENT_TYPE_STUDIO=${studio}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
