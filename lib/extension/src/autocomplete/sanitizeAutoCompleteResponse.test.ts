import { describe, expect, it } from "vitest";
import { sanitizeAutoCompleteResponse } from "./sanitizeAutoCompleteResponse";

describe("sanitizeAutoCompleteResponse", () => {
  it("removes control tokens and trims whitespace", () => {
    const raw =
      "  <|fim_middle|>return x + y;<END><\uFF5Cfim\u2581hole\uFF5C><|endoftext|>  ";
    const result = sanitizeAutoCompleteResponse(raw);

    expect(result).toBe("return x + y;");
  });

  it("keeps regular completion text intact", () => {
    const raw = "return total + tax;";
    const result = sanitizeAutoCompleteResponse(raw);

    expect(result).toBe(raw);
  });

  it("extracts infill body from fenced full-file response with explanation", () => {
    const prefix = "#Inesrtion sort example:\ndef insertion_sort(arr):\n    ";
    const suffix =
      "\n\n# Example usage:\narr = [12, 11, 13, 5, 6]\ninsertion_sort(arr)\nprint(\"Sorted array is:\", arr)";
    const raw = `\`\`\`python
# Language: Python
# File uri: file:///c%3A/tmp/test.py
#Inesrtion sort example:
def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and key < arr[j]:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key

# Example usage:
arr = [12, 11, 13, 5, 6]
insertion_sort(arr)
print("Sorted array is:", arr)
\`\`\`

In the provided code snippet...`;

    const result = sanitizeAutoCompleteResponse(raw, { prefix, suffix });
    expect(result).toBe(
      [
        "for i in range(1, len(arr)):",
        "        key = arr[i]",
        "        j = i - 1",
        "        while j >= 0 and key < arr[j]:",
        "            arr[j + 1] = arr[j]",
        "            j -= 1",
        "        arr[j + 1] = key",
      ].join("\n")
    );
  });

  it("drops known low-value placeholder responses", () => {
    expect(sanitizeAutoCompleteResponse("obj['middle_code']")).toBe("");
    expect(sanitizeAutoCompleteResponse("'obj[\"middle_code\"]'")).toBe("");
    expect(sanitizeAutoCompleteResponse("obj['SUF']")).toBe("");
    expect(sanitizeAutoCompleteResponse("obj['MID'];")).toBe("");
  });

  it("drops placeholder when model repeats function header + obj['SUF']", () => {
    const prefix = "def calc_fib(n):\n    ";
    const raw = "def calc_fib(n):\n    obj['SUF']";
    const result = sanitizeAutoCompleteResponse(raw, { prefix, suffix: "" });

    expect(result).toBe("");
  });

  it("truncates top-level tail examples after function body", () => {
    const raw = [
      "return max(min_value, min(max_value, value))",
      "",
      "# Another example using the built-in min and max functions:",
      "def clamp(value, min_value, max_value):",
      "    return min(max(value, min_value), max_value)",
    ].join("\n");

    const result = sanitizeAutoCompleteResponse(raw);
    expect(result).toBe("return max(min_value, min(max_value, value))");
  });

  it("truncates top-level escape for indented insertion context", () => {
    const prefix = "def calc_fib(n):\n    ";
    const raw = [
      "if n <= 1:",
      "        return n",
      "    return calc_fib(n - 1) + calc_fib(n - 2)",
      "",
      "print(calc_fib(5))",
    ].join("\n");

    const result = sanitizeAutoCompleteResponse(raw, { prefix, suffix: "" });
    expect(result).toBe(
      [
        "if n <= 1:",
        "        return n",
        "    return calc_fib(n - 1) + calc_fib(n - 2)",
      ].join("\n")
    );
  });
});
