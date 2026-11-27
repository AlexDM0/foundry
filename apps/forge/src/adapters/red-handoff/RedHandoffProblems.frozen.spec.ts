/** What User reads of an unreadable `red-handoff.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS            from './FrozenRedHandoffProblems.json';
import { RedHandoffIngestion }    from './RedHandoffIngestion.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-red-handoff'), 'red-handoff.json');
    writeFileSync(filePath, stored);
    expect(new RedHandoffIngestion(filePath).read()).toEqual({ verdict: 'unreadable', reason: sentence });
  });
}
