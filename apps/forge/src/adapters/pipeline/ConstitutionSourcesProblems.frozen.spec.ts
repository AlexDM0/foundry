/** What User reads does not change: each reason a stored `constitution-sources.json` gives stays the sentence its frozen table holds. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { ConstitutionSourcesFile }                        from './ConstitutionSourcesFile.ts';
import frozenProblems                                     from './FrozenConstitutionSourcesProblems.json' with { type: 'json' };
import { PipelineSetupProblemWording }                    from './PipelineSetupProblemWording.ts';

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

/** A row without stored text is built as its case says: a directory in the file's place, or bytes that are not UTF-8. */
function writeStored(filePath: string, caseText: string, stored: string | null): void {
  if (stored !== null) writeFileSync(filePath, stored);
  else if (caseText.includes('built as the byte 0xFF')) writeFileSync(filePath, new Uint8Array([0xff]));
  else mkdirSync(filePath);
}

test.each(frozenProblems)('$case', ({ case: caseText, stored, sentence }) => {
  scratchDirectory = createScratchDirectory('frozen-constitution-sources-problems');
  const filePath = join(scratchDirectory, 'constitution-sources.json');
  writeStored(filePath, caseText, stored);

  const reading = ConstitutionSourcesFile.read(filePath);

  if (reading.verdict !== 'malformed') throw new Error(`expected a malformed reading, read ${reading.verdict}`);
  expect(PipelineSetupProblemWording.constitutionSourcesSentenceOf(reading.problem)).toBe(sentence.replace('{systemError}', systemErrorOf(filePath)));
});
