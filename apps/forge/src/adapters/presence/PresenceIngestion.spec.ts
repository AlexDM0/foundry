/**
 * `presence.json` both ways. What matters: the writer's file reads back as the same record; a missing file is absent, never unreadable, since a
 * first start finds none; not JSON, another or no `presenceVersion`, and each wrong field are unreadable with a reason; nothing throws.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { PresenceRecord }                            from './@types/PresenceRecord.ts';
import { PresenceIngestion }                              from './PresenceIngestion.ts';
import { PresenceProblemWording }                         from './PresenceProblemWording.ts';
import { createPresenceWriter }                           from './PresenceWriter.ts';

const RECORD: PresenceRecord = {
  presenceVersion:     2,
  generation:          4,
  process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
  codeVersion:         'example-code',
  startOrigin:         'user',
  startedAt:           '2026-11-19T09:00:00.000+01:00',
  startClassification: {
    kind:               'crashed',
    previousGeneration: 3,
    crashSuspected:     false,
    crashedComponent:   'talos',
    evidence:           {
      presence:                        'read',
      previousEnding:                  null,
      previousBootIdentity:            'example-boot',
      currentBootIdentity:             'example-boot',
      newerHephaestusLockThanPresence: false,
      talos:                           'lost-this-boot',
      lastHeartbeatAt:                 null,
      bootStartedAt:                   null,
    },
  },
  abandonedPasses: { inARow: 2, last: { reason: 'tracker-lock-held', detail: 'example detail', at: '2026-11-19T09:10:00.000+01:00' } },
  ending:          {
    kind: 'crashed', component: 'hephaestus', crashLogNumber: 7, at: '2026-11-19T10:00:00.000+01:00'
  },
};

let scratchDirectory = '';

const presenceFilePath = (): string => join(scratchDirectory, 'presence.json');

const reading = (): ReturnType<PresenceIngestion['read']> => new PresenceIngestion(presenceFilePath()).read();

/** The reading with its problem worded, as User reads it. */
function wordedReadingOf(read: ReturnType<PresenceIngestion['read']>): object {
  return read.verdict === 'unreadable' ? { verdict: read.verdict, reason: PresenceProblemWording.sentenceOf(read.problem) } : read;
}

function storeWith(changes: Record<string, unknown>): void {
  writeFileSync(presenceFilePath(), JSON.stringify({ ...RECORD, ...changes }));
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('presence-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('what the writer stores reads back as the same record, under its presenceVersion', () => {
  createPresenceWriter(presenceFilePath()).write(RECORD);

  expect(reading()).toEqual({ verdict: 'readable', record: RECORD });
  expect(JSON.parse(readFileSync(presenceFilePath(), 'utf8'))).toMatchObject({ presenceVersion: 2 });
});

test('a missing file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(presenceFilePath(), '{ "presenceVersion": 2, ');

  expect(reading()).toMatchObject({ verdict: 'unreadable', problem: { code: 'not-json' } });
});

test.each([
  ['another version', { presenceVersion: 1 }, 'its presenceVersion is not 2'],
  ['no version', { presenceVersion: undefined }, 'its presenceVersion is not 2'],
  ['a generation below 1', { generation: 0 }, 'generation is not a whole number from 1'],
  ['a process with no start stamp', { process: { processId: 4242, startEpochSeconds: 1_700_000_000, bootIdentity: 'example-boot' } }, 'process is not a process identity'],
  ['no code version', { codeVersion: undefined }, 'codeVersion is not a string'],
  ['an unknown start origin', { startOrigin: 'example-origin' }, 'startOrigin is not a start origin'],
  ['no start time', { startedAt: 7 }, 'startedAt is not a string'],
  ['a classification of an unknown kind', { startClassification: { kind: 'example-kind' } }, 'startClassification is neither null nor a start classification'],
  ['abandoned passes with no count', { abandonedPasses: { last: null } }, 'abandonedPasses is not a count with its last abandoned pass'],
  ['an ending of an unknown kind', { ending: { kind: 'example-ending', at: '2026-11-19T10:00:00.000+01:00' } }, 'ending is neither null nor an ending'],
])('%s is unreadable', (_case, changes, reason) => {
  storeWith(changes);

  expect(wordedReadingOf(reading())).toEqual({ verdict: 'unreadable', reason });
});

test('a list where the record belongs is unreadable', () => {
  writeFileSync(presenceFilePath(), '[]');

  expect(wordedReadingOf(reading())).toEqual({ verdict: 'unreadable', reason: 'it is not a JSON object' });
});
