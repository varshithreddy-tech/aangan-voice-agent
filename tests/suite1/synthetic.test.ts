// Suite 1 — synthetic rows of rubric §9.
import { describe, expect, it } from "vitest";
import { SYNTHETIC } from "../fixtures/synthetic";
import { LIVE, runFixture } from "./harness";

const cases = LIVE ? SYNTHETIC.filter((f) => !f.mock) : SYNTHETIC;

describe(`Suite 1 synthetic (${LIVE ? "live Gemini" : "mocked judge"})`, () => {
  it.each(cases.map((f) => [f.id, f] as const))("%s", async (_id, fx) => {
    const { first, final } = await runFixture(fx);
    expect(first.problems, `first route: ${JSON.stringify(first.result, null, 1)}`).toEqual([]);
    if (final) expect(final.problems, `final route: ${JSON.stringify(final.result, null, 1)}`).toEqual([]);
    if (fx.mock === "slow") expect(first.ms).toBeLessThan(4000);
  });
});
