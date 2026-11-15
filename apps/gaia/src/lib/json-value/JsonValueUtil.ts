/**
 * Reading unchecked JSON without a throw: a parse that answers null for text that is no JSON, a JSON object and nothing else, and a key
 * held as the object's own.
 */
export type JsonObject = Readonly<Record<string, unknown>>;

/** `null` for text that is no JSON, so a caller tells a parsed `null` apart from a failed parse. */
function parsedValueOf(text: string): { readonly parsed: unknown } | null {
  try {
    return { parsed: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A JSON object, and nothing else: `null` for an array, `null` itself and every other value. */
function jsonObjectOf(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

/** `undefined` for a key the object does not hold as its own, so an inherited key such as `constructor` never reads as a value. */
function ownValueOf(record: JsonObject, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export const JsonValueUtil = {
  parsedValueOf,
  isJsonObject,
  jsonObjectOf,
  ownValueOf,
} as const;
