/** What User reads of an unreadable `target-merge.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS            from './FrozenMergeSidesProblems.json';
import { MergeSidesIngestion }    from './MergeSidesIngestion.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-merge-sides'), 'target-merge.json');
    writeFileSync(filePath, stored);
    expect(new MergeSidesIngestion(filePath).read()).toEqual({ verdict: 'unreadable', reason: sentence });
  });
}
