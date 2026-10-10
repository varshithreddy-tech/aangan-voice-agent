// Measures judge latency per model / thinking level with the real judge prompt.
// Usage: npx tsx scripts/judge-latency.ts
import { config } from "dotenv";
config({ path: ".env", quiet: true });
import { geminiCall, judgeSystemPrompt, judgeUserPrompt } from "../lib/judge";
import { PHONE } from "../tests/fixtures/phone";

const CONFIGS: [string, string][] = [
  ["gemini-3.8-flash", "low"],
  ["gemini-3.6-flash", "minimal"],
  ["gemini-3.5-flash-lite", "minimal"],
  ["gemini-3-flash-preview", "minimal"],
];
const SAMPLES = ["T01", "T07", "T14"];

async function main() {
  const system = judgeSystemPrompt();
  for (const [model, level] of CONFIGS) {
    process.env.GEMINI_MODEL = model;
    process.env.GEMINI_THINKING_LEVEL = level;
    const times: number[] = [];
    let errors = 0;
    let verdicts = "";
    for (const id of SAMPLES) {
      const fx = PHONE.find((f) => f.id === id)!;
      const user = judgeUserPrompt({ today: fx.today, fields: fx.fields, transcript: fx.transcript, history: [] });
      const t0 = Date.now();
      try {
        const r = await geminiCall({ system, user }, AbortSignal.timeout(20000));
        times.push(Date.now() - t0);
        const o = JSON.parse(r.text);
        verdicts += ` ${id}:${o.c1}/${o.c2}/${o.c5}`;
      } catch (e) {
        errors++;
        verdicts += ` ${id}:ERR(${String(e).slice(0, 80)})`;
      }
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`${model} @${level}: ms=[${times.join(", ")}] max=${sorted.at(-1) ?? "-"} errors=${errors} |${verdicts}`);
  }
}
main();
