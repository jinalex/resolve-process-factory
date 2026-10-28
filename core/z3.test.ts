// Reading Z3's numbers back. Z3 prints fractions and negatives as expressions ("(/ 7.0 3.0)", "(- 5.0)"); reading
// those as unknown made an example's numbers vanish, so the evaluator and Z3 disagreed on it.
import { afterAll, expect, test } from "vitest";
import { number, shutdown, z3Context } from "./z3.ts";

afterAll(shutdown);

test("every form Z3 prints a number in", () => {
  expect(number("25.0")).toBe(25);
  expect(number("(- 5.0)")).toBe(-5);
  expect(number("(/ 7.0 2.0)")).toBe(3.5);
  expect(number("(- (/ 7.0 2.0))")).toBe(-3.5);
  expect(() => number("x")).toThrow();
});

test("a number Z3 chose reads back as the same number", async () => {
  const ctx = await z3Context();
  for (const v of ["1/3", "-7/3", "-5", "25", "12.5"]) {
    const x = ctx.Real.const("x"), s = new ctx.Solver();
    s.add(x.eq(ctx.Real.val(v)));
    expect(await s.check()).toBe("sat");
    const [a, b = "1"] = v.split("/");
    expect(number(s.model().eval(x).toString())).toBeCloseTo(Number(a) / Number(b), 12);
  }
});
