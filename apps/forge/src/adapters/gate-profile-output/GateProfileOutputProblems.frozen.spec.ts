/** What User reads does not change: each reason a gate profile's output file or one of its lines gives stays the sentence its frozen table holds. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import frozenProblems                                     from './FrozenGateProfileOutputProblems.json' with { type: 'json' };
import { GateProfileOutputIngestion }                     from './GateProfileOutputIngestion.ts';

let scratchDirectory: string | null = null;

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

function systemErrorOf(filePath: string): string {
  try {
    readFileSync(filePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

test.each(frozenProblems)('$case', ({ stored, sentence }) => {
  scratchDirectory = createScratchDirectory('frozen-gate-profile-output-problems');
  const filePath = join(scratchDirectory, 'P1.ndjson');
  if (stored === null) mkdirSync(filePath);
  else writeFileSync(filePath, `${stored}\n`);

  const reading = new GateProfileOutputIngestion(filePath).read();
  const unreadableReading = reading.verdict === 'readable' ? reading.lines[0] : reading;
  expect(unreadableReading).toEqual({ verdict: 'unreadable', reason: sentence.replace('{systemError}', systemErrorOf(filePath)) });
});
