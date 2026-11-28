/** What User reads does not change: the one reason a Hatch request file gives, that it cannot be read, stays the sentence its frozen table holds. */
import { mkdirSync, readFileSync } from 'node:fs';
import { join }                    from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { StoredFileProblemWording }                       from '../StoredFileProblemWording.ts';
import frozenProblems                                     from './FrozenHatchRequestProblems.json' with { type: 'json' };
import { HatchRequestIngestion }                          from './HatchRequestIngestion.ts';

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

test.each(frozenProblems)('$case', ({ sentence }) => {
  scratchDirectory = createScratchDirectory('frozen-hatch-request-problems');
  const filePath = join(scratchDirectory, 'R1.json');
  mkdirSync(filePath);

  const reading = new HatchRequestIngestion(filePath).read();
  expect(reading.verdict).toBe('unreadable');
  expect(reading.verdict === 'unreadable' ? StoredFileProblemWording.sentenceOf(reading.problem) : '').toBe(sentence.replace('{systemError}', systemErrorOf(filePath)));
});
