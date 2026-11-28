/** Every reason a ticket file gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_TICKET_PROBLEMS                             from './FrozenTicketProblems.json';
import { TicketFileIngestion }                            from './TicketFileIngestion.ts';
import { TicketFileProblemWording }                       from './TicketFileProblemWording.ts';

const NOT_UTF8_BYTES = Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a);

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'a directory stands where the file belongs (built in the spec; {systemError} is the OS message)': (filePath) => mkdirSync(filePath),
  'the bytes are not UTF-8 text (built in the spec)':                                               (filePath) => writeFileSync(filePath, NOT_UTF8_BYTES),
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, '004-fix-the-export-dialog.md');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function sentenceAt(): string | null {
  const reading = new TicketFileIngestion(filePath()).read();
  return reading.verdict === 'malformed' ? TicketFileProblemWording.sentenceOf(reading.problem) : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-tickets-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_TICKET_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(sentenceAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
