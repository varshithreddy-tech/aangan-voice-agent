// Measures the judge's input/output token split, to set GEMINI_COST_PER_1K_TOKENS_INR.
// Usage: npx tsx scripts/judge-tokens.ts
import { config } from "dotenv";
config({ path: ".env", quiet: true });
import { judgeSystemPrompt, judgeUserPrompt } from "../lib/judge";
import { PHONE } from "../tests/fixtures/phone";

async function main() {
  for (const id of ["T01", "T13", "T16"]) {
    const fx = PHONE.find((f) => f.id === id)!;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-3.6-flash"}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: judgeSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: judgeUserPrompt({ today: fx.today, fields: fx.fields, transcript: fx.transcript, history: [] }) }] }],
        generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? "minimal" } },
      }),
    });
    const j = (await r.json()) as { usageMetadata?: Record<string, number> };
    console.log(id, JSON.stringify(j.usageMetadata));
  }
}
main();
