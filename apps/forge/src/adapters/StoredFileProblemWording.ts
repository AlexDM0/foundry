/**
 * The words of the stored-file problems every format shares, as the reason an ingestion reports, so a caller that names the file only
 * prefixes it. A format with codes of its own words them in its own wording and hands the base codes here.
 */
import type { BaseStoredFileProblem } from '../shared/@types/StoredFileProblem.ts';

function sentenceOf(problem: BaseStoredFileProblem): string {
  switch (problem.code) {
    case 'bytes-unreadable':  return `it could not be read (${problem.systemError})`;
    case 'not-utf8-text':     return 'it is not UTF-8 text';
    case 'not-json':          return `it is not valid JSON (${problem.parserError})`;
    case 'not-a-json-object': return 'it is not a JSON object';
    case 'version-differs':   return `its ${problem.field} is not ${problem.expectedVersion}`;
  }
}

export const StoredFileProblemWording = Object.freeze({ sentenceOf });
