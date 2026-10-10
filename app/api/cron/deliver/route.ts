// GET /api/cron/deliver — daily backup job (Vercel Hobby: once a day, 09:00 IST).
// Same duplicate checks as /call-ended, so it never sends twice.
import { getRepo } from "@/lib/db";
import { envOptional } from "@/lib/env";
import { sweepPending } from "@/lib/sweep";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = envOptional("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await sweepPending(getRepo(false), 25);
  return Response.json({ delivered: results.length, results });
}
