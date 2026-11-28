/**
 * The waiver proposals both ways. What matters: what the writer stores reads back as the same proposals, since a granted waiver writes
 * exactly these items waived; a missing file is absent; an empty list and every other file that is not whole proposals is unreadable,
 * never a throw, so a grant never waives an item it cannot name.
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
import type { WaiverProposalsProblem }                    from './@types/WaiverProposalsProblem.ts';
import { WaiverProposalsIngestion }                       from './WaiverProposalsIngestion.ts';
import { createWaiverProposalsWriter }                    from './WaiverProposalsWriter.ts';

let scratchDirectory: string | null = null;

let proposalsFilePath = '';

const reading = (): ReturnType<WaiverProposalsIngestion['read']> => new WaiverProposalsIngestion(proposalsFilePath).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('waiver-proposals-ingestion');
  proposalsFilePath = join(scratchDirectory, 'waiver-proposals.json');
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same proposals', () => {
  const proposals = [{ item: 'A2', reason: 'The export was retired' }, { item: 'A4', reason: '' }];

  createWaiverProposalsWriter(proposalsFilePath).write(proposals);

  expect(reading()).toEqual({ verdict: 'readable', proposals });
});

test.each<[string, string, Partial<WaiverProposalsProblem>]>([
  ['cut short', '{"version":1,"proposals":[{"item": "A2", "rea', { code: 'not-json' }],
  ['a bare list, with no version', '[{"item":"A2","reason":"The export was retired"}]', { code: 'not-a-json-object' }],
  ['no version', '{"proposals":[{"item":"A2","reason":"The export was retired"}]}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['another version', '{"version":2,"proposals":[{"item":"A2","reason":"The export was retired"}]}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['no proposals', '{"version":1}', { code: 'not-a-list-of-proposals', field: 'proposals' }],
  ['an empty list', '{"version":1,"proposals":[]}', { code: 'not-a-list-of-proposals', field: 'proposals' }],
  ['a proposal with no reason', '{"version":1,"proposals":[{"item":"A2"}]}', { code: 'proposal-without-text-item-and-reason', field: 'proposals[0]' }],
  [
    'a proposal whose item is no text',
    '{"version":1,"proposals":[{"item":"A2","reason":"x"},{"item":2,"reason":"x"}]}',
    { code: 'proposal-without-text-item-and-reason', field: 'proposals[1]' },
  ],
])('%s is unreadable, never a throw', (_case, storedText, problem) => {
  writeFileSync(proposalsFilePath, storedText);

  const proposalsReading = reading();

  expect(proposalsReading.verdict).toBe('unreadable');
  expect(proposalsReading.verdict === 'unreadable' ? proposalsReading.problem : null).toMatchObject(problem);
});
