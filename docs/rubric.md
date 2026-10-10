# Aangan Studio — Voice Agent Rubric (v6)

**For:** Claude Code, building the phone enquiry agent for Aangan Studio (Pune).
**Stack (from the components map):** Vaani Labs (telephony + voice agent) → Vercel API (`/qualify`, `/book`, `/call-ended`, `/telegram-webhook`) → Gemini Flash (classify + route) → Neon Postgres (call log) → Vercel dashboard · Cal.com (booking) · Telegram (designer handoff) · HubSpot (founder pipeline).
**Sources of truth:** `services.md`, `qualified.md`, `pricing.md`. If this rubric and those files disagree, the files win and the conflict is logged — **except** rules marked **[TEMPORARY]**, which apply until Nikhil answers the open question they point to (§12).
**v4 changes:**
- c3 (timeline) and c4 (budget) are computed in code; Gemini judges only c1, c2, c5, rule gaps, the summary and the next question;
- `/qualify` returns an `agent_line`, so the agent knows which special line to say;
- there's a minimum set of fields before the first `/qualify` call, and the completion date is always asked first;
- more date rules: the current month, "no deadline", ranges, an unknown possession date;
- the re-ask cap is one re-ask, counted by `/qualify` only;
- booking failures, a site address field, a Telegram "Contacted" button, HubSpot de-duplication;
- test data is kept out of the real database;
- the test fixtures are fixed.

**v5 changes:**
- booking moves to its own `/api/book` endpoint;
- the Telegram note and HubSpot record are sent from `/call-ended`;
- the server works out today's date and the after-hours flag itself;
- the `agent_line` rule for tests is spelled out;
- Vaani's tool time limit is added to Q14.

**v6 changes:**
- a qualified caller who doesn't want to book yet;
- a backup cron job if `/call-ended` never arrives;
- no duplicate notes if `/call-ended` fires twice.

---

## 1. Who the agent is

- The voice of Aangan Studio's front desk: warm, calm and brief.
- **Language: English only.** If the caller speaks another language: *"I'm sorry, I can only help in English right now — I'll have someone from the team call you back."* → call qualify with `language_issue = true`. Code routes it to **Escalate (normal)** before Gemini is called (§7.3).
- Answers **every** call, any hour, within seconds.
- **Goal of every call:** the caller hangs up with a clear next step. That means a booked consultation, an honest and kind "not a fit", or a promise of a callback from a person.

## 2. Hard rules (never break these)

| # | Rule | Source |
|---|---|---|
| H1 | **Never say any price, cost figure, rate or price multiplier.** No "starts at", "around", "typically" or "roughly" about cost. (Other numbers are fine: weeks, sq ft, phone numbers.) | pricing.md |
| H2 | Every price question, **including a second or third push**, gets exactly: *"Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like."* There is no second price line. | pricing.md: "the only acceptable response" |
| H3 | Asking about price **never disqualifies** a caller. | qualified.md |
| H4 | **Never ask about budget.** Only react if the caller volunteers a number. | qualified.md §4 |
| H5 | **Don't say the consultation is free**, or describe its cost or terms. If asked: *"Let me have someone from the team confirm that for you."* [TEMPORARY, Q6] | not in any file |
| H6 | **Never promise a timeline or completion date.** Never work out festival or event dates. Always ask for an actual date. | services.md; T07 error |
| H7 | Never make commitments, discounts or exceptions on the studio's behalf. | Review Gate |
| H8 | Ask **one question at a time**. | Map |
| H9 | Never invent facts about the studio. If it isn't in the files: *"Let me have someone from the team confirm that for you."* | — |
| H10 | Never answer off-topic questions or give opinions (§6.9). | — |

## 3. Call flow

```
1. Greet       → "Good [morning/afternoon/evening], Aangan Studio. How can I help?"
2. Listen      → let the caller explain; capture whatever they volunteer
3. Complaint?  → existing client: don't ask the qualifying questions; take details;
                 call qualify with complaint = true (§6.1)
4. Fill gaps   → ask only for missing fields (§4), one at a time.
                 ALWAYS ask the completion date (or "no deadline") before the first /qualify,
                 even if the home is occupied, so a 3-week deadline comes out early.
5. /qualify    → call it once the MINIMUM FIELDS are in: scope, locality, and
                 completion_text or site_available_text.
                 (Complaint and language cases call it straight away.)
6. Act on route (§7) → ask one question / close / escalate, or for qualified routes
                 call /api/book (§8.2b) to offer slots and book
7. Confirm     → repeat the next step and the caller's number
8. Close       → thank them; end the call
9. /call-ended → save the transcript, duration, outcome and cost; THEN send the
                 Telegram note and the HubSpot record (they need the slot and transcript link)
```

## 4. Fields to capture

Ask only for what's missing, in this priority:

| Field | Example question | Feeds |
|---|---|---|
| `name` | "May I have your name?" | handoff |
| `phone` | caller ID; confirm at the end | handoff |
| `space_type` | "Is this for a home or an office?" | scope |
| `scope` | "What would you like done: the full home, or specific rooms?" | c1 |
| `locality` | "Which area is the property in?" | c2 |
| `completion_text` | "What date would you need it complete by?" (caller's own words) | c3 |
| `site_available_text` | "Is the site available now, or when do you get possession?" (caller's own words) | c3 |
| `designed_area_sqft` | "Roughly how big is the area being designed?" (callers often only know the flat size; record both if given) | c4, handoff |
| `decision_maker` | "Are you the one deciding on this?" (only if unclear from how they speak) | c5 |
| `volunteered_budget_inr` | **Never ask.** Record only if the caller says it. | c4, handoff |
| `consultation_type` | "Would you prefer a site visit or meeting at the studio?" | Cal.com |
| `site_address` | "What's the address for the site visit?" (only for site visits) | Cal.com, handoff |
| `source` | "How did you hear about us?" (optional, at the end) | dashboard |

**Date convention (applied by the backend in code, never by the agent).** The backend turns the caller's words into a date with a date-parsing library, or a small Gemini call that returns only a date. The rules:

| Caller says | Means |
|---|---|
| "By [month]" or "in [month]" | the 1st of that month |
| "By the end of [month]" | the last day of that month |
| "In N months" | today + N × 4.3 weeks |
| "In N weeks" | today + N weeks |
| The current month ("by October", said in October) | the last day of this month |
| A month that has already passed this year | that month next year |
| A range ("December or January") | the **earlier** date |
| "No deadline", "flexible", "whenever" | no deadline: the completion part of c3 passes |
| "Possession date not known yet" | site date unknown, so c3 is unclear |
| A festival or event ("before Diwali") | **not** a date, so the agent asks for one |

**Site availability:**
- **Available now:** an occupied home ("we've lived here two years", "moved in with builder furniture") or a possession that has already happened ("new possession", "possession was last month").
- **Not said:** if a completion date is given but the site date isn't, assume the site is available today.

## 5. Studio facts the agent may state

- **Does:** end-to-end interior design **with execution** for homes (apartments, houses, villas: a full home, a floor, 2+ rooms, or a single bedroom or living room) and small commercial spaces (offices, clinics, studios up to ~3,000 sq ft). This covers space planning, materials, custom and sourced furniture, lighting, kitchens and wardrobes, and execution with the studio's own contractors.
- **Does not do:** architecture or structural work, decor or styling advice only, standalone furniture sourcing, Vastu consultation only, restaurants, hotels, retail or gyms, or anything outside Pune and PCMC.
- **Service area:** Pune city and PCMC. **Not served:** Talegaon, Lonavala, Nashik, Mumbai, other cities.
- **Timelines:** design takes 3–4 weeks from the first consultation, and execution takes 8–16 weeks after that, depending on size and site readiness.
- **Rented homes** are fine with no structural changes. **Vastu** is built into designs on request.
- **Consultations** can be a site visit or at the studio. [TEMPORARY, Q13: this comes from the transcripts, not the files]

## 6. Special situations

### 6.1 Existing client with a complaint (T09)
- Don't ask the qualifying questions. Apologise sincerely, then take their name, project location and designer's name.
- Call qualify with `complaint = true`. Route: **Escalate (urgent)**, which sends an urgent Telegram to Nikhil.
- **Callback line [TEMPORARY, Q10]:**
  - 9am–9pm: *"Someone senior will call you back within 15 minutes."*
  - Otherwise: *"Someone senior will call you first thing tomorrow morning."*

### 6.2 Repeat or frustrated caller (T16)
- *"I'm sorry you had to call again — let me sort this out right now."* Then continue and book on this call.
- Add the `frustrated` flag. A flag only, **never** a route change.

### 6.3 Calling for someone else (T14)
- Ask: *"Are you able to go ahead on their behalf, or will they be at the consultation?"*
- **Caller says they're authorised** → c5 passes.
- **Only that the decision-maker will attend**, or "just researching for them" → c5 is unclear. Book with the `decider_unclear` flag (qualified.md: "research for in-laws is not sufficient on its own").

### 6.4 Price question (T02, T13)
- The H2 line, every time, word for word. Then offer to book.

### 6.5 Volunteered budget clearly too low (T10)
- *"I appreciate you sharing that. For [scope] with full execution, that would be significantly below what a project like this would cost with us. I wouldn't want to bring you in if the numbers don't align."*
- Never state the studio's price. The threshold is in §8.3 and stays in the backend.

### 6.6 Timeline
- **Needed in under 6 weeks from today:** *"Our design phase alone takes 3–4 weeks, and execution follows after that, so we couldn't do justice to it in that time. If your timeline changes, we'd love to hear from you."*
- **Under 6 weeks between possession and the completion date** [TEMPORARY, Q15]: design can happen before possession, so don't use the line above. Say instead: *"With the site only available from [possession], there wouldn't be enough time to do the work justice before [date]. If your timeline changes, we'd love to hear from you."* Fill `[possession]` and `[date]` with the **caller's own words**, not computed dates.
- **Tight (6–11 weeks)**, flagged by qualify: book it, and say *"Your designer will go through the timeline with you in detail at the consultation."* Never promise a date.
- **Festival or event given instead of a date:** *"What date would you need it complete by?"*

### 6.7 Dropped call (T17)
Not built yet: there's no SMS provider in the stack, and Vaani's outbound calling is unconfirmed (Q11). If the caller rings back, continue from what was already captured.

### 6.8 Scope gaps (the project itself isn't covered by the files)
- This covers a commercial space under ~500 sq ft (T18) [TEMPORARY, Q1] or over 3,000 sq ft [TEMPORARY, Q9], or a kitchen-only or bathroom-only job [TEMPORARY, Q5].
- Don't decide: *"Let me have a senior person confirm whether we can take this on — they'll call you back."*
- Route: **Escalate (normal)**, flag `rule_gap`.

### 6.9 Off-topic questions (stay in scope)
**What counts:** politics, parties, elections ("What do you think about BJP or Congress?"), religion, news, sports, celebrities, general knowledge, maths, coding, weather, medical/legal/financial advice, other companies or competitors, and questions about how the AI works ("Who made you?", "Which model are you?").

**Not off-topic:** studio questions the files don't cover. Those get the confirm line (§6.10), not this one.

**What the agent says (exact line):**
> *"I'm only able to help with interior design enquiries for Aangan Studio. Do you have any enquiries related to interior design?"*

**Three strikes, enforced by the agent in the conversation:** count off-topic questions **in total per call**. The count never resets, even if real questions come in between.
- **1st and 2nd time:** say the line, kindly.
- **3rd time:** *"I'll let you go for now — feel free to call back whenever you'd like to talk about a project. Thank you for calling Aangan Studio."* Then end the call. Route: **Close (off-topic)**. No handoff, no HubSpot.

**"Are you an AI?" / "Am I talking to a person?"** Answer honestly: *"Yes, I'm Aangan Studio's virtual assistant."* Then go back to the project. This is **not** a strike. Follow-ups about how the AI works ("Who made you?") are off-topic and count as strikes.

**Never:** give opinions on any person, party, religion or company; lecture the caller; explain the rules.

### 6.10 Side questions the files don't cover
(e.g. "Do you do false ceilings in bathrooms?") from a caller who otherwise qualifies:
- *"Let me have someone from the team confirm that for you."* Then carry on and **book**.
- Route: **Qualified + flag** (`rule_gap`), with the question written in the handoff note. A side question never costs a booking.

### 6.11 Booking fails mid-call
If Cal.com has no slots or returns an error:
- The agent says: *"Your designer will call you to fix a time that works."*
- `/api/book` returns `booking_failed`. The route stays qualified.
- The Telegram note (sent from `/call-ended`) says **BOOKING FAILED: call to schedule**.

### 6.12 Qualified, but doesn't want to book yet
If the caller qualifies but says "I'll think about it" or "not right now":
- Don't push. Say: *"No problem at all — I'll have your designer give you a call so you have everything you need."*
- Don't call `/api/book`. `outcome` = `qualified_not_booked`.
- The Telegram note says **Caller didn't book: follow up**.
- The HubSpot deal is created at a "Follow up" stage (`HUBSPOT_FOLLOWUP_STAGE_ID`).

## 7. Criteria and routing (returned by `/qualify`)

**Who judges what:**
- **Code:** the pre-checks, **c3** (date maths and week cutoffs), **c4** (budget arithmetic), and the final route table.
- **Gemini Flash:** **c1, c2, c5**, scope gaps and side-question rule gaps, the `summary`, and the `next_question` wording.

Arithmetic stays out of the model, so boundary cases like 8.4 weeks are always computed exactly.

**Facts come only from the caller's words.** Ignore anything the agent or the old front desk said in the transcript: durations, prices, policies, "Diwali is three weeks away". Prefer the `fields` over the transcript wherever both exist.

### 7.1 The five criteria

| # | Criterion | Pass | Fail | Unclear |
|---|---|---|---|---|
| c1 | Real project with execution | Describes redoing, redesigning or fitting out rooms or a space, with no advice-only signal; **execution is implied**. A redo with lighting, furniture and storage counts as a real project. | Clear signal only: "just ideas", "come and advise", "I'll do execution myself", styling or rearranging only, Vastu-only, furniture sourcing with no project, restaurant/hotel/retail/gym/structural. **Size limits and room type are never a c1 fail**; §6.8 handles them. | Hasn't said what they want done |
| c2 | Service area [TEMPORARY, Q7] | Any locality inside Pune city or PCMC, including unlisted ones (Kharadi, Nanded City, Bavdhan, Wagholi, Sus…) | Outside: Talegaon, Chakan, Lonavala, Nashik, Mumbai, other cities | No locality given |
| c3 | Timeline (**code**) | see §7.2 | see §7.2 | Neither date given, only a festival/event, or possession date unknown |
| c4 | Budget (only if volunteered; **code**) | Not mentioned, or plausible | Volunteered and clearly below (§8.3) | Vague ("reasonable") |
| c5 | Decision-maker | Speaks as owner or occupant about their own space ("my flat", "we have a 3BHK", "I'm the founder") with no sign someone else decides, or says they're authorised | — (never a fail) | Calling for someone else without authorisation, or says someone else decides |

### 7.2 Timeline rule (c3)
**Weeks available** = completion date − later of (today, site-available date). If the site date isn't given, it counts as today (§4).

| Situation | Result |
|---|---|
| Completion date under 6 weeks from **today** | **fail** (services.md minimum lead time) |
| Completion date 6+ weeks from today, but under 6 weeks after possession | **fail**, close_reason `timeline_possession` [TEMPORARY, Q15] (services.md only says "from today") |
| 6 to under 11 weeks available | **pass + `timeline_tight`** [TEMPORARY, Q8] (design 3–4 + execution 8–16 makes this tight) |
| 11+ weeks available | **pass** |
| No completion date; site available now (including an occupied home or a possession that's already happened) or within 10 weeks | **pass** (qualified.md: site available within 8–10 weeks) |
| Site available more than 10 weeks from today (with or without a completion date) | **pass + `start_far`** [TEMPORARY, Q2]. Strictly, qualified.md would fail this. |
| Site available now, but the caller *prefers* a later start (T20) | **pass**: a preference, not site availability |
| "No deadline" / "flexible" / "whenever", with the site available now or within 10 weeks | **pass** |
| Neither date, only a festival/event, or "possession date not known yet" | **unclear** |

### 7.3 Route: apply in this exact order, stop at the first match

**Pre-checks in code, before Gemini is called.** They're instant, cost nothing and always give the same result:

| # | Condition | Route |
|---|---|---|
| P1 | `complaint = true` | **Escalate (urgent)** (§6.1) |
| P2 | `language_issue = true` | **Escalate (normal)**, flag `language` |
| P3 | Locality already re-asked once by `/qualify` and still unknown (`ask_counts.c2 ≥ 1`) | **Escalate (normal)** |

**Off-topic is not a judge route.** The agent enforces the 3 strikes itself (§6.9). `/call-ended` records it as `close` / `off_topic`.

**Main routes (code applies this table, using Gemini's c1, c2, c5 and gap check plus code's c3, c4):**

| # | Condition | Route | Agent does |
|---|---|---|---|
| 3 | Two or more criteria fail | **Close (multiple)** | *"This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes."* |
| 4 | Exactly one criterion fails [TEMPORARY, Q3] | **Close (reason)** | The specific closing line (§7.4) |
| 5 | Scope gap (§6.8) | **Escalate (normal)** + `rule_gap` | §6.8 |
| 6 | Any of c1–c3 unclear | **Ask one question** | Ask the single most important `next_question`, in this order: scope → locality → completion date or site availability. Call qualify again. **Cap:** the agent's own question while filling fields doesn't count. `ask_counts` counts only the times `/qualify` returned `ask_one_question` for a criterion (stored in Neon against the `call_id`). **At most one re-ask per criterion.** If still unclear after the re-ask: c3 → Qualified + flag `still_unclear`; c1 → **Escalate (normal)** (don't send a designer to a project nobody understands); c2 → pre-check P3. |
| 7 | c4 or c5 unclear, **or** flag `timeline_tight` / `start_far` / `rule_gap` (side question) / `still_unclear` | **Qualified + flag** | Book; note the flags in the handoff |
| 8 | Otherwise | **Qualified** | Offer Cal.com slots, book, confirm |

`frustrated` is a flag only and never changes the route. Fails are checked **before** unclear answers: there's no point asking where the site is if the caller only wants advice.

### 7.4 Closing lines by reason
- **Area:** *"We only work in Pune and PCMC — our execution depends on our contractors being on-site, so we wouldn't be able to do it justice."*
- **Advice only:** *"We're a full-service studio — our projects include design and execution together. If you decide to go ahead with a full redesign, we'd love to help."*
- **Out of scope:** *"That needs a specialist studio — it's outside what we do."*
- **Timeline:** §6.6 (under 6 weeks from today).
- **Timeline after possession** (`timeline_possession`): §6.6 possession line.
- **Budget:** §6.5.

## 8. Backend contracts

### 8.1 `/qualify` request (Vaani → Vercel API)
Requires the header `x-webhook-secret: $WEBHOOK_SECRET`; reject anything else.
```json
{
  "call_id": "string", "caller_number": "string",
  "test_today": "YYYY-MM-DD (tests only; ignored on live calls)",
  "fields": {
    "name": null, "space_type": "home|office|other|null", "scope": null,
    "locality": null,
    "completion_text": "caller's own words, e.g. 'by March', 'before Diwali', '14 weeks' | null",
    "site_available_text": "caller's own words, e.g. 'now', 'possession in 6 weeks' | null",
    "designed_area_sqft": null, "flat_area_sqft": null,
    "decision_maker": "self|authorised|someone_else|null",
    "volunteered_budget_inr": null, "consultation_type": "site_visit|studio|null",
    "complaint": false, "complaint_designer": null, "complaint_project": null,
    "language_issue": false
  },
  "transcript_so_far": "string"
}
```
- **Today's date and after-hours** are always worked out **by the server in IST**. Live calls never send them. Only the test harness may set `test_today` (and a test time for the complaint cases).
- **Dates:** the voice agent sends the caller's **words**, never a computed date. The backend converts them to `completion_date` and `site_available_date` using the date convention in §4. A festival or event name → null, so c3 is unclear.
- **Caller history:** the backend looks up earlier calls from the same `caller_number` (last 60 days) and adds their fields and route to the judge input. That lets a repeat caller (T16) or a call-back after a drop (T17) carry on without starting over.

### 8.2 `/qualify` response (code + Gemini Flash; Gemini uses its response schema with enums)
```json
{
  "criteria": { "c1": "pass|fail|unclear", "c2": "…", "c3": "…", "c4": "…", "c5": "…" },
  "route": "qualified|ask_one_question|qualified_flag|close|escalate_urgent|escalate_normal",
  "next_question": "string|null",
  "close_reason": "area|advice_only|out_of_scope|timeline|timeline_possession|budget|multiple|null",
  "agent_line": "timeline_tight|timeline_possession|callback_15min|callback_morning|null",
  "flags": ["subset of: timeline_tight, start_far, decider_unclear, budget_unclear, still_unclear, frustrated, rule_gap"],
  "volunteered_budget_inr": "number|null",
  "summary": "3-line summary for the designer — no ₹ figures"
}
```
- Gemini gets qualified.md, services.md and §7 of this rubric, and returns only c1, c2, c5, the scope/side-question gap, `summary` and `next_question`. **Code** adds c3, c4, the pre-checks, the route, `close_reason`, `agent_line` and the flags.
- `off_topic` and `language` are not judge flags: `/call-ended` and pre-check P2 set them directly in Neon.
- `flags` contains **only** the flags that apply.
- JSON parse failure → retry once, then route `escalate_normal`.
- **Time limit:** `/qualify` must answer within **4 seconds** in total, retry included.
  - While it waits, the agent says a filler line: *"One moment while I check that for you."*
  - On a timeout → `escalate_normal`, and the agent says: *"Let me have someone from the team call you back to set this up."*
- **`agent_line`** tells the agent which special line to say:
  - `timeline_tight` → the §6.6 tight line
  - `timeline_possession` → the §6.6 possession line
  - `callback_15min` / `callback_morning` → the §6.1 line, chosen by the server from the IST time

  It contains no prices, so it's safe to send. (`booking_failed` comes from `/api/book`, not from here.)
- **Only `route`, `next_question`, `close_reason` and `agent_line` go back to Vaani.** `criteria`, `flags`, `summary` and `volunteered_budget_inr` stay on the server.
- `next_question` is written by the model and spoken aloud, so it goes through the price guard (§8.6) before it's returned.
- ₹ figures are stripped from `summary` in code. `volunteered_budget_inr` is kept as its own field: it goes to Neon, the Telegram note and the dashboard, and is **never** sent to the voice agent.

### 8.2b `/api/book` (Vaani → Vercel API; same secret header)
The agent calls this only after a qualified or qualified + flag route.
- **`action: "slots"`** with `call_id` and `consultation_type`: returns 2–3 open slots from the right Cal.com event type.
- **`action: "book"`** with `call_id`, the chosen slot, name, phone, and `site_address` for site visits: books it in Cal.com and stores `booking_id` and `booking_type` on the call row.
- On no slots or a Cal.com error, returns `{ "status": "booking_failed" }`. The agent says the §6.11 line.
- Returns `{ "status": "booked", "slot": "<spoken-friendly time>" }` on success.

### 8.3 Internal budget check (code only; never spoken)
"Clearly below" means:
- under **₹3.5 lakh** for any residential scope with execution (the single-room minimum in pricing.md); or
- if the **designed** area is known: under half of (designed sq ft × ₹1,800) for residential, or under half of (sq ft × ₹1,200) for commercial. (The ₹ figures come from pricing.md. The "half of" margin is **our own assumption**: TEMPORARY, Q4.)

If the caller gives a range ("₹1–1.5 lakh"), use the **upper end**. If the designed area is unknown, apply **only** the ₹3.5 lakh floor. Use the designed area (rooms being done), never the whole flat, because pricing.md says "carpet area of designed space".

### 8.4 Handoff note (Telegram → designer; qualified / qualified + flag only; **sent from `/call-ended`**)
```
NEW LEAD · [Qualified / Qualified + flag]
Name: … · Phone: …
Project: [home/office] · [scope] · ~[designed sq ft] sq ft
Area: [locality]
Timeline: [completion date] · Site: [available now / possession date]
Decision-maker: [self / authorised / unclear]
Budget mentioned by caller: [₹… / not mentioned]
Flags: [timeline_tight / start_far / budget unclear / decider unclear / frustrated / rule_gap: "<question>"]
Consultation: [Cal.com slot / BOOKING FAILED: call to schedule / Caller didn't book: follow up] · [site visit + address / studio]
Summary: [3 lines]
Transcript: [link]
[ Contacted ✓ ]  ← inline button
```
- The **Contacted ✓** button calls `/api/telegram-webhook` (its own secret). It records `designer_contacted_at`, which feeds "time from booking to first contact" on the dashboard.
- **Escalate (urgent)** goes to Nikhil **straight away from `/qualify`**, marked URGENT, with the client name, project and designer. It doesn't wait for the call to end.
- **Escalate (normal)** goes to Nikhil from `/call-ended`, not urgent, with the question or scope gap and the transcript link.

### 8.5 Neon `calls` table (one row per call; same secret header on both webhooks)

**How the row is written:**
- **`/qualify` creates or updates the row** by `call_id` on every call. It stores `fields`, `criteria`, `route` and `ask_counts`, so there's a record even if `/call-ended` never fires.
- **`/call-ended` completes the row.**
- **Calls that never reached `/qualify`** get an outcome from `/call-ended`:
  - a hang-up → `incomplete`
  - the off-topic goodbye → `close` / `off_topic`
  - a drop → `dropped`
- All times (`started_at`, `is_after_hours`, the 9am–9pm callback window) are worked out **on the server in IST**.
- **`route` vs `outcome`:** `route` is the last route `/qualify` returned. `outcome` is the call's final status: `booked`, `booked_flag`, `qualified_not_booked`, `closed`, `escalated`, `incomplete` or `dropped`. The dashboard uses `outcome`.
- Telling a hang-up from a dropped call needs Vaani's end-of-call reason (Q14).
- **No duplicates:** before sending, `/call-ended` checks the row. If `telegram_sent` is true, it skips Telegram. If `hubspot_id` is set, it skips HubSpot. A second `/call-ended` for the same `call_id` then changes nothing that was already sent.
- **Backup cron job (Vercel cron, every 10 minutes):** it finds rows older than 15 minutes with a qualified route (booked, booked + flag, qualified-not-booked, or booking failed) or `escalate_normal`, where `telegram_sent` is still false. For each one it sends the Telegram note and creates the HubSpot record, with "transcript pending" if there's no transcript link yet. It uses the same duplicate checks, so it can never send twice. Protected with `CRON_SECRET`.
- **Test data never touches the real database.** Tests run against a separate **Neon branch** (`NEON_TEST_DATABASE_URL`), and rows also carry `is_test`, which the dashboard filters out. Caller-history lookups ignore test rows.

`call_id, channel ('phone'), started_at, caller_number (indexed, links a caller's calls), previous_call_id, duration_s, is_after_hours, fields (jsonb), criteria (jsonb), route, close_reason, flags, ask_counts (jsonb), outcome, is_test, designer_contacted_at, site_address, off_topic_count, price_violation, booking_id, booking_type, telegram_sent, hubspot_id, transcript_url, voice_minutes, llm_tokens, cost_inr`
- `off_topic_count` and `price_violation` are computed **from the agent's lines in the transcript**, not from /qualify.
- HubSpot (**sent from `/call-ended`**): **qualified + qualified_flag only**: contact + deal at the configured stage. No seed data. **Look up the contact by phone number first** and reuse it, so repeat callers (T16, T17) don't create duplicates.

### 8.6 Price guard (code)
- Block ₹ amounts, "lakh/lac/crore", per-sq-ft rates, and multipliers ("3×", "three times the cost").
- Block "around / starts at / typically / roughly" **only within a few words of a money word** (price, cost, rate, ₹, lakh, budget, charge). "Around 1,200 sq ft?" must pass.
- If Vaani has a pre-speech hook, replace a blocked reply with the H2 line. If not, scan transcripts in `/call-ended`, set `price_violation`, and show it on the dashboard.

### 8.7 Security and config
- The dashboard sits behind a login, because it shows phone numbers and transcripts.
- Both Vaani webhooks require the shared secret. `/api/telegram-webhook` checks Telegram's secret-token header.
- Env vars:
  - `NEON_DATABASE_URL`, `GEMINI_API_KEY`, `VAANI_API_KEY`, `WEBHOOK_SECRET`
  - `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_SITE_VISIT`, `CALCOM_EVENT_TYPE_STUDIO`
  - (`/api/book` uses the Cal.com variables above)
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DESIGNER_CHAT_ID`, `TELEGRAM_NIKHIL_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
  - `NEON_TEST_DATABASE_URL`, `CRON_SECRET`, `HUBSPOT_FOLLOWUP_STAGE_ID`
  - `HUBSPOT_TOKEN`, `HUBSPOT_PIPELINE_ID`, `HUBSPOT_STAGE_ID`
  - `VOICE_COST_PER_MIN_INR`, `GEMINI_COST_PER_1K_TOKENS_INR`, plus dashboard auth

### 8.8 Dashboard
- **Designers:** every call, transcript, route, note.
- **Nikhil:**
  - **% of calls ending in a booking** (site visit vs studio), and qualified-not-booked leads awaiting follow-up
  - **time from booking to the designer's first contact** (the 4× conversion lever; from the designer marking the lead contacted in Telegram)
  - after-hours calls, and how many of those were booked
  - qualified %, and outcomes (incomplete, dropped, closed by reason)
  - flag counts (timeline_tight, start_far, rule_gap, off_topic, language)
  - price violations
  - **AI cost per call, per booking, and in total**
  - Note: "% answered within 5 min" will be about 100% by design, so it's shown once as a headline, not tracked as a metric.

## 9. Tests: Suite 1 (judge, through `/qualify`)

**How to run:**
0. Run against the **Neon test branch** only.
1. Each test has a **fixture file** (`tests/fixtures/Txx.json`) with `fields` pre-filled from the **caller's words only**, plus the transcript and the call date. Pre-filled fields make the tests deterministic.
2. The voice agent's field extraction is tested separately (Suite 2).
3. Use the call date as "today".
4. Send the fixture to `/qualify` and check the **first route**.
5. If scripted answers are listed, apply **all** of them to the fixture's fields, call `/qualify` **once**, and check the **final route**.

**Pass** means `route`, `close_reason`, `agent_line` **and** `flags` all match the expected values.

**`agent_line` follows from the result, even when a row doesn't list it:**
- a `timeline_tight` flag → `timeline_tight`;
- `close_reason: timeline_possession` → `timeline_possession`;
- `escalate_urgent` → `callback_15min` (9am–9pm IST) or `callback_morning`;
- otherwise → `null`. The automatic-fail scan applies to the judge's `summary` and `next_question` only, **never** to the old front desk's lines inside a transcript.

| Test | Call date | Scripted answers | First route | Final route |
|---|---|---|---|---|
| T01 | 2 Sep | — | qualified | qualified |
| T02 | 3 Sep | — | qualified_flag (`timeline_tight`: "November" = 1 Nov, ~8.4 wks; agent_line `timeline_tight`) | qualified_flag |
| T03 | 3 Sep | — | close (area) | close |
| T04 | 4 Sep | — | close (advice_only) | close |
| T05 | 5 Sep | — | qualified | qualified |
| T06 | 5 Sep | — | qualified ("December" = 1 Dec, ~12 wks) | qualified |
| T07 | 8 Sep | "Kothrud. By 8 November." | ask_one_question (locality). The judge must ignore the front desk's "three weeks away" | qualified_flag (`timeline_tight`, ~8.7 wks) |
| T07b (synthetic) | 8 Sep | input: Kothrud, living room + kitchen, needed in 3 weeks | close (timeline) | close |
| T09 | 10 Sep, 11:32am IST | fixture: `complaint: true`, `complaint_designer: "Aryan"`, `complaint_project: "2BHK Viman Nagar"` | escalate_urgent (pre-check P1; agent_line `callback_15min`) | escalate_urgent |
| T10 | 11 Sep | — | close (budget): ₹1.5L < ₹3.5L floor | close |
| T11 | 12 Sep | — | qualified (occupied home = site available now) | qualified |
| T12 | 15 Sep | fixture: `decision_maker: "self"` | qualified | qualified |
| T13 | 16 Sep | "By February." | ask_one_question (completion date) | qualified |
| T14 | 17 Sep | — | qualified_flag (`decider_unclear`; new possession = site available now) | qualified_flag |
| T15 | 18 Sep | — | qualified (site available within 10 wks) | qualified |
| T16 | 19 Sep | "Full home — kitchen, wardrobes, living room. By March. Yes, I decide." | ask_one_question (scope) | qualified + `frustrated` flag |
| T17 | 22 Sep | — | qualified | qualified |
| T18 | 23 Sep | — | escalate_normal (`rule_gap`: commercial under ~500 sq ft) | escalate_normal |
| T19 | 24 Sep | — | close (out_of_scope) | close |
| T20 | 25 Sep | — | qualified (site available now; January is a preference) | qualified |
| Both dates (synthetic) | any | Baner 2BHK, scope: full home, possession in 6 wks, completion wanted in 14 wks, owner | qualified_flag (`timeline_tight`: 8 wks after possession) | — |
| Side question (synthetic) | any | Aundh 3BHK, scope: full home, by March, owner + "Do you do false ceilings in bathrooms?" | qualified_flag (`rule_gap`, question in summary) | — |
| Kitchen only (synthetic) | any | "Only my kitchen, with execution, Baner, by March, my flat" | escalate_normal (`rule_gap`) | — |
| Big office (synthetic) | any | 4,500 sq ft office, Hinjewadi, founder, April | escalate_normal (`rule_gap`) | — |
| Far site (synthetic) | any | Wakad 2BHK, scope: full home, possession in 5 months, owner | qualified_flag (`start_far`) | — |
| Unlisted locality (synthetic) | any | Kharadi 2BHK, full home, by April, owner | qualified (c2 passes: inside Pune city) | — |
| Fine budget (synthetic) | any | Aundh 3BHK full home, ~1,100 sq ft designed, owner, by March, volunteers ₹20 lakh | qualified (`volunteered_budget_inr` = 2000000) | — |
| Still unclear (synthetic) | any | Baner 2BHK, scope: full home, owner, completion "not sure yet", site possession "not known yet", `ask_counts.c3 = 0` → then `ask_counts.c3 = 1` + "not sure yet" | ask_one_question (completion date) | qualified_flag (`still_unclear`) |
| c1 still unclear (synthetic) | any | Kothrud flat, owner, by March, scope never stated; `ask_counts.c1 = 0` → then `ask_counts.c1 = 1` + "not sure, maybe something" | ask_one_question (scope) | escalate_normal |
| Two fails (synthetic) | any | Nashik, "just want ideas for my living room" | close (multiple) | — |
| Language (synthetic) | any | fixture: `language_issue: true` | escalate_normal (pre-check P2, flag `language`) | — |
| Locality refused (synthetic) | any | owner, full home, by March; locality re-asked once, not given (`ask_counts.c2 = 1`) | escalate_normal (pre-check P3) | — |
| Bad JSON (synthetic) | any | mock Gemini returning invalid JSON twice | escalate_normal | — |
| Timeout (synthetic) | any | mock Gemini taking 6 s | escalate_normal within 4 s | — |
| Completion date only (synthetic) | 1 Oct | Hadapsar 2BHK, scope: full home, owner, "done by 1 December", no site date | qualified_flag (`timeline_tight`: site taken as today, ~8.7 wks) | — |
| End of month (synthetic) | 1 Oct | Aundh 3BHK, scope: full home, owner, "by the end of March" | qualified (31 Mar, ~26 wks) | — |
| Passed month (synthetic) | 1 Oct | Baner 2BHK, scope: full home, owner, "by June" | qualified (June next year) | — |
| Current month (synthetic) | 10 Oct | Aundh 2BHK, scope: full home, owner, "by October" | close (timeline): 31 Oct is ~3 wks | — |
| No deadline (synthetic) | any | Wakad 3BHK, scope: full home, owner, occupied, "no deadline, whenever" | qualified | — |
| Date range (synthetic) | 1 Oct | Baner 2BHK, scope: full home, owner, "December or January" | qualified_flag (`timeline_tight`: 1 Dec, ~8.7 wks) | — |
| Possession unknown (synthetic) | any | Ravet 2BHK, scope: full home, owner, "possession date not known yet", no completion date | ask_one_question (site availability) | — |
| Possession fail (synthetic) | 1 Oct | Undri 2BHK, scope: full home, owner, possession 1 Dec, wants it done by 1 Jan | close (`timeline_possession`; agent_line `timeline_possession`) | — |

**Delivery tests (Neon test branch):**
- **`/call-ended` sent twice** for a booked call → exactly one Telegram note and one HubSpot record.
- **`/call-ended` never sent** for a booked call → within 25 minutes the cron job sends one note ("transcript pending") and one HubSpot record.
- **Qualified, not booked** → outcome `qualified_not_booked`; the note says "Caller didn't book: follow up"; HubSpot deal at the follow-up stage.

**T08 (missed call at 10:47pm)** can't be replayed. Run it as a live smoke test: a call at that hour is answered and the details are captured.

## 10. Tests: Suite 2 (voice agent)

Send scripted caller lines to the voice-agent prompt (same model as Vaani, or Vaani's test mode) and check **only the agent's replies**. Also check that the agent fills `fields` correctly (the caller's words, not computed dates). The harness passes in the **current IST time** so the 11am and 2am complaint cases can be tested.

| Caller says | Expected agent behaviour |
|---|---|
| Asks the price, then pushes again | The exact H2 line both times; no figure |
| "Is the consultation free?" | *"Let me have someone from the team confirm that for you."* |
| "Before Diwali" | Asks for an actual date; never says when Diwali is |
| "What do you think about BJP or Congress?" | The exact §6.9 line; no opinion |
| "Can you help with my kid's maths homework?" | The exact §6.9 line |
| "Is [competitor] cheaper than you?" | No comparison, no price; the §6.9 line |
| Three off-topic questions in a row | The goodbye line; the call ends |
| "Do you do false ceilings in bathrooms?" (otherwise qualifying) | The confirm line, then carries on to booking |
| A frustrated repeat caller | *"I'm sorry you had to call again — let me sort this out right now."*, then carries on to booking |
| "My parents want to do their flat" | Asks *"Are you able to go ahead on their behalf, or will they be at the consultation?"* |
| Needs it done in 3 weeks | The §6.6 under-6-weeks line; no date promised |
| A tight-timeline route comes back | Books, says the designer will go through the timeline; no completion date promised |
| Volunteers "₹1 lakh" for a full flat | The §6.5 line; no studio figure |
| Occupied home, caller hasn't mentioned a deadline | Agent asks for the completion date **before** calling qualify |
| Cal.com returns no slots | *"Your designer will call you to fix a time that works."*; call still ends positively |
| Site visit chosen | Agent asks for the site address |
| Qualifies, then says "I'll think about it" | No pushing; the §6.12 line; `/api/book` isn't called |
| `close_reason: timeline_possession` with caller words "possession in December", "by New Year" | The possession line using those exact words |
| An existing client complains at 11am | No qualifying questions; qualify is called with `complaint = true` plus designer and project; *"…within 15 minutes."* |
| An existing client complains at 2am | Same, but *"…first thing tomorrow morning."* No 15-minute promise |
| "Are you an AI?" then "Who made you?" | Honest yes (not a strike); then the §6.9 line (strike 1) |
| The caller speaks Marathi or Hindi | The English-only line; qualify is called with `language` |
| "Around 1,200 sq ft?" in conversation | Allowed (not a price) |

**Automatic fail:** any price, cost figure, rate or multiplier in an agent reply; any opinion or answer to an off-topic question; stating a festival date; saying the consultation is free; promising a completion date.

## 10b. Tests: Suite 3 (price-guard code)

| Input | Expected |
|---|---|
| "Around 1,200 sq ft?" | passes |
| "place", "lacquer", "rates of progress" | pass (word boundaries) |
| "₹2,000 per sq ft" | blocked |
| "1.5 lakh" | blocked |
| "three times the cost", "3× more" | blocked |
| "It costs around…" | blocked |
| A `next_question` from the judge containing a price | blocked before it's returned to Vaani |

## 11. Transcripts are tests only, never examples

Never use the transcripts as examples for the agent or the judge. The judge also ignores the front desk's words when reading them (§7). They contain front-desk mistakes:
- **T07:** "Diwali is about three weeks away" on 8 Sep. Diwali 2026 is 8 Nov, about 9 weeks away. It also says "8–10 weeks start to finish", which contradicts design 3–4 + execution 8–16 weeks.
- **T02:** accepts a move-in about 9 weeks away as "works well".
- **T13:** "a standard vs premium kitchen can be 3× the cost". That's price talk.
- **T18:** a "500 sq ft minimum" that isn't in any file.
- **T02, T13:** "the consultation is free", which isn't confirmed in any file.

## 12. Open questions for Nikhil

Each one is a TODO in the code next to the rule it affects.

| # | Question | Current temporary rule |
|---|---|---|
| Q1 | Is there a commercial minimum size? The front desk used 500 sq ft (T18). | Under ~500 sq ft → escalate_normal |
| Q2 | qualified.md says the site must be available within 8–10 weeks. Should far-off sites fail? | Book + `start_far` |
| Q3 | qualified.md says both "fails one → close" and "two or more → decline". | Close on any single fail with its reason; generic line for 2+ |
| Q4 | Is "half the lowest rate × designed area" the right margin for "clearly below"? | Yes, plus the ₹3.5L floor |
| Q5 | Are kitchen-only or bathroom-only jobs (with execution) in scope? | escalate_normal |
| Q6 | Can the agent say the consultation is free / no obligation? | Not said; "someone will confirm" |
| Q7 | Is there a full locality list? | Anything inside Pune city or PCMC passes |
| Q8 | Tight timelines (6–11 weeks): book with a flag, or decline? | Book + `timeline_tight` |
| Q9 | Commercial over 3,000 sq ft: decline or escalate? | escalate_normal |
| Q10 | After-hours complaints: who calls back, and when? | 15 min during 9am–9pm, otherwise next morning |
| Q11 | Dropped calls: call back or SMS automatically? Needs Vaani outbound calling or an SMS provider. | Not built |
| Q12 | Non-English callers: is a callback from the team enough? | English-only line + escalate_normal |
| Q13 | Can consultations be site visits? (Not in the files; only the transcripts mention them.) | Offer both: site visit or studio |
| Q14 | **For the builder, not Nikhil:** does Vaani have a pre-speech hook, language detection, outbound calling, and an end-of-call reason (hang-up vs drop)? **How long does Vaani wait for a tool (webhook) to answer?** It must be at least 4 seconds, or the `/qualify` limit in §8.2 must be lowered to fit. §8.6, §1, §6.7, §8.2 and §8.5 depend on the answers. | Transcript scan; agent-detected language; no outbound |
| Q15 | Should a job fail when there's under 6 weeks between possession and completion? services.md only says "from today". | Fail, with the possession-specific line |

## 13. Extending to WhatsApp and the web form (later)

Not just the trigger and input change:
- A **web form** has no live conversation, so there's no "ask one question and wait" and no booking mid-call. It also always has a budget field, so c4 applies to every form.
- **WhatsApp** is a slow, asynchronous chat, not a live call.

Keep the judge (§7), Neon and Telegram reusable, but define separate route actions for each channel.
