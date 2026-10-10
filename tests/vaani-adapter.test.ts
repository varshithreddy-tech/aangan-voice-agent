// Vaani webhook parsing, using the payload shapes from docs.vaanivoice.ai/guides/webhook-setup.
import { describe, expect, it } from "vitest";
import { parseQualifyRequest, parseVaaniEvent, verifyRequest } from "@/lib/vaani";

describe("Vaani webhook events", () => {
  it("call_started carries the caller's number", () => {
    expect(parseVaaniEvent({ event: "call_started", room_name: "room_123abc", status: "dialing", phone_number: "+919800000001" })).toMatchObject({
      kind: "call_started",
      call_id: "room_123abc",
      caller_number: "+919800000001",
    });
  });

  it("call_ended: duration in seconds, end reason mapped", () => {
    expect(parseVaaniEvent({ event: "call_ended", room_name: "room_123abc", call_duration: 42.5, end_reason: "AGENT_REQUESTED_DISCONNECT" })).toEqual({
      kind: "call_ended",
      call_id: "room_123abc",
      duration_s: 42.5,
      end_reason: "completed",
    });
  });

  it("call_postprocessing: duration in ms, AGENT:/USER: transcript split into turns", () => {
    const ev = parseVaaniEvent({
      event: "call_postprocessing",
      call_id: "room_123abc",
      timestamp: "2026-10-10T13:00:00Z",
      data: {
        room_name: "room_123abc",
        call_id: "room_123abc",
        call_duration: 312000,
        end_reason: "USER_HANGUP",
        summary: "s",
        entities: { name: "Asha" },
        recording_url: "https://rec",
        transcript: "[00:00] AGENT: Good evening, Aangan Studio. How can I help? [00:04] USER: Hi, I have a 2BHK in Baner.\nAGENT: Lovely.",
      },
    });
    expect(ev.kind).toBe("postprocessing");
    if (ev.kind !== "postprocessing") return;
    expect(ev.input.duration_s).toBe(312);
    expect(ev.input.end_reason).toBe("hangup");
    expect(ev.input.transcript).toEqual([
      { role: "agent", text: "Good evening, Aangan Studio. How can I help?" },
      { role: "caller", text: "Hi, I have a 2BHK in Baner." },
      { role: "agent", text: "Lovely." },
    ]);
  });

  it("other events are ignored", () => {
    expect(parseVaaniEvent({ event: "call_ringing", room_name: "r" })).toEqual({ kind: "ignored", event: "call_ringing" });
  });

  it("tool fields: aliases, flat or nested, value clean-up", () => {
    const nested = parseQualifyRequest({
      call_id: "room-1",
      fields: { caller_name: "Kavya", home_or_office: "home", area: "Baner", completion_date: "by March", decision_maker: "authorised", sqft: "1,100 sq ft" },
    });
    expect(nested.fields).toEqual({
      name: "Kavya", space_type: "home", locality: "Baner", completion_text: "by March", decision_maker: "authorised", designed_area_sqft: 1100,
    });
    const flat = parseQualifyRequest({ room_name: "room-2", name: "Arjun", location: "Aundh", area: "1100", scope: "full home", complaint: "true" });
    expect(flat.call_id).toBe("room-2");
    expect(flat.fields).toMatchObject({ name: "Arjun", locality: "Aundh", designed_area_sqft: 1100, scope: "full home", complaint: true });
    // an exact name beats an alias
    expect(parseQualifyRequest({ fields: { locality: "Kothrud", location: "Pune" } }).fields.locality).toBe("Kothrud");
  });

  it("secret accepted from header or ?key=", () => {
    process.env.WEBHOOK_SECRET = "s3cret";
    expect(verifyRequest(new Headers({ "x-webhook-secret": "s3cret" }))).toBe(true);
    expect(verifyRequest(new Headers(), "https://x.test/api/call-ended?key=s3cret")).toBe(true);
    expect(verifyRequest(new Headers(), "https://x.test/api/call-ended?key=nope")).toBe(false);
  });
});
