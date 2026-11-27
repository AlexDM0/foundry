/**
 * Conditions on the fields of a child's JSON line, by dotted path through own properties only: texts, booleans and numbers compared, never
 * free text searched. A launch hands them in as data, so whoever renders them owns their meaning and this matcher knows no vendor.
 */
export type FieldCondition =
  | { test: 'equals'; path: string; value: string | number | boolean | null }
  | { test: 'one-of'; path: string; values: readonly (string | number | boolean)[] }
  | { test: 'number-between'; path: string; least: number; most: number };

export interface LineConditions {
  allOf:  readonly FieldCondition[];
  /** Empty holds. */
  anyOf:  readonly FieldCondition[];
  noneOf: readonly FieldCondition[];
}

export type ParsedLine = Readonly<Record<string, unknown>>;

type ConditionValue = string | number | boolean;

export function parsedLineOf(line: string): ParsedLine | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownFieldOf(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function valueAtDottedPath(parsed: ParsedLine, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, key) => (typeof value === 'object' && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined), parsed);
}

function conditionHolds(parsed: ParsedLine, condition: FieldCondition): boolean {
  const value = valueAtDottedPath(parsed, condition.path);
  switch (condition.test) {
    case 'equals':
      return value === condition.value;
    case 'one-of':
      return (condition.values as readonly unknown[]).includes(value);
    case 'number-between':
      return typeof value === 'number' && Number.isFinite(value) && condition.least <= value && value <= condition.most;
  }
}

export function lineMeets(parsed: ParsedLine, conditions: LineConditions): boolean {
  return conditions.allOf.every((condition) => conditionHolds(parsed, condition))
    && (conditions.anyOf.length === 0 || conditions.anyOf.some((condition) => conditionHolds(parsed, condition)))
    && !conditions.noneOf.some((condition) => conditionHolds(parsed, condition));
}

function isConditionValue(value: unknown): value is ConditionValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fieldConditionOf(value: unknown): FieldCondition | null {
  if (!isPlainRecord(value)) return null;
  const path = ownFieldOf(value, 'path');
  if (typeof path !== 'string' || path.length === 0) return null;
  switch (ownFieldOf(value, 'test')) {
    case 'equals': {
      const expected = ownFieldOf(value, 'value');
      return expected === null || isConditionValue(expected) ? { test: 'equals', path, value: expected } : null;
    }
    case 'one-of': {
      const values = ownFieldOf(value, 'values');
      return Array.isArray(values) && values.every(isConditionValue) ? { test: 'one-of', path, values: [...values] } : null;
    }
    case 'number-between': {
      const least = ownFieldOf(value, 'least');
      const most = ownFieldOf(value, 'most');
      return isFiniteNumber(least) && isFiniteNumber(most) && least <= most ? {
        test: 'number-between', path, least, most
      } : null;
    }
    default:
      return null;
  }
}

function fieldConditionsOf(value: unknown): FieldCondition[] | null {
  if (!Array.isArray(value)) return null;
  const conditions = value.map(fieldConditionOf);
  return conditions.every((condition) => condition !== null) ? conditions : null;
}

/** The launch frame's validator: every field present and well typed, or `null`. */
export function lineConditionsOf(value: unknown): LineConditions | null {
  if (!isPlainRecord(value)) return null;
  const allOf = fieldConditionsOf(ownFieldOf(value, 'allOf'));
  const anyOf = fieldConditionsOf(ownFieldOf(value, 'anyOf'));
  const noneOf = fieldConditionsOf(ownFieldOf(value, 'noneOf'));
  return allOf === null || anyOf === null || noneOf === null ? null : { allOf, anyOf, noneOf };
}
