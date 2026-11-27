/** What User reads of an unreadable `progress.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }     from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                from './FrozenProgressFileProblems.json';
import { ProgressFileIngestion }      from './ProgressFileIngestion.ts';
import { ProgressFileProblemWording } from './ProgressFileProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-progress'), 'progress.json');
    writeFileSync(filePath, stored);
    const reading = new ProgressFileIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? ProgressFileProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
