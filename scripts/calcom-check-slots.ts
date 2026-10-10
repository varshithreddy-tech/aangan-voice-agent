// Read-only check: lists the 2–3 slots the agent would offer for each consultation type.
// Usage: npx tsx scripts/calcom-check-slots.ts
import { config } from "dotenv";
config({ path: ".env", quiet: true });
import { getSlots } from "../lib/calcom";

async function main() {
  for (const type of ["site_visit", "studio"] as const) {
    const slots = await getSlots(type);
    console.log(`${type}: ${slots.length ? slots.map((s) => s.spoken).join(" | ") : "NO SLOTS"}`);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
