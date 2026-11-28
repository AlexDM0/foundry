/** What User reads of an unreadable `document-agent-seen-head.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS            from './FrozenSeenHeadProblems.json';
import { SeenHeadIngestion }      from './SeenHeadIngestion.ts';
import { SeenHeadProblemWording } from './SeenHeadProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-seen-head'), 'document-agent-seen-head.json');
    writeFileSync(filePath, stored);
    const reading = new SeenHeadIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? SeenHeadProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
