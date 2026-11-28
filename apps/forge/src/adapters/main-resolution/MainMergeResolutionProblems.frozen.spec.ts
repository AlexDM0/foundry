/** What User reads does not change: each reason `main-resolution.json` gives stays the sentence its frozen table holds. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import frozenProblems                                     from './FrozenMainMergeResolutionProblems.json' with { type: 'json' };
import { MainMergeResolutionIngestion }                   from './MainMergeResolutionIngestion.ts';
import { MainMergeResolutionProblemWording }              from './MainMergeResolutionProblemWording.ts';

const NOT_UTF8_CASE = 'bytes that are not UTF-8';

let scratchDirectory: string | null = null;

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

function systemErrorOf(filePath: string): string {
  try {
    readFileSync(filePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

test.each(frozenProblems)('$case', ({ case: problemCase, stored, sentence }) => {
  scratchDirectory = createScratchDirectory('frozen-main-resolution-problems');
  const filePath = join(scratchDirectory, 'main-resolution.json');
  if (stored !== null) writeFileSync(filePath, stored);
  else if (problemCase === NOT_UTF8_CASE) writeFileSync(filePath, Uint8Array.of(0xff, 0xfe, 0xfd));
  else mkdirSync(filePath);

  const reading = new MainMergeResolutionIngestion(filePath).read();
  expect(reading.verdict).toBe('unreadable');
  expect(reading.verdict === 'unreadable' ? MainMergeResolutionProblemWording.sentenceOf(reading.problem) : '').toBe(sentence.replace('{systemError}', systemErrorOf(filePath)));
});
