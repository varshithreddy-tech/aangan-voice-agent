# Aangan Studio — Phone Enquiry Agent

Case 03 · MESA AI-Native Track · Cohort 4. Scope: incoming phone calls only.
Behaviour is defined by `docs/rubric.md` (v6) and `context/*.md`; the files win on any conflict.

```
Vaani (voice) ──/api/qualify──▶ code pre-checks + c3/c4 ─▶ Gemini Flash (c1,c2,c5, gaps, summary) ─▶ route table (code)
             ──/api/book─────▶ Cal.com slots / booking
             ──/api/call-ended▶ Neon row completed ─▶ Telegram note (designers / Nikhil) + HubSpot contact & deal
Telegram "Contacted ✓" ──/api/telegram-webhook▶ designer_contacted_at + HubSpot stage
Vercel cron ──/api/cron/deliver▶ backup delivery if /call-ended never arrives
/dashboard (no login, by decision) ◀── Neon
```

| Where | What |
|---|---|
| `lib/vaani.ts` | **The only Vaani-specific file**: Vaani AI webhooks + custom tools (see `vaani/tools.md`) |
| `lib/qualify.ts`, `lib/route.ts` | `/qualify` core and the §7.3 route table |
| `lib/dates.ts`, `lib/timeline.ts`, `lib/budget.ts` | §4 date convention, c3, c4 — code, never the model |
| `lib/judge.ts`, `prompts/judge.md` | Gemini judge (c1, c2, c5, gaps, summary) with 4 s deadline + one retry |
| `lib/priceGuard.ts` | §8.6 price guard |
| `lib/delivery.ts` | Telegram + HubSpot, at most once each |
| `prompts/voice_agent.md` | Prompt to paste into Vaani |
| `db/schema.sql` | Neon `calls` table |
| `tests/` | Suite 1 (synthetic; T01–T20 pending transcripts), Suite 3, delivery, dates |

Open questions for Nikhil are `TODO(Qn)` comments next to the rules they affect (rubric §12).

Setup: see `docs/SETUP.md`. Env vars: `.env.example`.

## Live

- App: https://aangan-voice-agent-ecru.vercel.app (`/dashboard`: call log, metrics, HubSpot pipeline + forecast)
- Vaani setup: `vaani/tools.md`

## Tests

| Command | What |
|---|---|
| `npm test` | Everything offline: dates/timeline/budget, price guard (Suite 3), delivery, Vaani adapter, Suite 1 with the judge mocked |
| `RUN_LIVE_JUDGE=1 npm run test:suite1` | Suite 1 (T01–T20 + synthetic) against live Gemini |
| `RUN_LIVE_AGENT=1 npx vitest run tests/suite2` | Suite 2: the Vaani prompt played by Gemini, checking the agent's exact lines |
| `RUN_DB=1 npx vitest run tests/neon-integration.test.ts` | Real Neon queries on the test branch |

(PowerShell: `$env:RUN_LIVE_JUDGE=1; npm run test:suite1`.)
