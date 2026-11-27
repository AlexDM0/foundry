/** What User reads of an unreadable `stage-statement.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }       from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS                  from './FrozenStageStatementProblems.json';
import { StageStatementIngestion }      from './StageStatementIngestion.ts';
import { StageStatementProblemWording } from './StageStatementProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-stage-statement'), 'stage-statement.json');
    writeFileSync(filePath, stored);
    const reading = new StageStatementIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? StageStatementProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
