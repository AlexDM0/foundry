/** What User reads of an unreadable `target-merge-settlement.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                   from './FrozenMergeSettlementProblems.json';
import { MergeSettlementIngestion }      from './MergeSettlementIngestion.ts';
import { MergeSettlementProblemWording } from './MergeSettlementProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-merge-settlement'), 'target-merge-settlement.json');
    writeFileSync(filePath, stored);
    const reading = new MergeSettlementIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? MergeSettlementProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
