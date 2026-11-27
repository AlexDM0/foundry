/** What User reads of an unreadable `stage-statement.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }  from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS             from './FrozenStageStatementProblems.json';
import { StageStatementIngestion } from './StageStatementIngestion.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-stage-statement'), 'stage-statement.json');
    writeFileSync(filePath, stored);
    expect(new StageStatementIngestion(filePath).read()).toEqual({ verdict: 'unreadable', reason: sentence });
  });
}
