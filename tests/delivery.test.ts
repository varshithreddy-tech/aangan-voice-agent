// Delivery tests (rubric §9): no duplicates, cron backup, qualified-not-booked.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { memoryRepo } from "@/lib/db";
import { deliver, type DeliveryDeps } from "@/lib/delivery";
import { computeOutcome, scanTranscript } from "@/lib/callEnded";
import { OFF_TOPIC_GOODBYE, OFF_TOPIC_LINE, PRICE_LINE } from "@/lib/lines";

function fakeDeps() {
  const sent: { chat: string; text: string }[] = [];
  const deals: { stage: string; amountInr: number | null; closeDate: string | null }[] = [];
  const deps: DeliveryDeps = {
    telegram: {
      sendMessage: vi.fn(async (chat: string, text: string) => {
        sent.push({ chat, text });
        return { message_id: sent.length };
      }),
      contactedButton: (id: string) => ({ inline_keyboard: [[{ text: "Contacted ✓", callback_data: `c:${id}` }]] }),
      designerChat: () => "designers",
      nikhilChat: () => "nikhil",
    },
    hubspot: {
      findContactByPhone: vi.fn(async () => null),
      createContact: vi.fn(async () => "contact-1"),
      createDeal: vi.fn(async (d) => {
        deals.push({ stage: d.stage, amountInr: d.amountInr, closeDate: d.closeDate });
        return `deal-${deals.length}`;
      }),
    },
  };
  return { deps, sent, deals };
}

async function seedBooked(repo: ReturnType<typeof memoryRepo>, id: string, extra = {}) {
  await repo.upsert(id, {
    caller_number: "+919800000001",
    route: "qualified",
    fields: { name: "Asha", space_type: "home", scope: "full home, 2BHK", locality: "Baner" },
    booking_status: "booked",
    booking_type: "studio",
    booking_slot_spoken: "Monday 12 October at 11 am",
    completion_date: "2027-03-01",
    summary: "line1\nline2\nline3",
    ...extra,
  });
}

describe("delivery", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    env = { ...process.env };
    process.env.APP_URL = "https://example.test";
    return () => {
      process.env = env;
    };
  });

  it("/call-ended sent twice → exactly one Telegram note and one HubSpot record", async () => {
    const repo = memoryRepo();
    const { deps, sent, deals } = fakeDeps();
    await seedBooked(repo, "dup");
    await deliver(repo, "dup", deps);
    const second = await deliver(repo, "dup", deps);
    expect(sent).toHaveLength(1);
    expect(deals).toHaveLength(1);
    expect(second).toMatchObject({ telegram: "skipped", hubspot: "skipped" });
    expect(sent[0].text).toContain("NEW LEAD · Qualified");
    expect(deals[0]).toEqual({ stage: "booked", amountInr: null, closeDate: "2027-03-01" });
  });

  it("/call-ended never sent → the cron sends one note with 'transcript pending' and one HubSpot record", async () => {
    const repo = memoryRepo();
    const { deps, sent, deals } = fakeDeps();
    await seedBooked(repo, "nocallended", { started_at: new Date(Date.now() - 20 * 60_000).toISOString() });
    const pending = await repo.pendingDeliveries(15);
    expect(pending.map((r) => r.call_id)).toEqual(["nocallended"]);
    for (const r of pending) await deliver(repo, r.call_id, deps);
    for (const r of await repo.pendingDeliveries(15)) await deliver(repo, r.call_id, deps); // next cron run
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("transcript pending");
    expect(deals).toHaveLength(1);
  });

  it("qualified, not booked → outcome qualified_not_booked, note says follow up, deal at follow-up stage", async () => {
    const repo = memoryRepo();
    const { deps, sent, deals } = fakeDeps();
    await seedBooked(repo, "notbooked", { booking_status: null, volunteered_budget_inr: 2_000_000 });
    const row = await repo.get("notbooked");
    expect(computeOutcome(row, "completed", scanTranscript([])).outcome).toBe("qualified_not_booked");
    await deliver(repo, "notbooked", deps);
    expect(sent[0].text).toContain("Caller didn't book: follow up");
    expect(deals[0]).toMatchObject({ stage: "followup", amountInr: 2_000_000 });
  });

  it("booking failed → note says BOOKING FAILED", async () => {
    const repo = memoryRepo();
    const { deps, sent } = fakeDeps();
    await seedBooked(repo, "failed", { booking_status: "failed" });
    await deliver(repo, "failed", deps);
    expect(sent[0].text).toContain("BOOKING FAILED: call to schedule");
  });

  it("escalate_normal → Nikhil gets a note, no HubSpot", async () => {
    const repo = memoryRepo();
    const { deps, sent, deals } = fakeDeps();
    await repo.upsert("esc", { route: "escalate_normal", flags: ["rule_gap"], fields: { scope: "kitchen only" } });
    await deliver(repo, "esc", deps);
    expect(sent).toEqual([expect.objectContaining({ chat: "nikhil" })]);
    expect(deals).toHaveLength(0);
  });

  it("closed calls send nothing", async () => {
    const repo = memoryRepo();
    const { deps, sent, deals } = fakeDeps();
    await repo.upsert("closed", { route: "close", close_reason: "area" });
    await deliver(repo, "closed", deps);
    expect(sent).toHaveLength(0);
    expect(deals).toHaveLength(0);
  });
});

describe("transcript scan (§8.5)", () => {
  it("counts off-topic strikes and the goodbye from agent lines only; flags price lines", () => {
    const scan = scanTranscript([
      { role: "caller", text: "What do you think about BJP?" },
      { role: "agent", text: OFF_TOPIC_LINE },
      { role: "caller", text: "Who made you? 10 lakh?" },
      { role: "agent", text: OFF_TOPIC_LINE },
      { role: "agent", text: OFF_TOPIC_GOODBYE },
      { role: "agent", text: PRICE_LINE },
      { role: "agent", text: "It typically costs around 20 lakh." },
    ]);
    expect(scan.offTopicCount).toBe(3);
    expect(scan.offTopicGoodbye).toBe(true);
    expect(scan.priceViolationLines).toEqual(["It typically costs around 20 lakh."]);
    expect(computeOutcome(null, "completed", scan)).toEqual({ outcome: "closed", route: "close", close_reason: "off_topic" });
  });
});
