# Vaani AI setup (app.vaanivoice.ai)

Read from the live "Create Custom Tool" form (Design → Tools & Actions → New Action →
Create Custom Tools/Actions). Its fields: Name, Description, API Endpoint (method + URL),
Timeout (ms), Headers, Query Parameters, Parameters (name, description, type
string|number|boolean|array|object, required), Store Fields as Variables (Response JSON Path → variable).

Create these after the app is deployed (replace `<app>` and `<WEBHOOK_SECRET>`).

## Tool 1: `qualify`
- **Description**: "Checks whether the enquiry fits Aangan Studio and returns what to do next. Call it once you know the scope, the area, and the completion date or site availability; call it again after asking the returned next_question."
- **Endpoint**: `POST https://<app>/api/qualify`
- **Timeout**: `5000` (the backend answers within 4 s)
- **Headers**: `x-webhook-secret` = `<WEBHOOK_SECRET>`
- **Parameters**:
  | name | type | required | description |
  |---|---|---|---|
  | `fields` | object | yes | What the caller said, in their own words: name, space_type (home/office/other), scope, locality, completion_text, site_available_text, designed_area_sqft, flat_area_sqft, decision_maker (self/authorised/someone_else), volunteered_budget_inr (only if the caller said it — never ask), consultation_type (site_visit/studio), site_address, complaint, complaint_designer, complaint_project, language_issue. Never compute dates. |
  | `transcript_so_far` | string | no | The conversation so far. |
- **Store Fields as Variables**: `$.route` → `route`, `$.next_question` → `next_question`,
  `$.close_reason` → `close_reason`, `$.agent_line` → `agent_line`

## Tool 2: `book`
- **Description**: "Gets open consultation slots (action 'slots') or books the slot the caller chose (action 'book'). Only after qualify returned qualified or qualified_flag."
- **Endpoint**: `POST https://<app>/api/book`, **Timeout** `10000`, same header.
- **Parameters**: `action` (string, required: slots|book), `consultation_type` (string, required: site_visit|studio),
  `slot` (number: 1–3, the option the caller picked), `name` (string), `site_address` (string, site visits only).
- **Store Fields as Variables**: `$.status` → `booking_status`, `$.slot` → `booked_slot`

## Post-call webhook
Settings → Webhooks → `https://<app>/api/call-ended?key=<WEBHOOK_SECRET>`

## Open: the call id in tool requests
The form has no built-in variables for the call id or caller number, and the docs don't say whether
Vaani adds them. Set `VAANI_DEBUG_LOG=1` in Vercel, make one test call, and read the
`[vaani-debug]` line in Vercel's logs. `lib/vaani.ts` already looks for `call_id`, `room_name`,
`session_id` and `x-call-id`-style headers; if Vaani uses another name, it's a one-line change.
