/** What User reads of an unreadable `pipeline-agent-start.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS            from './FrozenSnapshotStartProblems.json';
import { SnapshotStartIngestion } from './SnapshotStartIngestion.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-snapshot-start'), 'pipeline-agent-start.json');
    writeFileSync(filePath, stored);
    expect(new SnapshotStartIngestion(filePath).read()).toEqual({ verdict: 'unreadable', reason: sentence });
  });
}
