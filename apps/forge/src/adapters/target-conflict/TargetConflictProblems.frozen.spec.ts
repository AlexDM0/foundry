/** What User reads of an unreadable `target-conflict.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }       from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                  from './FrozenTargetConflictProblems.json';
import { TargetConflictIngestion }      from './TargetConflictIngestion.ts';
import { TargetConflictProblemWording } from './TargetConflictProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-target-conflict'), 'target-conflict.json');
    writeFileSync(filePath, stored);
    const reading = new TargetConflictIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? TargetConflictProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
