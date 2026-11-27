/** Every reason a ticket document's version file gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_TICKET_DOCUMENT_CONTENT_PROBLEMS            from './FrozenTicketDocumentContentProblems.json';
import { TicketDocumentContentFile }                      from './TicketDocumentContentFile.ts';
import { TicketDocumentContentProblemWording }            from './TicketDocumentContentProblemWording.ts';

const NOT_UTF8_BYTES = Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a);

/** The hash every row's file is kept under, as its file name says. */
const CONTENT_HASH = '0123456789abcdef';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'the file is absent (built in the spec: nothing is written)':                                     () => undefined,
  'a directory stands where the file belongs (built in the spec; {systemError} is the OS message)': (filePath) => mkdirSync(filePath),
  'the bytes are not UTF-8 text (built in the spec)':                                               (filePath) => writeFileSync(filePath, NOT_UTF8_BYTES),
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, '0123456789abcdef.md');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function sentenceAt(): string | null {
  const reading = TicketDocumentContentFile.read(filePath(), CONTENT_HASH);
  return reading.verdict === 'unreadable' ? TicketDocumentContentProblemWording.sentenceOf(reading.problem) : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-ticket-document-content-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_TICKET_DOCUMENT_CONTENT_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(sentenceAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
