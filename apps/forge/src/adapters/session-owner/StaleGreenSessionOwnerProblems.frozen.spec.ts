/** What User reads of an unreadable `stale-green-session-owner.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                          from './FrozenStaleGreenSessionOwnerProblems.json';
import { StaleGreenSessionOwnerIngestion }      from './StaleGreenSessionOwnerIngestion.ts';
import { StaleGreenSessionOwnerProblemWording } from './StaleGreenSessionOwnerProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-session-owner'), 'stale-green-session-owner.json');
    writeFileSync(filePath, stored);
    const reading = new StaleGreenSessionOwnerIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? StaleGreenSessionOwnerProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
