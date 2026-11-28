import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why one line of Talos's launch registry does not fit. */
export type LaunchRegistryLineProblem =
  | StoredFileProblem<'registry-line-not-json'> & { readonly parserError: string }
  | StoredFileProblem<'registry-line-not-a-json-object'>
  | StoredFileProblem<'registry-line-field-malformed'> & { readonly field: 'childId' | 'childFolder' | 'instance' | 'kind' };

/** Why Talos's launch registry could not be read, or which of its lines, numbered from 1, does not fit. */
export type LaunchRegistryProblem = BaseStoredFileProblem | LaunchRegistryLineProblem & { readonly lineNumber: number };
