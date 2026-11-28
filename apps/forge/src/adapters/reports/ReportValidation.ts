/**
 * Validates a value against the draft-07 subset the report schemas use, so the schema handed to the agent's command line and the check run
 * on its report are one source: `type`, `enum`, `const`, `properties`, `required`, `additionalProperties: false`, `items`, `minItems`,
 * `minLength`, `maxLength`, `pattern`, `anyOf`, `oneOf` and `if`/`then`. The schema type admits no other keyword, so none is silently ignored.
 */
import type { JsonSchemaType, ReportProblem } from './@types/ReportProblem.ts';

export interface JsonSchema {
  $schema?:              string;
  title?:                string;
  type?:                 JsonSchemaType | readonly JsonSchemaType[];
  enum?:                 readonly unknown[];
  const?:                unknown;
  properties?:           Readonly<Record<string, JsonSchema>>;
  required?:             readonly string[];
  additionalProperties?: false;
  items?:                JsonSchema;
  minItems?:             number;
  minLength?:            number;
  maxLength?:            number;
  pattern?:              string;
  anyOf?:                readonly JsonSchema[];
  oneOf?:                readonly JsonSchema[];
  if?:                   JsonSchema;
  then?:                 JsonSchema;
}

export type ReportVerdict = { verdict: 'valid' } | { verdict: 'invalid'; problems: ReportProblem[] };

function typeOf(value: unknown): JsonSchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  return 'object';
}

function typeMatches(value: unknown, expected: JsonSchemaType | readonly JsonSchemaType[]): boolean {
  const actual = typeOf(value);
  const allowed: readonly JsonSchemaType[] = typeof expected === 'string' ? [expected] : expected;
  return allowed.includes(actual) || (actual === 'integer' && allowed.includes('number'));
}

function objectProblemsOf(schema: JsonSchema, value: Record<string, unknown>, path: string): ReportProblem[] {
  const problems = (schema.required ?? []).filter((key) => !Object.hasOwn(value, key)).map((key): ReportProblem => ({ code: 'required', path: `${path}.${key}` }));
  for (const [key, entry] of Object.entries(value)) {
    const propertySchema = schema.properties !== undefined && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
    if (propertySchema !== undefined) problems.push(...problemsOf(propertySchema, entry, `${path}.${key}`));
    else if (schema.additionalProperties === false) problems.push({ code: 'not-allowed', path: `${path}.${key}` });
  }
  return problems;
}

function stringProblemsOf(schema: JsonSchema, value: string, path: string): ReportProblem[] {
  const problems: ReportProblem[] = [];
  if (schema.minLength !== undefined && value.length < schema.minLength) problems.push({ code: 'shorter-than-minimum', path, minimumLength: schema.minLength });
  if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push({ code: 'longer-than-maximum', path, maximumLength: schema.maxLength });
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) problems.push({ code: 'pattern-mismatch', path, pattern: schema.pattern });
  return problems;
}

function compositionProblemsOf(schema: JsonSchema, value: unknown, path: string): ReportProblem[] {
  const problems: ReportProblem[] = [];
  if (schema.anyOf !== undefined && !schema.anyOf.some((branch) => problemsOf(branch, value, path).length === 0)) problems.push({ code: 'matches-no-any-of-branch', path });
  if (schema.oneOf !== undefined) {
    const matches = schema.oneOf.filter((branch) => problemsOf(branch, value, path).length === 0).length;
    if (matches !== 1) problems.push({ code: 'one-of-branches-not-one', path, matchingBranches: matches });
  }
  if (schema.if !== undefined && schema.then !== undefined && problemsOf(schema.if, value, path).length === 0) problems.push(...problemsOf(schema.then, value, path));
  return problems;
}

function problemsOf(schema: JsonSchema, value: unknown, path: string): ReportProblem[] {
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    return [{ code: 'not-of-type', path, expectedTypes: typeof schema.type === 'string' ? [schema.type] : schema.type }];
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) return [{ code: 'not-in-enum', path, allowedValues: schema.enum }];
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return [{ code: 'not-the-constant', path, constant: schema.const }];
  const problems = compositionProblemsOf(schema, value, path);
  if (typeof value === 'string') problems.push(...stringProblemsOf(schema, value, path));
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push({ code: 'fewer-items-than-minimum', path, minimumItems: schema.minItems });
    if (schema.items !== undefined) value.forEach((item, index) => problems.push(...problemsOf(schema.items as JsonSchema, item, `${path}[${index}]`)));
  }
  if (typeOf(value) === 'object') problems.push(...objectProblemsOf(schema, value as Record<string, unknown>, path));
  return problems;
}

export function reportVerdictOf(schema: JsonSchema, report: unknown): ReportVerdict {
  const problems = problemsOf(schema, report, '$');
  return problems.length === 0 ? { verdict: 'valid' } : { verdict: 'invalid', problems };
}
