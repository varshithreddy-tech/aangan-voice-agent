# Setup

## Cal.com — two event types (cloud)

Do this in Cal.com → **Event Types → New**.

### 1. "Site visit"
1. Title **Site visit**, a duration (e.g. 60 min). Save.
2. **Location**: choose **In Person (Attendee Address)**. The agent sends the caller's site address
   as the location, so the address field is built in.
3. **Advanced → Booking questions**: turn **Attendee phone number** on and make it **required**.
   If Cal.com lets you, make **Email** optional/hidden (callers don't give one). If it won't, leave
   it: the app falls back to a placeholder email automatically.
4. **Availability**: the designers' consultation hours.
5. Save, then copy the **event type ID**: it's the number in the URL
   (`app.cal.com/event-types/<ID>`).

### 2. "Studio consultation"
Same steps, with **Location: In Person (Organizer Address)** set to the studio's address.

### 3. API key
Settings → **Developer → API Keys** → new key. Put it in `CALCOM_API_KEY`.

Send me the two IDs (or put them in `CALCOM_EVENT_TYPE_SITE_VISIT` / `CALCOM_EVENT_TYPE_STUDIO`).

## HubSpot
1. Settings → Integrations → **Private Apps** → create one with scopes:
   `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`,
   `crm.objects.deals.write`, `crm.schemas.deals.read`, `crm.schemas.deals.write`.
2. Put the token in `.env` as `HUBSPOT_TOKEN`, then run `npm run hubspot:setup`.
   It creates the **Aangan Enquiries** pipeline (or, on the free plan, adds the stages to the default
   pipeline) and prints `HUBSPOT_PIPELINE_ID` and the three stage IDs.
3. Nikhil's view: HubSpot → Sales → **Deals** (board by stage) and **Forecast**. Deals carry the
   caller's completion date as the close date, and the volunteered budget (if any) as the amount.

## Telegram
1. Talk to **@BotFather** → `/newbot` → token into `TELEGRAM_BOT_TOKEN`.
2. Add the bot to the designers' group; get the chat id (e.g. via `getUpdates`) → `TELEGRAM_DESIGNER_CHAT_ID`.
   Nikhil starts a chat with the bot → `TELEGRAM_NIKHIL_CHAT_ID`.
3. Pick a random `TELEGRAM_WEBHOOK_SECRET`, deploy, then `npm run telegram:webhook -- https://<app>.vercel.app`.

## Database
`npm run db:migrate -- test` (done) and `npm run db:migrate -- prod`.

## Tests
- `npm test` — everything, with the judge mocked (deterministic).
- Live judge: set `RUN_LIVE_JUDGE=1` (PowerShell: `$env:RUN_LIVE_JUDGE=1; npm run test:suite1`).
