/** Each problem of main's constitution reads as the sentence its reason was before the problem was typed. */
import { expect, test } from 'bun:test';

import type { MainConstitutionProblem }   from '../../domain/tracker-model/@types/PipelineSetup.ts';
import { MainConstitutionProblemWording } from './MainConstitutionProblemWording.ts';

test.each<[MainConstitutionProblem, string]>([
  [{ code: 'main-line-unresolved', mainLine: 'main' }, 'the main line main does not resolve to a commit'],
  [{ code: 'git-not-started', gitArguments: ['show', 'abc:CONSTITUTION.md'] }, 'git show abc:CONSTITUTION.md could not be started.'],
  [
    {
      code: 'git-exited', gitArguments: ['show', 'abc:CONSTITUTION.md'], exitCode: 128, gitMessage: 'fatal: bad object'
    },
    'git show abc:CONSTITUTION.md exited with 128: fatal: bad object',
  ],
])('%o reads as today\'s sentence', (problem, sentence) => {
  expect(MainConstitutionProblemWording.sentenceOf(problem)).toBe(sentence);
});
