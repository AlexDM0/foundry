/** Each line refusal and merge step problem words as the sentence its verdict's reason held before it was typed. */
import { describe, expect, test } from 'bun:test';

import type { LineRefusal }        from '../shared/@types/LineRefusal.ts';
import type { MergeStepProblem }   from '../shared/@types/MergeStepProblem.ts';
import { LineRefusalWording }      from './LineRefusalWording.ts';
import { MergeStepProblemWording } from './MergeStepProblemWording.ts';

const LINE_REFUSAL_SENTENCES: readonly (readonly [LineRefusal, string])[] = [
  [{ code: 'shell-run-refused', refusal: 'network-share-folder', directory: '\\\\server\\share\\app' },
    'cmd.exe runs no line in the network share folder \\\\server\\share\\app; move the repository to a drive letter'],
  [{ code: 'shell-run-refused', refusal: 'no-absolute-interpreter', directory: '/example' },
    'no absolute cmd.exe path is known: ComSpec and SystemRoot are both unset or relative'],
  [{ code: 'shell-run-refused', refusal: 'no-shell-grammar', directory: '/example' }, 'this platform has no shell to run a line in'],
  [{ code: 'denied-root-unmade', deniedRoot: '/w/a/.claude' }, 'the denied folder /w/a/.claude could not be made, so it would get no read-only mount'],
  [{ code: 'confinement-refused', confinementRefusal: { cause: 'confinement-unavailable', unavailability: { cause: 'bubblewrap-not-on-search-path' } } },
    'bwrap (bubblewrap) is not on the search path'],
];

const MERGE_STEP_SENTENCES: readonly (readonly [MergeStepProblem, string])[] = [
  [{ code: 'tip-unreadable', branch: 'main' }, 'The tip of main cannot be read.'],
  [{
    code: 'holding-unknown', branch: 'ticket-001', target: 'main', targetTip: 'abc'
  }, 'git cannot tell whether ticket-001 holds main\'s tip abc.'],
  [{ code: 'merge-tree-unreadable', mergeCommit: 'def' }, 'The tree of the merge commit def cannot be read.'],
  [{ code: 'head-tree-unreadable', branch: 'ticket-001' }, 'The tree of ticket-001\'s HEAD cannot be read.'],
  [{ code: 'merge-settled-failed', storedReason: 'git merge exited with 128: fatal: example' }, 'git merge exited with 128: fatal: example'],
];

describe('the sentence of each line refusal', () => {
  test.each(LINE_REFUSAL_SENTENCES.map(([refusal, sentence]) => [refusal.code, refusal, sentence] as const))('%s', (_code, refusal, sentence) => {
    expect(LineRefusalWording.sentenceOf(refusal)).toBe(sentence);
  });
});

describe('the sentence of each merge step problem', () => {
  test.each(MERGE_STEP_SENTENCES.map(([problem, sentence]) => [problem.code, problem, sentence] as const))('%s', (_code, problem, sentence) => {
    expect(MergeStepProblemWording.sentenceOf(problem)).toBe(sentence);
  });
});
