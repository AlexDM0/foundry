import type { StoredFileProblem } from './StoredFileProblem.ts';

/** Why a ticket, epic or draft file gave no text; `systemError` is the thrown error as the runtime writes it, a fact. */
export type RecordFileReadProblem =
  | StoredFileProblem<'file-unreadable'> & { readonly systemError: string }
  | StoredFileProblem<'file-not-utf8-text'>;
