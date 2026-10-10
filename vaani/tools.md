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
- **Parameters**: one per field (more reliable than one object: Suite 2 showed the model inventing
  key names inside a free-form object). None required. All in the caller's own words; never computed dates.
  | name | type | description |
  |---|---|---|
  | `name` | string | Caller's name |
  | `space_type` | string | home, office or other |
  | `scope` | string | What they want done, e.g. "full home, 2BHK" |
  | `locality` | string | Area of the property, e.g. "Baner" |
  | `completion_text` | string | When they need it complete, their words, e.g. "by March", "before Diwali", "no deadline" |
  | `site_available_text` | string | Site availability, their words, e.g. "now", "possession in 6 weeks" |
  | `designed_area_sqft` | number | Size of the area being designed, if said |
  | `flat_area_sqft` | number | Size of the whole flat, if said |
  | `decision_maker` | string | self, authorised or someone_else |
  | `volunteered_budget_inr` | string | Only if the caller said a budget. Never ask. |
  | `consultation_type` | string | site_visit or studio |
  | `site_address` | string | For site visits |
  | `complaint` | boolean | Existing client with a complaint |
  | `complaint_designer` | string | Their designer's name (complaints) |
  | `complaint_project` | string | Their project/location (complaints) |
  | `language_issue` | boolean | Caller can't continue in English |
  | `transcript_so_far` | string | The conversation so far |

  (The backend also accepts a nested `fields` object and common aliases like "area"/"location", just in case.)
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
