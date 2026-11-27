import type { StoredRecordProblem } from './StoredRecordProblem.ts';

/** Why a stored `gate-profiles.json` cannot be read. */
export type GateProfilesProblem =
  | StoredRecordProblem
  | { readonly code: 'not-an-id'; readonly field: string; readonly storedValue: unknown; readonly example: string }
  | { readonly code: 'neither-null-nor-a-whole-number-of-at-least'; readonly field: string; readonly lowest: number };
