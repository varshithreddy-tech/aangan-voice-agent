// Copies the needed variables from .env into the linked Vercel project (production), without printing values.
// Usage (after `vercel link`): node scripts/vercel-env-push.mjs
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const KEYS = [
  "NEON_DATABASE_URL", "NEON_TEST_DATABASE_URL",
  "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_THINKING_LEVEL",
  "WEBHOOK_SECRET", "CRON_SECRET",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_DESIGNER_CHAT_ID", "TELEGRAM_NIKHIL_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET",
  "HUBSPOT_TOKEN", "HUBSPOT_PIPELINE_ID", "HUBSPOT_STAGE_ID", "HUBSPOT_FOLLOWUP_STAGE_ID", "HUBSPOT_CONTACTED_STAGE_ID",
  "CALCOM_API_KEY", "CALCOM_EVENT_TYPE_SITE_VISIT", "CALCOM_EVENT_TYPE_STUDIO",
  "VOICE_COST_PER_MIN_INR", "GEMINI_COST_PER_1K_TOKENS_INR", "VAANI_DEBUG_LOG",
];

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const vercel = process.platform === "win32" ? "vercel.cmd" : "vercel";
// The CLI's update check/telemetry workers time out on this machine and add ~1 min per call.
const childEnv = { ...process.env, NO_UPDATE_NOTIFIER: "1", VERCEL_TELEMETRY_DISABLED: "1" };
// Optional: `--from KEY` resumes from that key.
const fromIdx = process.argv.indexOf("--from");
const start = fromIdx > 0 ? Math.max(0, KEYS.indexOf(process.argv[fromIdx + 1])) : 0;
const onlyIdx = process.argv.indexOf("--only");
const selected = onlyIdx > 0 ? [process.argv[onlyIdx + 1]] : KEYS.slice(start);
for (const key of selected) {
  const value = env[key];
  if (!value) {
    console.log(`skip   ${key} (not in .env)`);
    continue;
  }
  // Remove an existing value first so re-running updates it.
  spawnSync(vercel, ["env", "rm", key, "production", "--yes"], { shell: true, stdio: "ignore", env: childEnv });
  const r = spawnSync(vercel, ["env", "add", key, "production"], { shell: true, input: value, encoding: "utf8", env: childEnv });
  console.log(`${r.status === 0 ? "set   " : "FAILED"} ${key}${r.status === 0 ? "" : ` — ${(r.stderr || r.stdout).split("\n").filter(Boolean).slice(-1)[0]}`}`);
}
