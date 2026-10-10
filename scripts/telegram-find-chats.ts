// Lists the chats that have messaged the bot, so you can copy TELEGRAM_DESIGNER_CHAT_ID and
// TELEGRAM_NIKHIL_CHAT_ID into .env. Prints chat ids and names only — never the token.
// Run BEFORE setting the webhook: Telegram disables getUpdates while a webhook is set.
// Usage: npx tsx scripts/telegram-find-chats.ts
import { config } from "dotenv";
config({ path: ".env", quiet: true });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not in .env yet.");
  process.exit(1);
}
const api = (method: string) => fetch(`https://api.telegram.org/bot${token}/${method}`).then((r) => r.json());

async function main() {
  const me = await api("getMe");
  if (!me.ok) throw new Error(`The token was rejected by Telegram: ${me.description}`);
  console.log(`Bot: @${me.result.username}`);

  const hook = await api("getWebhookInfo");
  if (hook.ok && hook.result.url) {
    console.log(`A webhook is set (${hook.result.url}), so getUpdates is disabled. Remove it first or read chat ids another way.`);
    return;
  }

  const updates = await api("getUpdates");
  if (!updates.ok) throw new Error(updates.description);
  const chats = new Map<number, string>();
  for (const u of updates.result) {
    const chat = u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
    if (!chat) continue;
    const name = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ");
    chats.set(chat.id, `${chat.type.padEnd(10)} ${name}`);
  }
  if (!chats.size) {
    console.log("No messages yet. Send 'hi' in the designers' group (with the bot added) and /start to the bot in a private chat, then run this again.");
    return;
  }
  console.log("\nchat_id            type       name");
  for (const [id, label] of chats) console.log(`${String(id).padEnd(18)} ${label}`);
  console.log("\nGroup → TELEGRAM_DESIGNER_CHAT_ID (group ids start with -). Private chat → TELEGRAM_NIKHIL_CHAT_ID.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
