// Points the Telegram bot's "Contacted ✓" button presses at /api/telegram-webhook.
// Usage: npm run telegram:webhook -- https://<your-app>.vercel.app
import { config } from "dotenv";
config({ path: ".env" });
import { setWebhook } from "../lib/telegram";

const base = process.argv[2];
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!base || !secret) {
  console.error("Usage: npm run telegram:webhook -- https://<your-app>.vercel.app   (TELEGRAM_WEBHOOK_SECRET must be in .env)");
  process.exit(1);
}
setWebhook(`${base.replace(/\/$/, "")}/api/telegram-webhook`, secret)
  .then(() => console.log("Webhook set."))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
