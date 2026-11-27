/** What User reads does not change: each reason a stored `pipeline.json` gives stays the sentence its frozen table holds. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import frozenProblems                                     from './FrozenPipelineProblems.json' with { type: 'json' };
import { PipelineFile }                                   from './PipelineFile.ts';

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

/** Not a stored text: the reason of a pipeline with entities in a tracker in a folder, as the tracker's read builds it. */
const ENTITIES_IN_A_FOLDER_CASE = 'entitiesInAFolderReadingOf';

test.each(frozenProblems)('$case', ({ case: caseText, stored, sentence }) => {
  if (caseText.includes(ENTITIES_IN_A_FOLDER_CASE)) {
    expect(PipelineFile.entitiesInAFolderReadingOf('apps/web')).toMatchObject({ verdict: 'malformed', reason: sentence });
    return;
  }
  scratchDirectory = createScratchDirectory('frozen-pipeline-problems');
  const filePath = join(scratchDirectory, 'pipeline.json');
  writeStored(filePath, caseText, stored);

  const reading = PipelineFile.read(filePath);

  expect(reading).toEqual({ verdict: 'malformed', reason: sentence.replace('{systemError}', systemErrorOf(filePath)) });
});
