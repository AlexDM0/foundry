/**
 * A rule that answers a child's stdout line while nobody watches: every `whenAllEqual` dotted path of the line holds its value and no
 * `whenNoneEqual` path does. Its `replyTemplate` has `{{request_id}}` filled from the line's own `request_id`.
 */
export interface StandingReply {
  readonly whenAllEqual:  Readonly<Record<string, string | boolean>>;
  readonly whenNoneEqual: Readonly<Record<string, string | boolean>>;
  readonly replyTemplate: string;
}

const REQUEST_IDENTIFIER_PLACEHOLDER = '{{request_id}}';

function parsedObjectOf(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function valueAtDottedPath(record: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, key) => (typeof value === 'object' && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined), record);
}

/**
 * The reply the first matching rule writes, or `null`: a line that is not a JSON object, matches no rule, or lacks the string
 * `request_id` its template needs is never answered, so whatever no rule names, a question above all, waits for the Overseer.
 */
export function standingReplyFor(line: string, standingReplies: readonly StandingReply[]): string | null {
  const record = parsedObjectOf(line);
  if (record === null) return null;
  const holds = (path: string, value: string | boolean): boolean => valueAtDottedPath(record, path) === value;
  const matchingRule = standingReplies.find((rule) => Object.entries(rule.whenAllEqual).every(([path, value]) => holds(path, value))
    && !Object.entries(rule.whenNoneEqual).some(([path, value]) => holds(path, value)));
  if (matchingRule === undefined) return null;
  if (!matchingRule.replyTemplate.includes(REQUEST_IDENTIFIER_PLACEHOLDER)) return matchingRule.replyTemplate;
  const requestIdentifier = record['request_id'];
  if (typeof requestIdentifier !== 'string') return null;
  // The placeholder sits inside a JSON string, so the identifier goes in escaped as one.
  const escapedRequestIdentifier = JSON.stringify(requestIdentifier).slice(1, -1);
  return matchingRule.replyTemplate.replaceAll(REQUEST_IDENTIFIER_PLACEHOLDER, () => escapedRequestIdentifier);
}

/** The launch's validator: a well-formed rule, or `null`; keys it does not name are dropped. */
export function standingReplyOf(value: unknown): StandingReply | null {
  const isConditionRecord = (item: unknown): item is Record<string, string | boolean> => typeof item === 'object' && item !== null && !Array.isArray(item)
    && Object.values(item).every((condition) => typeof condition === 'string' || typeof condition === 'boolean');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { whenAllEqual, whenNoneEqual, replyTemplate } = value as Record<string, unknown>;
  if (!isConditionRecord(whenAllEqual) || !isConditionRecord(whenNoneEqual) || typeof replyTemplate !== 'string') return null;
  return { whenAllEqual, whenNoneEqual, replyTemplate };
}
