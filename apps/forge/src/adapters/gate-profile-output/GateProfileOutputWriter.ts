import { appendFileSync } from 'node:fs';

import type { GitRunFailure }                 from '../../lib/git/@types/GitProblem.ts';
import type { LineRefusal }                   from '../../shared/@types/LineRefusal.ts';
import { GitProblemWording }                  from '../GitProblemWording.ts';
import { LineRefusalWording }                 from '../LineRefusalWording.ts';
import { GATE_PROFILE_OUTPUT_FORMAT_VERSION } from './GateProfileOutputIngestion.ts';

/**
 * Appended in place as the output arrives, not atomically: a reader waits for a line's line feed, so a torn last line is never read. A refused
 * line's output is its refusal, worded, and a profile git made no worktree for has git's failure, worded.
 */
export function createGateProfileOutputWriter(outputFilePath: string): {
  append(text: string): void;
  appendRefusal(refusal: LineRefusal): void;
  appendGitFailure(failure: GitRunFailure): void;
} {
  const append = (text: string): void => appendFileSync(outputFilePath, `${JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, text })}\n`);
  return {
    append,
    appendRefusal:    (refusal) => append(LineRefusalWording.sentenceOf(refusal)),
    appendGitFailure: (failure) => append(GitProblemWording.sentenceOf(failure)),
  };
}
