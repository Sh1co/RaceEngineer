import { describe, expect, it } from "vitest";
import { normalizeAutoCompleteContext } from "./normalizeAutoCompleteContext";

describe("normalizeAutoCompleteContext", () => {
  it("replaces trailing cursor marker comment in prefix with indentation", () => {
    const result = normalizeAutoCompleteContext({
      prefix: "def calc_fib(n):\n    # Cursor here",
      suffix: "\n",
    });

    expect(result.prefix).toBe("def calc_fib(n):\n    ");
    expect(result.suffix).toBe("\n");
  });

  it("drops leading cursor marker comment from suffix", () => {
    const result = normalizeAutoCompleteContext({
      prefix: "def calc_fib(n):\n    ",
      suffix: "# Cursor here\nprint(calc_fib(5))\n",
    });

    expect(result.prefix).toBe("def calc_fib(n):\n    ");
    expect(result.suffix).toBe("print(calc_fib(5))\n");
  });

  it("keeps context unchanged when no cursor marker comment exists", () => {
    const input = {
      prefix: "def calc_fib(n):\n    ",
      suffix: "\nprint(calc_fib(5))\n",
    };
    const result = normalizeAutoCompleteContext(input);

    expect(result).toEqual(input);
  });
});

