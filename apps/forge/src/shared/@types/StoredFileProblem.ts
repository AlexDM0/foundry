/** Why a stored file could not be read, as a code and the stored values it names; `src/adapters/` words it. */
export interface StoredFileProblem<Code extends string = string> {
  readonly code:   Code;
  /** The stored field the problem is about, as its path in the document (`files[2].path`, `gates.build.run`). */
  readonly field?: string;
}

/** The problems every stored format shares: the bytes, the text, the JSON and its version. `systemError` and `parserError` are facts. */
export type BaseStoredFileProblem =
  | StoredFileProblem<'bytes-unreadable'> & { readonly systemError: string }
  | StoredFileProblem<'not-utf8-text'>
  | StoredFileProblem<'not-json'> & { readonly parserError: string }
  | StoredFileProblem<'not-a-json-object'>
  | StoredFileProblem<'version-differs'> & { readonly field: string; readonly expectedVersion: number };
