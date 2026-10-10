// Suite 2 harness (rubric §10): plays the voice-agent prompt (prompts/voice_agent.md) with Gemini
// standing in for Vaani's model, and returns the agent's next reply. Tools are simulated: the agent
// writes CALL_TOOL <name> <json> instead of calling one, and tool results are fed back as messages.
import { readFileSync } from "node:fs";
import path from "node:path";

export type Turn = { role: "caller" | "agent" | "tool"; text: string };

const HARNESS_NOTE = `

=== TEST HARNESS (not part of the real call) ===
This is a text simulation of a phone call. Reply with ONLY the words you would say next, nothing else.
When you would call a tool, put it on the LAST line as: CALL_TOOL <qualify|book> <json arguments>. You may say something before it (as you would on a real call), but nothing after it.
Messages starting with TOOL_RESULT are what the tool returned; act on them.
The current time in Pune is {{NOW}}.`;

let basePrompt: string | null = null;
function systemPrompt(now: string): string {
  if (!basePrompt) {
    const md = readFileSync(path.join(process.cwd(), "prompts", "voice_agent.md"), "utf8");
    basePrompt = md.slice(md.indexOf("---") + 3).trim(); // the part pasted into Vaani
  }
  return basePrompt + HARNESS_NOTE.replace("{{NOW}}", now);
}

export async function agentReply(turns: Turn[], now = "Saturday 10 October 2026, 11:00 am"): Promise<string> {
  const contents = turns.map((t) => ({
    role: t.role === "agent" ? "model" : "user",
    parts: [{ text: t.role === "tool" ? `TOOL_RESULT ${t.text}` : t.text }],
  }));
  const model = process.env.GEMINI_AGENT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(now) }] },
      contents,
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${j.error?.message}`);
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

/** Loose match for an exact rubric line: case, punctuation and dashes ignored. */
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const saysLine = (reply: string, line: string) => squash(reply).includes(squash(line));
