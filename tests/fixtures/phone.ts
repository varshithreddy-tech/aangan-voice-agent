// Suite 1 — the September 2026 phone transcripts T01–T20 (rubric §9).
// TESTS ONLY, never examples (§11). Fields come from the CALLER's words only; the front desk's
// lines stay in the transcript so the judge is tested on ignoring them (T07 "three weeks away",
// T13 "3×", T02/T13 "the consultation is free", T18 "500 sq ft minimum").
// T08 (missed call, 10:47pm) can't be replayed: it is a live smoke test.
import type { Fixture } from "./synthetic";

const PASS = { c1: "pass", c2: "pass", c5: "pass" } as const;

export const PHONE: Fixture[] = [
  {
    id: "T01",
    today: "2026-09-02",
    fields: {
      name: "Priya", space_type: "home", scope: "redo the whole 3BHK — kitchen, living room, both bedrooms",
      locality: "Kothrud (Dahanukar Colony)", flat_area_sqft: 1400, designed_area_sqft: 1400,
      completion_text: "We'd like to be done by March. We're in no rush.", site_available_text: "We bought it two years ago",
      decision_maker: "self",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi, I'm Priya. I got your number from a friend — Shruti Joshi. She had her flat done by you in Aundh.
Front Desk: Of course — thank you for calling. What are you looking to do?
Caller: We have a 3BHK in Kothrud — Dahanukar Colony. We bought it two years ago and it still looks like the builder flat. We want to redo the whole thing — kitchen, living room, both bedrooms.
Front Desk: That sounds like a complete redesign. How big is the apartment?
Caller: About 1,400 sq ft carpet.
Front Desk: And your timeline?
Caller: We'd like to be done by March. We're in no rush.
Front Desk: Perfect. Are you the owner?
Caller: Yes — myself and my husband. He knows we're calling and is happy to go ahead.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T02",
    today: "2026-09-03",
    fields: {
      space_type: "home", scope: "full redesign — modular kitchen, wardrobes, living room, both bedrooms",
      locality: "Wakad", designed_area_sqft: 950, completion_text: "We move in November",
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi. I was looking at your work on Instagram. I have a 2BHK in Wakad — can you tell me roughly how much something like that would cost?
Front Desk: Our pricing depends on the materials and the scope — the best way to get a clear picture is a consultation with one of our designers, who can walk you through everything. What are you planning to do?
Caller: Full redesign — modular kitchen, wardrobes, living room, both bedrooms. About 950 sq ft.
Front Desk: Good scope. What's your timeline?
Caller: We move in November — so maybe starting design from October?
Front Desk: That works well. Shall I set up a consultation?
Caller: Yes, but can you give me a rough ballpark first? Even a range?
Front Desk: I genuinely can't — it varies quite a bit based on materials. Giving you a number without seeing the site would be misleading. The designer will go through all of that with you — the consultation is free and there's no obligation.
Caller: Okay, fair enough. Let's book it.`,
    judge: PASS,
    expect: { route: "qualified_flag", flags: ["timeline_tight"], agent_line: "timeline_tight" },
  },
  {
    id: "T03",
    today: "2026-09-03",
    fields: { name: "Suresh Patil", space_type: "home", scope: "redo my home office and study", locality: "Nashik" },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hello, I saw your work on LinkedIn. My name is Suresh Patil. I'm in Nashik — would you be able to take on a project here? I want to redo my home office and study.
Front Desk: Thank you for calling. We only work in Pune and PCMC at the moment — we don't have the vendor network to take on projects outside Pune.
Caller: Not even for a smaller project?
Front Desk: Even for a smaller project, our execution depends on our contractors being on-site. I'm sorry we can't help.
Caller: Alright, understood. Thanks.`,
    judge: { c1: "pass", c2: "fail", c5: "pass" },
    expect: { route: "close", close_reason: "area" },
  },
  {
    id: "T04",
    today: "2026-09-04",
    fields: { space_type: "home", scope: "ideas for our living room — suggestions on colours, furniture arrangement, what to change; not the full thing" },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi — can someone come and give us some ideas for our living room? We're not planning to do the full thing right now. Just want suggestions on colours, furniture arrangement, what to change.
Front Desk: We're a full-service studio — our projects include design and execution together. We don't do advisory or consultation-only visits. If you're planning a full redesign with execution, we'd be a great fit.
Caller: Oh I see. No, we're just exploring for now. Maybe later.`,
    judge: { c1: "fail", c1_fail_kind: "advice_only", c2: "unclear", c5: "pass" },
    expect: { route: "close", close_reason: "advice_only" },
  },
  {
    id: "T05",
    today: "2026-09-05",
    fields: {
      name: "Aarti Mehta", space_type: "home", scope: "complete redesign of 4BHK — new flooring, kitchen, all four bedrooms",
      locality: "Koregaon Park", designed_area_sqft: 2400, completion_text: "move back in by February. About 4 months.",
      site_available_text: "We've already moved out temporarily", consultation_type: "site_visit",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi, this is Aarti Mehta. Vikram Agarwal asked me to call — he's a close friend of Nikhil's.
Front Desk: Of course, thank you. What are you looking for?
Caller: We have a 4BHK in Koregaon Park — about 2,400 sq ft carpet. Complete redesign. New flooring, kitchen, all four bedrooms. We've already moved out temporarily.
Front Desk: That's a significant project. Do you have a timeline?
Caller: We want to move back in by February. About 4 months.
Front Desk: That should work well. Would you prefer a site visit for the consultation?
Caller: Yes please — Vikram said your team does that.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T06",
    today: "2026-09-05",
    fields: {
      space_type: "office", scope: "full office fitout from bare shell — workstations for 20, a cabin, a meeting room, a break area",
      locality: "Baner", designed_area_sqft: 800, completion_text: "operational by December", site_available_text: "Bare shell",
      decision_maker: "self",
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi, I'm calling about a commercial project. We're a startup — just got our first proper office space in Baner. About 800 sq ft. We need workstations for 20 people, a small cabin, a meeting room, and a break area.
Front Desk: We do commercial fitouts up to about 3,000 sq ft. What's the state of the space right now?
Caller: Bare shell — just columns and floor. Nothing else.
Front Desk: Full fitout from scratch. And the timeline?
Caller: We want to be operational by December. Our team is working from home currently.
Front Desk: December is doable. Are you the decision-maker for this?
Caller: Yes, I'm the founder.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T07",
    today: "2026-09-08",
    fields: { space_type: "home", scope: "redo my living room and kitchen", completion_text: "before Diwali" },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hello — I want to redo my living room and kitchen before Diwali. Can you take it up?
Front Desk: Diwali is about three weeks away. Our design phase alone takes 3–4 weeks, and execution follows. We couldn't do justice to a project in that time.
Caller: Even just the living room?
Front Desk: Even so — a room redesign with execution takes at least 8–10 weeks from start to finish. We wouldn't want to rush it.
Caller: What if I start after Diwali?`,
    judge: { c1: "pass", c2: "unclear", c5: "pass", next_question: "Which area is the property in?", next_question_for: "c2" },
    expect: { route: "ask_one_question" },
    then: {
      fields: { locality: "Kothrud", completion_text: "By 8 November." },
      transcript: "Caller: Kothrud. By 8 November.",
      judge: PASS,
      expect: { route: "qualified_flag", flags: ["timeline_tight"], agent_line: "timeline_tight" },
    },
  },
  {
    id: "T09",
    today: "2026-09-10",
    time: "11:32",
    fields: { complaint: true, name: "Sheetal Deshpande", complaint_designer: "Aryan", complaint_project: "2BHK Viman Nagar" },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: I need to speak to someone right now. My project has been going for three months and my designer hasn't replied in five days. This is not acceptable.
Front Desk: I'm very sorry. Can I take your name and project details?
Caller: Sheetal Deshpande. My designer is Aryan. Flat in Viman Nagar — 2BHK. I've sent three messages and called twice.`,
    judge: PASS,
    expect: { route: "escalate_urgent", agent_line: "callback_15min" },
  },
  {
    id: "T10",
    today: "2026-09-11",
    fields: {
      space_type: "home", scope: "the kitchen and one bedroom", locality: "Kharadi", flat_area_sqft: 550,
      volunteered_budget_inr: "1 to 1.5 lakh maximum for everything",
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi. I have a 1BHK in Kharadi — about 550 sq ft. I want to do the kitchen and one bedroom. My budget is 1 to 1.5 lakh maximum for everything. Is that possible with you?`,
    judge: PASS,
    expect: { route: "close", close_reason: "budget" },
  },
  {
    id: "T11",
    today: "2026-09-12",
    fields: {
      space_type: "home", scope: "properly design the living room, bedroom, and kitchen — no structural changes (rented)",
      locality: "Baner", site_available_text: "I've been here a year",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi — I have a question. I'm in a rented apartment. Can you still take up a project?
Front Desk: It depends on the scope. What are you looking to do?
Caller: It's a 2BHK in Baner. I've been here a year, I have a 3-year lease, and the place is quite bare. I want to properly design the living room, bedroom, and kitchen — no structural changes, just design and fittings.
Front Desk: That's fine — we've done rented apartments before. Have you checked with your landlord?
Caller: Yes — they're fine with it as long as we don't break walls.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T12",
    today: "2026-09-15",
    fields: {
      name: "Anand Sharma", space_type: "home", scope: "villa, ground plus two floors — full end-to-end design",
      locality: "Kalyani Nagar", designed_area_sqft: 5500, site_available_text: "Possession was last month. Completely empty.",
      completion_text: "March next year to move in. No rush.", decision_maker: "self", consultation_type: "site_visit",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: I'm calling about a villa project in Kalyani Nagar. My name is Anand Sharma. The property is about 5,500 sq ft — ground plus two floors. Full end-to-end design.
Front Desk: That's a significant project. Is this a new property or an existing home?
Caller: New construction. Possession was last month. Completely empty.
Front Desk: And your timeline?
Caller: March next year to move in. No rush.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T13",
    today: "2026-09-16",
    fields: {
      space_type: "home", scope: "redo the 3BHK — kitchen, wardrobes in both bedrooms, living room", locality: "Aundh",
      designed_area_sqft: 1100,
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi — I want to redo my flat in Aundh. 3BHK, about 1,100 sq ft. What might it cost?
Front Desk: Our pricing depends on the materials and scope — the designers go through that at the consultation. What are you planning?
Caller: Kitchen, wardrobes in both bedrooms, living room. But seriously — can't you give me even a rough range? I just want to know if we're in the same ballpark.
Front Desk: I really can't give a number that would mean anything without seeing the site and the spec. The difference between a standard and a premium kitchen alone can be 3× the cost. The consultation is free — the designer will give you a proper number by the end of it.
Caller: Fine. Let's book then.`,
    judge: PASS,
    expect: { route: "ask_one_question" },
    then: {
      fields: { completion_text: "By February." },
      transcript: "Caller: By February.",
      expect: { route: "qualified", flags: [] },
    },
  },
  {
    id: "T14",
    today: "2026-09-17",
    fields: {
      space_type: "home", scope: "a proper design for my parents' 3BHK", locality: "Hadapsar",
      site_available_text: "new possession", decision_maker: "someone_else",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi — I wanted to inquire about an interior project for my parents. They have a 3BHK in Hadapsar — new possession. They want a proper design.
Front Desk: That sounds good. Will your parents be involved in the decision?
Caller: Yes — I'm doing the initial checking. They don't really use phones much. I'll tell them about the consultation and they'll decide.
Front Desk: Sure — just so we know: your parents would be at the consultation, right?
Caller: Yes, they would come. I'm just calling to see if it's worth pursuing.`,
    judge: { c1: "pass", c2: "pass", c5: "unclear" },
    expect: { route: "qualified_flag", flags: ["decider_unclear"] },
  },
  {
    id: "T15",
    today: "2026-09-18",
    fields: {
      name: "Smita", space_type: "home", scope: "full home — kitchen, wardrobes, living room", locality: "Undri",
      designed_area_sqft: 875, site_available_text: "getting possession in about six weeks", decision_maker: "self",
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi, I'm Smita. I'm getting possession of my flat in Undri in about six weeks. 2BHK, 875 sq ft. I want to start the design right away.
Front Desk: Six weeks is just enough lead time to get the design finalised before execution begins. What are you planning?
Caller: Full home — kitchen, wardrobes, living room. The full package.
Front Desk: Good scope. Are you the owner?
Caller: Yes — my husband and I. He said to go ahead and book the consultation.
Caller: We can go now — the builder will let us in.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T16",
    today: "2026-09-19",
    fields: { name: "Girish Nair", space_type: "home", locality: "Viman Nagar" },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi — I'd called on Monday about a project. Someone said they'd get back to me. It's been two days.
Front Desk: I'm very sorry. Can I get your name?
Caller: Girish Nair. I called Monday afternoon. I told someone about my 3BHK in Viman Nagar and gave my number.
Front Desk: I apologise — I don't see a note. Can you give me your details again?
Caller: This is not a good sign if you forget before you even start.`,
    judge: { c1: "unclear", c2: "pass", c5: "pass", frustrated: true, next_question: "What would you like done: the full home, or specific rooms?", next_question_for: "c1" },
    expect: { route: "ask_one_question", flags: ["frustrated"] },
    then: {
      fields: { scope: "Full home — kitchen, wardrobes, living room", completion_text: "By March.", decision_maker: "self" },
      transcript: "Caller: Full home — kitchen, wardrobes, living room. By March. Yes, I decide.",
      judge: { c1: "pass", c2: "pass", c5: "pass", frustrated: true },
      expect: { route: "qualified", flags: ["frustrated"] },
    },
  },
  {
    id: "T17",
    today: "2026-09-22",
    fields: {
      name: "Ritu Kapoor", space_type: "home", scope: "kitchen, wardrobes, living room", locality: "Pimple Saudagar",
      flat_area_sqft: 1050, site_available_text: "We've been here two years", completion_text: "Ideally done by March. Plenty of time.",
    },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi — I called just now and got cut off. I'm Ritu Kapoor from Pimple Saudagar. 3BHK, about 1,050 sq ft. We've been here two years but never properly did the interiors. We want to start now.
Front Desk: Thanks for calling back. What are you looking to do?
Caller: Kitchen, wardrobes, living room. We moved in with builder furniture and it's very basic.
Front Desk: Standard full-home scope. Timeline?
Caller: Ideally done by March. Plenty of time.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
  {
    id: "T18",
    today: "2026-09-23",
    fields: {
      space_type: "office", scope: "a 180 sq ft coworking pod — good lighting, a nice desk, some storage",
      designed_area_sqft: 180, decision_maker: "self",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Hi — I run a small coworking space. I have a 180 sq ft pod I want to make look really nice. Good lighting, a nice desk, some storage. Can you help?
Front Desk: Our commercial projects are typically 500 sq ft or more. A 180 sq ft pod is below our minimum scope.
Caller: Not even for a smaller fee?`,
    judge: { c1: "pass", c2: "unclear", c5: "pass", scope_gap: true, scope_gap_reason: "commercial space under ~500 sq ft" },
    expect: { route: "escalate_normal", flags: ["rule_gap"] },
  },
  {
    id: "T19",
    today: "2026-09-24",
    fields: { space_type: "other", scope: "design the interiors of a restaurant I'm opening", locality: "Koregaon Park" },
    transcript: `Front Desk: Good afternoon, Aangan Studio.
Caller: Hi — I'm planning to open a restaurant in Koregaon Park. I've seen your work and I love it. Would you be able to design the interiors?
Front Desk: We appreciate you reaching out. Restaurant and hospitality interiors are outside our current scope.
Caller: Do you know anyone you could refer?`,
    judge: { c1: "fail", c1_fail_kind: "out_of_scope", c2: "pass", c5: "pass" },
    expect: { route: "close", close_reason: "out_of_scope" },
  },
  {
    id: "T20",
    today: "2026-09-25",
    fields: {
      name: "Pooja", space_type: "home", scope: "kitchen, both bedrooms, living room", locality: "Magarpatta (Cybercity area)",
      designed_area_sqft: 900, completion_text: "We're flexible — a January start for execution would be ideal", decision_maker: "self",
    },
    transcript: `Front Desk: Good morning, Aangan Studio.
Caller: Good morning. I'm Pooja. I have a 2BHK in Magarpatta — Cybercity area. We've been wanting to properly design the interiors for a while. Kitchen, both bedrooms, living room. About 900 sq ft.
Front Desk: Good scope for us. How soon are you looking to start?
Caller: We're flexible — a January start for execution would be ideal.
Front Desk: That works well. Are you the owner?
Caller: Yes — my husband and I. We both want to be at the consultation.`,
    judge: PASS,
    expect: { route: "qualified", flags: [] },
  },
];
