/**
 * The kept Airlock facts both ways. What matters: what the writer stores reads back as the same facts, so the agent is told what the merge
 * kept; a missing file is absent, which a fixer of a clean merge-in reads as no conflict; every other file that is not whole facts is
 * unreadable, never a throw, so no agent is told a wrong list.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AirlockFactsIngestion, type KeptAirlockFacts }   from './AirlockFactsIngestion.ts';
import { AirlockFactsProblemWording }                     from './AirlockFactsProblemWording.ts';
import { createAirlockFactsWriter }                       from './AirlockFactsWriter.ts';

let scratchDirectory: string | null = null;

let factsFilePath = '';

const reading = (): ReturnType<AirlockFactsIngestion['read']> => new AirlockFactsIngestion(factsFilePath).read();

const VALID_FIELDS = '"conflictedFiles":["src/Example.ts"],"leavesTheMergeOpen":false,"filesResolvedBefore":[]';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('airlock-facts-ingestion');
  factsFilePath = join(scratchDirectory, 'airlock-facts.json');
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same facts', () => {
  const facts: KeptAirlockFacts = { conflictedFiles: ['src/Example.ts', 'src/Other.ts'], leavesTheMergeOpen: true, filesResolvedBefore: ['packages/a/A.ts'] };

  createAirlockFactsWriter(factsFilePath).write(facts);

  expect(reading()).toEqual({ verdict: 'readable', facts });
});

test.each([
  ['not JSON', '{"conflictedFiles": ', 'it is not valid JSON'],
  ['not an object', '[]', 'it is not a JSON object'],
  ['no version', `{${VALID_FIELDS}}`, 'its version is not 1'],
  ['another version', `{"version":2,${VALID_FIELDS}}`, 'its version is not 1'],
  ['conflicted files as one text', '{"version":1,"conflictedFiles":"src/Example.ts","leavesTheMergeOpen":false,"filesResolvedBefore":[]}', '"conflictedFiles"'],
  ['an empty conflicted file path', '{"version":1,"conflictedFiles":[""],"leavesTheMergeOpen":false,"filesResolvedBefore":[]}', '"conflictedFiles"'],
  ['no open-merge fact', '{"version":1,"conflictedFiles":[],"filesResolvedBefore":[]}', '"leavesTheMergeOpen"'],
  ['an open-merge fact as text', '{"version":1,"conflictedFiles":[],"leavesTheMergeOpen":"true","filesResolvedBefore":[]}', '"leavesTheMergeOpen"'],
  ['no files resolved before', '{"version":1,"conflictedFiles":[],"leavesTheMergeOpen":false}', '"filesResolvedBefore"'],
])('%s is unreadable, never a throw', (_case, storedText, reason) => {
  writeFileSync(factsFilePath, storedText);

  const factsReading = reading();

  expect(factsReading.verdict).toBe('unreadable');
  expect(factsReading.verdict === 'unreadable' ? AirlockFactsProblemWording.sentenceOf(factsReading.problem) : '').toContain(reason);
});
