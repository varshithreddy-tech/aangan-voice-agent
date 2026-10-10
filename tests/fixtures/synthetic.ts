// Suite 1 synthetic cases (rubric §9). Fields are filled from the CALLER's words only.
// `judge` is what Gemini should return for c1/c2/c5 etc.: used as the mock in the offline run,
// and ignored in the live run (where real Gemini answers and must agree with `expect`).
import type { JudgeOutput } from "@/lib/judge";
import type { AskCounts, Fields, Flag } from "@/lib/types";

export interface Expect {
  route: string;
  close_reason?: string | null;
  agent_line?: string | null;
  flags?: Flag[];
}

export interface Step {
  fields?: Partial<Fields>;
  transcript?: string;
  ask_counts?: AskCounts;
  judge?: Partial<JudgeOutput>;
  expect: Expect;
}

export interface Fixture {
  id: string;
  today: string;
  time?: string; // "HH:MM" IST
  fields: Partial<Fields>;
  transcript: string;
  ask_counts?: AskCounts;
  judge: Partial<JudgeOutput>;
  expect: Expect;
  /** Scripted answers (§9 step 5): applied, then /qualify is called once more. */
  then?: Step;
  /** Mock-only cases (bad JSON, timeout). */
  mock?: "bad_json" | "slow";
}

const owner = { decision_maker: "self" as const, space_type: "home" as const };
const PASS: Partial<JudgeOutput> = { c1: "pass", c2: "pass", c5: "pass" };

export const SYNTHETIC: Fixture[] = [
  {
    id: "Both dates",
    today: "2026-10-01",
    fields: { ...owner, name: "Rahul", scope: "full home, 2BHK", locality: "Baner", site_available_text: "possession in 6 weeks", completion_text: "in 14 weeks" },
    transcript: "Caller: Hi, I'm Rahul. I've bought a 2BHK in Baner, I want the full home done. Possession is in 6 weeks and I want it complete in 14 weeks.",
    judge: PASS,
    expect: { route: "qualified_flag", flags: ["timeline_tight"], agent_line: "timeline_tight" },
  },
  {
    id: "Side question",
    today: "2026-10-01",
    fields: { ...owner, name: "Sneha", scope: "full home, 3BHK", locality: "Aundh", completion_text: "by March" },
    transcript: "Caller: It's my 3BHK in Aundh, full home redesign, we'd like it done by March. Do you do false ceilings in bathrooms?",
    judge: { ...PASS, side_question: "Do you do false ceilings in bathrooms?" },
    expect: { route: "qualified_flag", flags: ["rule_gap"] },
  },
  {
    id: "Kitchen only",
    today: "2026-10-01",
    fields: { ...owner, scope: "only the kitchen, with execution", locality: "Baner", completion_text: "by March" },
    transcript: "Caller: Only my kitchen, with execution. It's in Baner, by March. It's my flat.",
    judge: { ...PASS, scope_gap: true, scope_gap_reason: "kitchen-only job" },
    expect: { route: "escalate_normal", flags: ["rule_gap"] },
  },
  {
    id: "Big office",
    today: "2026-10-01",
    fields: { space_type: "office", decision_maker: "self", scope: "full office fit-out", designed_area_sqft: 4500, locality: "Hinjewadi", completion_text: "April" },
    transcript: "Caller: I'm the founder. We have a 4,500 sq ft office in Hinjewadi, full fit-out, needed by April.",
    judge: { ...PASS, scope_gap: true, scope_gap_reason: "commercial over 3,000 sq ft" },
    expect: { route: "escalate_normal", flags: ["rule_gap"] },
  },
  {
    id: "Far site",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Wakad", site_available_text: "possession in 5 months" },
    transcript: "Caller: My 2BHK in Wakad, full home interiors. Possession is in 5 months.",
    judge: PASS,
    expect: { route: "qualified_flag", flags: ["start_far"] },
  },
  {
    id: "Unlisted locality",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Kharadi", completion_text: "by April" },
    transcript: "Caller: My 2BHK in Kharadi, full home, by April.",
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "Fine budget",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 3BHK", locality: "Aundh", designed_area_sqft: 1100, completion_text: "by March", volunteered_budget_inr: "20 lakh" },
    transcript: "Caller: Our 3BHK in Aundh, full home, about 1,100 sq ft to design. We're thinking 20 lakh. By March.",
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "Still unclear (c3)",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Baner", completion_text: "not sure yet", site_available_text: "possession date not known yet" },
    transcript: "Caller: 2BHK in Baner, full home. I'm not sure yet when; possession date not known yet.",
    ask_counts: { c3: 0 },
    judge: PASS,
    expect: { route: "ask_one_question" },
    then: {
      ask_counts: { c3: 1 },
      fields: { completion_text: "not sure yet" },
      transcript: "Caller: Honestly, not sure yet.",
      expect: { route: "qualified_flag", flags: ["still_unclear"] },
    },
  },
  {
    id: "c1 still unclear",
    today: "2026-10-01",
    fields: { ...owner, locality: "Kothrud", completion_text: "by March" },
    transcript: "Caller: I have a flat in Kothrud, it's mine. I'd want things done by March.",
    ask_counts: { c1: 0 },
    judge: { c1: "unclear", c2: "pass", c5: "pass", next_question: "What would you like done: the full home, or specific rooms?", next_question_for: "c1" },
    expect: { route: "ask_one_question" },
    then: {
      ask_counts: { c1: 1 },
      fields: { scope: "not sure, maybe something" },
      transcript: "Caller: Not sure, maybe something.",
      expect: { route: "escalate_normal" },
    },
  },
  {
    id: "Two fails",
    today: "2026-10-01",
    fields: { space_type: "home", scope: "just want ideas for my living room", locality: "Nashik" },
    transcript: "Caller: I'm in Nashik, I just want ideas for my living room.",
    judge: { c1: "fail", c1_fail_kind: "advice_only", c2: "fail", c5: "pass" },
    expect: { route: "close", close_reason: "multiple" },
  },
  {
    id: "Language",
    today: "2026-10-01",
    fields: { language_issue: true },
    transcript: "Caller: (speaks Marathi)",
    judge: PASS,
    expect: { route: "escalate_normal", flags: ["language"] },
  },
  {
    id: "Locality refused",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", completion_text: "by March" },
    transcript: "Caller: Full home, my 2BHK, by March. I'd rather not say where yet.",
    ask_counts: { c2: 1 },
    judge: { c1: "pass", c2: "unclear", c5: "pass" },
    expect: { route: "escalate_normal" },
  },
  {
    id: "Bad JSON",
    today: "2026-10-01",
    mock: "bad_json",
    fields: { ...owner, scope: "full home", locality: "Baner", completion_text: "by March" },
    transcript: "Caller: Full home in Baner by March.",
    judge: PASS,
    expect: { route: "escalate_normal" },
  },
  {
    id: "Timeout",
    today: "2026-10-01",
    mock: "slow",
    fields: { ...owner, scope: "full home", locality: "Baner", completion_text: "by March" },
    transcript: "Caller: Full home in Baner by March.",
    judge: PASS,
    expect: { route: "escalate_normal" },
  },
  {
    id: "Completion date only",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Hadapsar", completion_text: "done by 1 December" },
    transcript: "Caller: 2BHK in Hadapsar, full home, I want it done by 1 December.",
    judge: PASS,
    expect: { route: "qualified_flag", flags: ["timeline_tight"], agent_line: "timeline_tight" },
  },
  {
    id: "End of month",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 3BHK", locality: "Aundh", completion_text: "by the end of March" },
    transcript: "Caller: 3BHK in Aundh, full home, by the end of March.",
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "Passed month",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Baner", completion_text: "by June" },
    transcript: "Caller: 2BHK in Baner, full home, by June.",
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "Current month",
    today: "2026-10-10",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Aundh", completion_text: "by October" },
    transcript: "Caller: 2BHK in Aundh, full home, by October.",
    judge: PASS,
    expect: { route: "close", close_reason: "timeline" },
  },
  {
    id: "No deadline",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 3BHK", locality: "Wakad", site_available_text: "we live there", completion_text: "no deadline, whenever" },
    transcript: "Caller: Our 3BHK in Wakad, we live there. Full home. No deadline, whenever.",
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "Date range",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Baner", completion_text: "December or January" },
    transcript: "Caller: 2BHK in Baner, full home, December or January.",
    judge: PASS,
    expect: { route: "qualified_flag", flags: ["timeline_tight"], agent_line: "timeline_tight" },
  },
  {
    id: "Possession unknown",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Ravet", site_available_text: "possession date not known yet" },
    transcript: "Caller: 2BHK in Ravet, full home. Possession date not known yet.",
    judge: PASS,
    expect: { route: "ask_one_question" },
  },
  {
    id: "Possession fail",
    today: "2026-10-01",
    fields: { ...owner, scope: "full home, 2BHK", locality: "Undri", site_available_text: "possession on 1 December", completion_text: "by 1 January" },
    transcript: "Caller: 2BHK in Undri, full home. Possession on 1 December, and I want it done by 1 January.",
    judge: PASS,
    expect: { route: "close", close_reason: "timeline_possession", agent_line: "timeline_possession" },
  },
  {
    id: "T07b (synthetic)",
    today: "2026-09-08",
    fields: { ...owner, scope: "living room and kitchen", locality: "Kothrud", completion_text: "in 3 weeks" },
    transcript: "Caller: Kothrud, living room and kitchen, needed in 3 weeks.",
    judge: PASS,
    expect: { route: "close", close_reason: "timeline" },
  },
  {
    id: "Complaint 11:32am",
    today: "2026-09-10",
    time: "11:32",
    fields: { complaint: true, name: "Mrs Kulkarni", complaint_designer: "Aryan", complaint_project: "2BHK Viman Nagar" },
    transcript: "Caller: I'm an existing client, my project with Aryan in Viman Nagar has a problem.",
    judge: PASS,
    expect: { route: "escalate_urgent", agent_line: "callback_15min" },
  },
  {
    id: "Complaint 2am",
    today: "2026-09-10",
    time: "02:00",
    fields: { complaint: true, name: "Mrs Kulkarni", complaint_designer: "Aryan", complaint_project: "2BHK Viman Nagar" },
    transcript: "Caller: I'm an existing client, my project with Aryan in Viman Nagar has a problem.",
    judge: PASS,
    expect: { route: "escalate_urgent", agent_line: "callback_morning" },
  },
];
