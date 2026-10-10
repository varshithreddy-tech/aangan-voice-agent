// Suite 3 — price-guard code (rubric §10b).
import { describe, expect, it } from "vitest";
import { checkPrice, guardSpoken, stripRupeeFigures } from "@/lib/priceGuard";
import { PRICE_LINE } from "@/lib/lines";

describe("Suite 3: price guard", () => {
  it.each([
    "Around 1,200 sq ft?",
    "place",
    "lacquer",
    "rates of progress",
    PRICE_LINE,
    "Design takes 3–4 weeks, and execution takes 8–16 weeks after that.",
    "Could you confirm your number, 98220 12345?",
  ])("passes: %s", (text) => {
    expect(checkPrice(text).blocked).toBe(false);
  });

  it.each([
    "₹2,000 per sq ft",
    "1.5 lakh",
    "three times the cost",
    "3× more",
    "It costs around…",
    "Our rates start at about two thousand per square foot",
    "For a 2BHK it's typically 12 lakhs",
    "Rs. 5000",
  ])("blocks: %s", (text) => {
    expect(checkPrice(text).blocked).toBe(true);
  });

  it("replaces a judge next_question containing a price before it reaches Vaani", () => {
    expect(guardSpoken("Would a budget of around 10 lakh work for you?")).toBe(PRICE_LINE);
    expect(guardSpoken("Which area is the property in?")).toBe("Which area is the property in?");
  });

  it("strips ₹ figures from the designer summary", () => {
    expect(stripRupeeFigures("Caller mentioned ₹1.5 lakh for a 2BHK")).not.toMatch(/1\.5/);
  });
});
