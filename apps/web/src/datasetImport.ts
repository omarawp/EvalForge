export type ImportedCase = {
  input: unknown;
  expected_output: unknown;
  metadata?: Record<string, unknown>;
};

export function parseValue(value: string, forceJSON = false): unknown {
  if (
    !forceJSON &&
    !["[", "{", '"'].some((prefix) => value.trim().startsWith(prefix))
  ) {
    return value;
  }
  if (forceJSON) return JSON.parse(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseImport(text: string): ImportedCase[] {
  const content = text.trim();
  const parsed: unknown = content.startsWith("[")
    ? JSON.parse(content)
    : content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  if (
    !Array.isArray(parsed) ||
    !parsed.length ||
    parsed.length > 500 ||
    parsed.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        !("input" in item) ||
        !("expected_output" in item),
    )
  ) {
    throw new Error(
      "Use 1–500 JSON or JSONL cases with input and expected_output fields.",
    );
  }
  return parsed as ImportedCase[];
}
