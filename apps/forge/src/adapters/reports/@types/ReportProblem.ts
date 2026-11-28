/** A JSON Schema type a report schema names. */
export type JsonSchemaType = 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';

/** Why a report breaks its schema, `path` the offending value's JSON path from the report (`$.gates[0].name`); the values are the schema's. */
export type ReportProblem =
  | { readonly code: 'required'; readonly path: string }
  | { readonly code: 'not-allowed'; readonly path: string }
  | { readonly code: 'not-of-type'; readonly path: string; readonly expectedTypes: readonly JsonSchemaType[] }
  | { readonly code: 'not-in-enum'; readonly path: string; readonly allowedValues: readonly unknown[] }
  | { readonly code: 'not-the-constant'; readonly path: string; readonly constant: unknown }
  | { readonly code: 'shorter-than-minimum'; readonly path: string; readonly minimumLength: number }
  | { readonly code: 'longer-than-maximum'; readonly path: string; readonly maximumLength: number }
  | { readonly code: 'pattern-mismatch'; readonly path: string; readonly pattern: string }
  | { readonly code: 'matches-no-any-of-branch'; readonly path: string }
  | { readonly code: 'one-of-branches-not-one'; readonly path: string; readonly matchingBranches: number }
  | { readonly code: 'fewer-items-than-minimum'; readonly path: string; readonly minimumItems: number };
