/** The checks every stored format's validation shares: a stored text parsed as JSON, and whether a parsed value is a whole number. */

export type ParsedJson =
  | { verdict: 'parsed'; value: unknown }
  | { verdict: 'unparseable'; problem: string };

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * The problem is worded as the reason an ingestion reports, so a caller that names a file or a line only prefixes it. A leading byte order
 * mark is skipped, since `JSON.parse` refuses it.
 */
function parsedJsonOf(text: string): ParsedJson {
  try {
    return { verdict: 'parsed', value: JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text) };
  } catch (error) {
    return { verdict: 'unparseable', problem: `it is not valid JSON (${error instanceof Error ? error.message : 'unparseable'})` };
  }
}

function valueIsAWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function wholeNumberIsAtLeast(value: unknown, lowest: number): value is number {
  return valueIsAWholeNumber(value) && value >= lowest;
}

export const StoredValueUtil = {
  parsedJsonOf,
  valueIsAWholeNumber,
  wholeNumberIsAtLeast,
} as const;
