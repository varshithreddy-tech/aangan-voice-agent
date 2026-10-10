// Runs the real Neon repo against the TEST branch only (rubric §8.5). Opt-in: RUN_DB=1.
import { describe, expect, it } from "vitest";
import { getRepo } from "@/lib/db";
import { persistQualify, qualify } from "@/lib/qualify";
import { deliver, type DeliveryDeps } from "@/lib/delivery";

const RUN = process.env.RUN_DB === "1" && !!process.env.NEON_TEST_DATABASE_URL;

describe.skipIf(!RUN)("Neon test branch", () => {
  it("qualify → persist → deliver once, with jsonb/array columns round-tripping", async () => {
    const repo = getRepo(true);
    const callId = `it-${Date.now()}`;
    const req = {
      call_id: callId,
      caller_number: "+910000000001",
      fields: { name: "Test", space_type: "home" as const, scope: "full home", locality: "Baner", completion_text: "by November", decision_maker: "self" as const },
      transcript_so_far: "Caller: full home in Baner by November",
      test_today: "2026-09-03",
    };
    const judge = async () => ({
      text: JSON.stringify({ c1: "pass", c1_fail_kind: "none", c2: "pass", c5: "pass", scope_gap: false, scope_gap_reason: null, side_question: null, frustrated: false, summary: "a\nb\nc", next_question: null, next_question_for: "none" }),
      tokens: 123,
    });
    const out = await qualify(req, { repo, isTest: true, model: judge });
    expect(out.result.route).toBe("qualified_flag");
    const row = await persistQualify(repo, req, out, true);
    expect(row.flags).toEqual(["timeline_tight"]);
    expect(row.fields.locality).toBe("Baner");
    expect(row.is_test).toBe(true);
    expect(row.llm_tokens).toBe(123);

    let sends = 0;
    const deps: DeliveryDeps = {
      telegram: { sendMessage: async () => ({ message_id: ++sends }), contactedButton: () => ({ inline_keyboard: [] }), designerChat: () => "x", nikhilChat: () => "y" },
      hubspot: { findContactByPhone: async () => null, createContact: async () => "c1", createDeal: async () => "d1" },
    };
    await Promise.all([deliver(repo, callId, deps), deliver(repo, callId, deps)]); // concurrent duplicates
    expect(sends).toBe(1);
    const after = await repo.get(callId);
    expect(after?.telegram_sent).toBe(true);
    expect(after?.hubspot_id).toBe("d1");
  });
});
