// Sends a clearly-marked TEST handoff note to the designers' chat (and, if set, a test alert to Nikhil's).
// Usage: npx tsx scripts/telegram-test.ts
import { config } from "dotenv";
config({ path: ".env", quiet: true });
import { handoffNote } from "../lib/handoff";
import { contactedButton, sendMessage } from "../lib/telegram";
import type { CallRow } from "../lib/db";

const row = {
  call_id: "demo-test-1",
  route: "qualified_flag",
  caller_number: "+91 98XXX XXX01",
  fields: {
    name: "TEST — sample caller", space_type: "home", scope: "full 3BHK — kitchen, living room, both bedrooms",
    locality: "Kothrud", designed_area_sqft: 1400, completion_text: "by March", decision_maker: "self", consultation_type: "studio",
  },
  completion_date: "2027-03-01",
  site_available_date: null,
  flags: ["timeline_tight"],
  volunteered_budget_inr: null,
  booking_status: "booked",
  booking_type: "studio",
  booking_slot_spoken: "Monday 12 October at 11 am",
  site_address: null,
  summary: "TEST MESSAGE from the Aangan phone-agent setup — not a real lead.\nOwner wants a full redesign of a 3BHK in Kothrud.\nWants it done by March.",
} as unknown as CallRow;

async function main() {
  const designers = process.env.TELEGRAM_DESIGNER_CHAT_ID;
  if (designers && !process.argv.includes("--nikhil-only")) {
    const m = await sendMessage(designers, handoffNote(row, "https://<app>/calls/demo-test-1"), contactedButton("demo-test-1"));
    console.log("designers' chat: sent, message_id", m.message_id);
  }
  const nikhil = process.env.TELEGRAM_NIKHIL_CHAT_ID;
  if (nikhil) {
    const m = await sendMessage(nikhil, "TEST · Nikhil alerts will arrive here (urgent complaints, escalations).");
    console.log("Nikhil's chat: sent, message_id", m.message_id);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
