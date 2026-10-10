// POST /api/qualify — called by Vaani mid-call (rubric §8.1, §8.2).
import { after } from "next/server";
import { getRepo } from "@/lib/db";
import { persistQualify, qualify, QUALIFY_BUDGET_MS } from "@/lib/qualify";
import { debugLogRequest, parseQualifyRequest, toolResponse, verifyRequest } from "@/lib/vaani";
import { sendUrgentAlert } from "@/lib/alerts";
import type { QualifyResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const TIMEOUT_RESPONSE: QualifyResponse = { route: "escalate_normal", next_question: null, close_reason: null, agent_line: null };

export async function POST(request: Request) {
  if (!verifyRequest(request.headers, request.url)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let req;
  try {
    const raw = await request.json();
    debugLogRequest("qualify", request.headers, raw);
    req = parseQualifyRequest(raw, request.headers);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!req.call_id) return Response.json({ error: "call_id is required" }, { status: 400 });

  // Only the test harness may set test_today; those calls go to the Neon test branch (§8.5).
  const isTest = Boolean(req.test_today);
  const repo = getRepo(isTest);

  const work = qualify(req, { repo, isTest });
  const timer = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), QUALIFY_BUDGET_MS));
  const out = await Promise.race([work, timer]).catch((e) => {
    console.error("qualify failed", e);
    return "error" as const;
  });

  if (out === "timeout" || out === "error") {
    // §8.2: on a timeout → escalate_normal; the agent says the callback line.
    after(async () => {
      await repo.upsert(req.call_id, { caller_number: req.caller_number || null, is_test: isTest, route: "escalate_normal" });
    });
    return toolResponse(TIMEOUT_RESPONSE);
  }

  const { result } = out;
  after(async () => {
    const row = await persistQualify(repo, req, out, isTest);
    if (result.route === "escalate_urgent" && !isTest) await sendUrgentAlert(repo, row.call_id);
  });

  const response: QualifyResponse = {
    route: result.route,
    next_question: result.next_question,
    close_reason: result.close_reason,
    agent_line: result.agent_line,
  };
  // criteria, flags, summary and the budget stay on the server (§8.2); tests may see them.
  return toolResponse(isTest ? { ...response, debug: result } : response);
}
