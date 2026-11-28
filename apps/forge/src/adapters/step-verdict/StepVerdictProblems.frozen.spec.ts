/** What User reads of an unreadable `build-verdict.json` never changes: each frozen case reads back as today's sentence. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { expect, test }  from 'bun:test';

import { createScratchDirectory }    from '../../testing/ScratchWorkspace.ts';
import FROZEN_PROBLEMS               from './FrozenStepVerdictProblems.json';
import { StepVerdictIngestion }      from './StepVerdictIngestion.ts';
import { StepVerdictProblemWording } from './StepVerdictProblemWording.ts';

for (const { case: problemCase, stored, sentence } of FROZEN_PROBLEMS) {
  test(`${problemCase}: ${sentence}`, () => {
    const filePath = join(createScratchDirectory('frozen-step-verdict'), 'build-verdict.json');
    writeFileSync(filePath, stored);
    const reading = new StepVerdictIngestion(filePath).read();
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? StepVerdictProblemWording.sentenceOf(reading.problem) : '').toBe(sentence);
  });
}
