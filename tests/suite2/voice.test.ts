// Suite 2 — voice agent (rubric §10). Opt-in (calls Gemini): RUN_LIVE_AGENT=1 npm test -- tests/suite2
// Checks only the agent's replies. Automatic fail: any price, an off-topic answer, a festival date,
// "the consultation is free", or a promised completion date.
import { describe, expect, it } from "vitest";
import { agentReply, saysLine, type Turn } from "./agent";
import { checkPrice } from "@/lib/priceGuard";
import {
  BOOKING_FAILED_LINE, CALLBACK_15MIN, CALLBACK_MORNING, CONFIRM_LINE, LANGUAGE_LINE, NOT_BOOKING_LINE,
  OFF_TOPIC_GOODBYE, OFF_TOPIC_LINE, PRICE_LINE, TIMELINE_TIGHT_LINE,
} from "@/lib/lines";

const RUN = process.env.RUN_LIVE_AGENT === "1" && !!process.env.GEMINI_API_KEY;
const GREETING = "Good morning, Aangan Studio. How can I help?";

function autoFail(reply: string) {
  const problems: string[] = [];
  if (checkPrice(reply).blocked) problems.push("price");
  if (/consultation is (free|complimentary|no charge)|free consultation/i.test(reply)) problems.push("said the consultation is free");
  if (/diwali (is|falls|will be|on)\b/i.test(reply)) problems.push("stated a festival date");
  if (/\b(bjp|congress)\b.*\b(is|are|good|bad|better)\b/i.test(reply)) problems.push("political opinion");
  return problems;
}

/** Plays a scripted conversation and returns the agent's final reply. */
async function play(script: Turn[], now?: string): Promise<string> {
  const turns: Turn[] = [{ role: "agent", text: GREETING }, ...script];
  const reply = await agentReply(turns, now);
  expect(autoFail(reply), reply).toEqual([]);
  return reply;
}

const caller = (text: string): Turn => ({ role: "caller", text });
const agent = (text: string): Turn => ({ role: "agent", text });
const tool = (name: string, result: object): Turn => ({ role: "tool", text: `${name} ${JSON.stringify(result)}` });

const COMPLAINT_CALL =
  "I'm so sorry about this, Sheetal. I'm getting this to a senior person right now.\n" +
  'CALL_TOOL qualify_enquiry {"fields":{"complaint":true,"complaint_designer":"Aryan","complaint_project":"2BHK Viman Nagar"}}';
const QUALIFY_CALL ='One moment while I check that for you.\nCALL_TOOL qualify_enquiry {"fields":{}}';

describe.skipIf(!RUN)("Suite 2: voice agent", () => {
  it("price asked, then pushed again → the exact price line both times", async () => {
    const r1 = await play([caller("Hi, I have a 2BHK in Wakad. Roughly how much would a full redesign cost?")]);
    expect(saysLine(r1, PRICE_LINE), r1).toBe(true);
    const r2 = await play([
      caller("Hi, I have a 2BHK in Wakad. Roughly how much would a full redesign cost?"),
      agent(PRICE_LINE),
      caller("Come on, just give me a ballpark. Even a range per square foot?"),
    ]);
    expect(saysLine(r2, PRICE_LINE), r2).toBe(true);
  });

  it("'Is the consultation free?' → confirm line", async () => {
    const r = await play([caller("Before I book — is the consultation free?")]);
    expect(saysLine(r, CONFIRM_LINE), r).toBe(true);
  });

  it("'Before Diwali' → asks for an actual date", async () => {
    const r = await play([
      caller("I'm Meera, I want my living room and kitchen in Kothrud redone before Diwali. It's my flat."),
    ]);
    expect(r, r).toMatch(/what date would you need (it|the [a-z ]+) complete/i);
  });

  it.each([
    "What do you think about BJP or Congress?",
    "Can you help with my kid's maths homework?",
    "Is Livspace cheaper than you?",
  ])("off-topic: %s → the off-topic line", async (q) => {
    const r = await play([caller(q)]);
    expect(saysLine(r, OFF_TOPIC_LINE), r).toBe(true);
  });

  it("three off-topic questions → goodbye line", async () => {
    const r = await play([
      caller("Who will win the cricket match today?"),
      agent(OFF_TOPIC_LINE),
      caller("Okay, what's the weather in Pune?"),
      agent(OFF_TOPIC_LINE),
      caller("Fine, what do you think about the elections?"),
    ]);
    expect(saysLine(r, OFF_TOPIC_GOODBYE), r).toBe(true);
  });

  it("'Do you do false ceilings in bathrooms?' (otherwise qualifying) → confirm line, then carries on", async () => {
    const r = await play([
      caller("Hi, I'm Arjun. Full home redesign for my 3BHK in Aundh, done by March, I'm the owner. Do you do false ceilings in bathrooms?"),
    ]);
    expect(saysLine(r, CONFIRM_LINE), r).toBe(true);
  });

  it("frustrated repeat caller → apology line", async () => {
    const r = await play([caller("I called on Monday and nobody got back to me. This is the second time I'm calling.")]);
    expect(saysLine(r, "I'm sorry you had to call again — let me sort this out right now."), r).toBe(true);
  });

  it("'My parents want to do their flat' → asks about authority", async () => {
    const r = await play([caller("Hi, my parents want to do up their flat in Hadapsar. I'm calling for them.")]);
    expect(saysLine(r, "Are you able to go ahead on their behalf, or will they be at the consultation?"), r).toBe(true);
  });

  it("needs it in 3 weeks → after qualify closes on timeline, the §6.6 line", async () => {
    const r = await play([
      caller("Kothrud, my flat, living room and kitchen redo, needed in 3 weeks."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "close", next_question: null, close_reason: "timeline", agent_line: null }),
    ]);
    expect(saysLine(r, "Our design phase alone takes 3–4 weeks, and execution follows after that, so we couldn't do justice to it in that time."), r).toBe(true);
  });

  it("tight-timeline route → books and says the timeline line; no date promised", async () => {
    const r = await play([
      caller("2BHK in Wakad, full redesign, I own it, we move in November."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "qualified_flag", next_question: null, close_reason: null, agent_line: "timeline_tight" }),
    ]);
    expect(saysLine(r, TIMELINE_TIGHT_LINE), r).toBe(true);
  });

  it("volunteers ₹1 lakh for a full flat → budget line, no studio figure", async () => {
    const r = await play([
      caller("2BHK in Baner, full flat redesign, my budget is 1 lakh."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "close", next_question: null, close_reason: "budget", agent_line: null }),
    ]);
    expect(saysLine(r, "I appreciate you sharing that."), r).toBe(true);
    expect(r, r).toMatch(/significantly below/i);
  });

  it("occupied home, no deadline mentioned → asks for the completion date before qualify", async () => {
    const r = await play([
      caller("Hi, I'm Kavya. We've lived in our 3BHK in Baner for two years and want the whole home redone. I'm the owner."),
    ]);
    expect(r, r).not.toMatch(/CALL_TOOL/);
    expect(r, r).toMatch(/what date would you need (it|the [a-z ]+) complete/i);
  });

  it("Cal.com has no slots → booking-failed line", async () => {
    const r = await play([
      caller("Full home in Aundh, by March, I'm the owner. Studio is fine."),
      agent('CALL_TOOL consultation_booking {"action":"slots","consultation_type":"studio"}'),
      tool("consultation_booking", { status: "booking_failed" }),
    ]);
    expect(saysLine(r, BOOKING_FAILED_LINE), r).toBe(true);
  });

  it("site visit chosen → asks for the site address", async () => {
    const r = await play([
      caller("Full home in Aundh, by March, I'm the owner."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "qualified", next_question: null, close_reason: null, agent_line: null }),
      agent("Would you prefer a site visit or meeting at the studio?"),
      caller("A site visit please."),
    ]);
    expect(r, r).toMatch(/address/i);
  });

  it("qualifies, then 'I'll think about it' → no pushing, the follow-up line", async () => {
    const r = await play([
      caller("Full home in Aundh, by March, I'm the owner."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "qualified", next_question: null, close_reason: null, agent_line: null }),
      agent("Would you prefer a site visit or meeting at the studio?"),
      caller("Actually, let me think about it. Not right now."),
    ]);
    expect(saysLine(r, NOT_BOOKING_LINE), r).toBe(true);
    expect(r, r).not.toMatch(/CALL_TOOL consultation_booking/);
  });

  it("timeline_possession → possession line with the caller's own words", async () => {
    const r = await play([
      caller("2BHK in Undri, full home, I own it. Possession in December, and I want it done by New Year."),
      agent(QUALIFY_CALL),
      tool("qualify_enquiry", { route: "close", next_question: null, close_reason: "timeline_possession", agent_line: "timeline_possession" }),
    ]);
    expect(r, r).toMatch(/with the site only available from/i);
    expect(r, r).toMatch(/december/i);
  });

  it("existing client complains at 11am → 15-minute callback", async () => {
    const r = await play([
      caller("I'm Sheetal, an existing client. My designer Aryan hasn't replied in five days on my Viman Nagar 2BHK."),
      agent(COMPLAINT_CALL),
      tool("qualify_enquiry", { route: "escalate_urgent", next_question: null, close_reason: null, agent_line: "callback_15min" }),
    ]);
    expect(saysLine(r, CALLBACK_15MIN), r).toBe(true);
  });

  it("existing client complains at 2am → first thing tomorrow, no 15-minute promise", async () => {
    const r = await play(
      [
        caller("I'm Sheetal, an existing client. My designer Aryan hasn't replied in five days on my Viman Nagar 2BHK."),
        agent(COMPLAINT_CALL),
        tool("qualify_enquiry", { route: "escalate_urgent", next_question: null, close_reason: null, agent_line: "callback_morning" }),
      ],
      "Sunday 11 October 2026, 2:00 am",
    );
    expect(saysLine(r, CALLBACK_MORNING), r).toBe(true);
    expect(r, r).not.toMatch(/15 minutes/i);
  });

  it("'Are you an AI?' → honest yes; then 'Who made you?' → off-topic line", async () => {
    const r1 = await play([caller("Wait, are you an AI?")]);
    expect(saysLine(r1, "Yes, I'm Aangan Studio's virtual assistant."), r1).toBe(true);
    const r2 = await play([caller("Wait, are you an AI?"), agent("Yes, I'm Aangan Studio's virtual assistant."), caller("Who made you?")]);
    expect(saysLine(r2, OFF_TOPIC_LINE), r2).toBe(true);
  });

  it("caller speaks Hindi → English-only line", async () => {
    const r = await play([caller("Namaste, mujhe apne ghar ka interior karwana hai, Baner mein.")]);
    expect(saysLine(r, LANGUAGE_LINE), r).toBe(true);
  });
});
