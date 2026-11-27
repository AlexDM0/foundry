/**
 * Why a stored record of the board could not be read, as a code and the stored values it names; the model carries it, and `src/adapters/`
 * words it. The document codes are those of `BaseStoredFileProblem` in `src/shared/`, which the model cannot import.
 */
export type StoredDocumentProblem =
  | { readonly code: 'bytes-unreadable'; readonly field?: string; readonly systemError: string }
  | { readonly code: 'not-utf8-text'; readonly field?: string }
  | { readonly code: 'not-json'; readonly field?: string; readonly parserError: string }
  | { readonly code: 'not-a-json-object'; readonly field?: string }
  | { readonly code: 'version-differs'; readonly field: string; readonly expectedVersion: number };

/** The checks of a record's fields every stored record of the pipeline shares; `field` is the path of the value in the document. */
export type StoredRecordFieldProblem =
  | { readonly code: 'not-an-object'; readonly field: string }
  | { readonly code: 'missing'; readonly field: string }
  | { readonly code: 'not-a-list'; readonly field: string }
  | { readonly code: 'not-a-text'; readonly field: string }
  | { readonly code: 'not-true-or-false'; readonly field: string }
  | { readonly code: 'not-a-whole-number-of-at-least'; readonly field: string; readonly lowest: number }
  | { readonly code: 'names-twice'; readonly field: string; readonly name: string }
  | { readonly code: 'not-a-key-of'; readonly field: string; readonly key: string; readonly knownKeys: readonly string[] }
  | { readonly code: 'not-a-word-of'; readonly field: string; readonly storedValue: unknown; readonly vocabulary: readonly string[] }
  | { readonly code: 'format-version-not-read'; readonly field: 'formatVersion'; readonly storedValue: unknown; readonly readVersion: number };

export type StoredRecordProblem = StoredDocumentProblem | StoredRecordFieldProblem;
