/**
 * The words of the stored-file problems every format shares, as the reason an ingestion reports, so a caller that names the file only
 * prefixes it. A format with codes of its own words them in its own wording and hands the base codes here.
 */
import type { BaseStoredFileProblem, TransitionalWordedProblem } from '../../shared/@types/StoredFileProblem.ts';

function sentenceOf(problem: BaseStoredFileProblem | TransitionalWordedProblem): string {
  switch (problem.code) {
    case 'bytes-unreadable':    return `it could not be read (${problem.systemError})`;
    case 'not-utf8-text':       return 'it is not UTF-8 text';
    case 'not-json':            return `it is not valid JSON (${problem.parserError})`;
    case 'not-a-json-object':   return 'it is not a JSON object';
    case 'version-differs':     return `its ${problem.field} is not ${problem.expectedVersion}`;
    case 'transitional-worded': return problem.sentence;
  }
}

type TransitionalReasoned<Verdict> = Verdict extends { verdict: 'unreadable' } ? { verdict: 'unreadable'; reason: string } : Verdict;

/** The bridge for a format whose reading still carries `reason`: its unreadable verdict worded, any other verdict as it is. */
function transitionalReasonedOf<Verdict extends { verdict: 'absent' } | { verdict: 'unreadable'; problem: BaseStoredFileProblem }>(
  notReadable: Verdict,
): TransitionalReasoned<Verdict> {
  if (notReadable.verdict === 'absent') return notReadable as TransitionalReasoned<Verdict>;
  return { verdict: 'unreadable', reason: sentenceOf(notReadable.problem) } as TransitionalReasoned<Verdict>;
}

export const StoredFileProblemWordingUtil = Object.freeze({ sentenceOf, transitionalReasonedOf });
