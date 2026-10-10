// Telegram Bot API client: designer handoff note, Nikhil's alerts, the "Contacted ✓" button.
import { env } from "./env";

type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

export const CONTACTED_PREFIX = "c:";

export function contactedButton(callId: string): InlineKeyboard {
  // callback_data is limited to 64 bytes.
  const data = `${CONTACTED_PREFIX}${callId}`;
  if (Buffer.byteLength(data) > 64) throw new Error(`call_id too long for a Telegram button: ${callId}`);
  return { inline_keyboard: [[{ text: "Contacted ✓", callback_data: data }]] };
}

export async function sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<{ message_id: number }> {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  await tg("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function markButtonDone(chatId: number | string, messageId: number, label: string): Promise<void> {
  await tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: label, callback_data: "done" }]] },
  });
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await tg("setWebhook", { url, secret_token: secretToken, allowed_updates: ["callback_query"] });
}

export const designerChat = () => env("TELEGRAM_DESIGNER_CHAT_ID");
export const nikhilChat = () => env("TELEGRAM_NIKHIL_CHAT_ID");
