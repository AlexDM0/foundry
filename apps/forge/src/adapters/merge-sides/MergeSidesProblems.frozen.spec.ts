/** What User reads of an unreadable `target-merge.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }   from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS              from './FrozenMergeSidesProblems.json';
import { MergeSidesIngestion }      from './MergeSidesIngestion.ts';
import { MergeSidesProblemWording } from './MergeSidesProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-merge-sides'), 'target-merge.json');
    writeFileSync(filePath, stored);
    const reading = new MergeSidesIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? MergeSidesProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
