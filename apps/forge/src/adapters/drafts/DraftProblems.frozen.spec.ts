/** Every reason a draft file gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { DraftFileIngestion }                             from './DraftFileIngestion.ts';
import { DraftFileProblemWording }                        from './DraftFileProblemWording.ts';
import FROZEN_DRAFT_PROBLEMS                              from './FrozenDraftProblems.json';

const DIRECTORY_CASE = 'a directory stands where the file belongs (built in the spec; {systemError} is the OS message)';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = { [DIRECTORY_CASE]: (filePath) => mkdirSync(filePath) };

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, 'D1.json');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

/** The parser's own message for the first text of `stored` that is no JSON, since it is the runtime's words, not forge's. */
function parserErrorOf(stored: string | null): string {
  for (const text of stored === null ? [] : [stored]) {
    try {
      JSON.parse(text);
    } catch (error) {
      return error instanceof Error ? error.message : '';
    }
  }
  return '';
}

function sentenceAt(): string | null {
  const reading = new DraftFileIngestion(filePath()).read();
  return reading.verdict === 'malformed' ? DraftFileProblemWording.sentenceOf(reading.problem) : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-draft-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_DRAFT_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(sentenceAt()).toBe(frozenProblem.sentence
    .replace('{systemError}', systemErrorAt(filePath()))
    .replace('{parserError}', parserErrorOf(frozenProblem.stored)));
});
