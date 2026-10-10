// Creates the "Aangan Enquiries" deal pipeline, or, if the plan doesn't allow another pipeline
// (HubSpot free = 1 deal pipeline), adds the stages to the default pipeline. Prints the IDs at the end.
// Usage: npm run hubspot:setup   (needs HUBSPOT_TOKEN in .env)
// Private app scopes needed: crm.objects.contacts.read/write, crm.objects.deals.read/write,
// crm.schemas.deals.read/write (pipelines).
import { config } from "dotenv";
config({ path: ".env" });
import { hubspotRequest as hs } from "../lib/hubspot";

const PIPELINE_LABEL = "Aangan Enquiries";

// probability drives HubSpot's weighted forecast. 1.0 = closed won, 0.0 = closed lost.
const STAGES = [
  { key: "HUBSPOT_STAGE_ID", label: "Consultation booked", probability: "0.2" },
  { key: "HUBSPOT_FOLLOWUP_STAGE_ID", label: "Follow up (not booked)", probability: "0.1" },
  { key: "HUBSPOT_CONTACTED_STAGE_ID", label: "Designer contacted", probability: "0.3" },
  { key: null, label: "Proposal sent", probability: "0.6" },
  { key: null, label: "Closed won", probability: "1.0", isClosed: true },
  { key: null, label: "Closed lost", probability: "0.0", isClosed: true },
];

type Stage = { id: string; label: string; displayOrder: number };
type Pipeline = { id: string; label: string; displayOrder: number; stages: Stage[] };

function stageBody(s: (typeof STAGES)[number], displayOrder: number) {
  return {
    label: s.label,
    displayOrder,
    metadata: { probability: s.probability, ...(s.isClosed ? { isClosed: "true" } : {}) },
  };
}

async function main() {
  const { results } = await hs<{ results: Pipeline[] }>("GET", "/crm/v3/pipelines/deals");
  console.log(`Account has ${results.length} deal pipeline(s): ${results.map((p) => p.label).join(", ")}`);

  let pipeline = results.find((p) => p.label === PIPELINE_LABEL) ?? null;
  let mode = "existing Aangan pipeline";

  if (!pipeline) {
    try {
      pipeline = await hs<Pipeline>("POST", "/crm/v3/pipelines/deals", {
        label: PIPELINE_LABEL,
        displayOrder: results.length,
        stages: STAGES.map((s, i) => stageBody(s, i)),
      });
      mode = "created new pipeline";
    } catch (e) {
      const err = e as Error & { status?: number };
      console.log(`Could not create a new pipeline (${err.status}): ${err.message}`);
      console.log("Your plan most likely allows only one deal pipeline. Adding the stages to the default pipeline instead.");
      pipeline = results.find((p) => p.id === "default") ?? results[0];
      mode = "stages added to default pipeline";
    }
  }

  // Make sure every stage exists (also covers the default-pipeline fallback and re-runs).
  const have = new Map(pipeline.stages.map((s) => [s.label.toLowerCase(), s]));
  let order = Math.max(-1, ...pipeline.stages.map((s) => s.displayOrder)) + 1;
  for (const s of STAGES) {
    if (have.has(s.label.toLowerCase())) continue;
    // The default pipeline already has its own closed won/lost stages; reuse those.
    if (s.isClosed && mode === "stages added to default pipeline") continue;
    const created = await hs<Stage>("POST", `/crm/v3/pipelines/deals/${pipeline.id}/stages`, stageBody(s, order++));
    have.set(s.label.toLowerCase(), created);
    console.log(`  + stage "${s.label}"`);
  }

  console.log(`\nDone (${mode}). Put these in .env and in Vercel:\n`);
  console.log(`HUBSPOT_PIPELINE_ID=${pipeline.id}`);
  for (const s of STAGES) {
    const st = have.get(s.label.toLowerCase());
    if (s.key && st) console.log(`${s.key}=${st.id}`);
  }
  console.log("\nAll stages in this pipeline:");
  const fresh = await hs<Pipeline>("GET", `/crm/v3/pipelines/deals/${pipeline.id}`);
  for (const st of fresh.stages.sort((a, b) => a.displayOrder - b.displayOrder)) console.log(`  ${st.id}  ${st.label}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
