import { describe, expect, it } from "vitest";
import { parseImport, parseValue } from "./datasetImport";

describe("dataset import", () => {
  it("preserves ordinary text while allowing explicit JSON values", () => {
    expect(parseValue("4")).toBe("4");
    expect(parseValue("4", true)).toBe(4);
    expect(parseValue('{"city":"Ottawa"}')).toEqual({ city: "Ottawa" });
  });

  it("accepts JSON arrays and JSONL with structured values", () => {
    expect(
      parseImport('[{"input":{"text":"hello"},"expected_output":true}]')[0],
    ).toEqual({
      input: { text: "hello" },
      expected_output: true,
    });
    expect(
      parseImport(
        '{"input":"a","expected_output":"b"}\n{"input":"c","expected_output":"d"}',
      ),
    ).toHaveLength(2);
  });

  it("rejects empty or incomplete imports", () => {
    expect(() => parseImport("[]")).toThrow();
    expect(() => parseImport('[{"input":"a"}]')).toThrow();
    expect(() => parseImport("not JSON")).toThrow();
  });
});
