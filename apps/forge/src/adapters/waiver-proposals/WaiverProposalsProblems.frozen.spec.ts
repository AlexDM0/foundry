/** What User reads of an unreadable `waiver-proposals.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                   from './FrozenWaiverProposalsProblems.json';
import { WaiverProposalsIngestion }      from './WaiverProposalsIngestion.ts';
import { WaiverProposalsProblemWording } from './WaiverProposalsProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-waiver-proposals'), 'waiver-proposals.json');
    writeFileSync(filePath, stored);
    const reading = new WaiverProposalsIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? WaiverProposalsProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
