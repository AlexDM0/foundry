/** A progress file's problem as the sentence User reads, for a spec that asserts what the validation names. */
import type { ProgressFileProblem }   from '../../../shared/@types/ProgressFileProblem.ts';
import { ProgressFileProblemWording } from '../ProgressFileProblemWording.ts';
import { ProgressFileValidationUtil } from '../utils/ProgressFileValidationUtil.ts';

export function sentenceOfProblem(problem: ProgressFileProblem | null): string | null {
  return problem === null ? null : ProgressFileProblemWording.sentenceOf(problem);
}

/** The validation's reading, an unreadable one worded as its `reason`. */
export function wordedReadingOf(parsed: unknown): { verdict: 'readable' } | { verdict: 'unreadable'; reason: string } {
  const reading = ProgressFileValidationUtil.readingOf(parsed);
  return reading.verdict === 'readable' ? { verdict: 'readable' } : { verdict: 'unreadable', reason: ProgressFileProblemWording.sentenceOf(reading.problem) };
}
