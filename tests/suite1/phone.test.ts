// Suite 1 — phone transcripts T01–T20 (rubric §9). T08 is a live smoke test.
import { describe, expect, it } from "vitest";
import { PHONE } from "../fixtures/phone";
import { LIVE, runFixture } from "./harness";

describe(`Suite 1 phone T01–T20 (${LIVE ? "live Gemini" : "mocked judge"})`, () => {
  it.each(PHONE.map((f) => [f.id, f] as const))("%s", async (_id, fx) => {
    const { first, final } = await runFixture(fx);
    expect(first.problems, `first route: ${JSON.stringify(first.result, null, 1)}`).toEqual([]);
    if (final) expect(final.problems, `final route: ${JSON.stringify(final.result, null, 1)}`).toEqual([]);
  });

  it.skip("T08 — missed call at 10:47pm: run as a live smoke test (a call at that hour is answered and captured)", () => {});
});
