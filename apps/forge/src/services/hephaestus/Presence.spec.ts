/**
 * The presence record and the heartbeat in a scratch board folder: a read is a verdict, never a throw; each ending or pass changes only its
 * own generation's record, so a predecessor's late write never touches its successor's; and an older generation's beat never replaces a
 * newer one, as during a restart when both processes beat.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PresenceRecord }                            from '../../adapters/presence/@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                from '../../adapters/presence/@types/StartClassificationVerdict.ts';
import { detailsLoggerOf }                                from '../../testing/LoggedDetails.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { PresenceStart }                             from './@types/PresenceRecord.ts';
import { hephaestusFilesIn, type HephaestusFiles }        from './HephaestusFiles.ts';
import { Presence }                                       from './Presence.ts';
import { createUnreadableBoardFiles }                     from './UnreadableBoardFiles.ts';

const STARTED_AT = '2026-11-19T09:00:00.000+01:00';
const ENDED_AT = '2026-11-19T10:00:00.000+01:00';

const CLASSIFICATION: StartClassificationVerdict = {
  kind:               'stopped-on-purpose',
  previousGeneration: 3,
  crashSuspected:     false,
  crashedComponent:   null,
  evidence:           {
    presence:                        'read',
    previousEnding:                  'stopped',
    previousBootIdentity:            'example-boot',
    currentBootIdentity:             'example-boot',
    newerHephaestusLockThanPresence: false,
    talos:                           'quit',
    lastHeartbeatAt:                 '2026-11-19T08:59:45.000+01:00',
    bootStartedAt:                   null,
  },
};

function startOf(generation: number, startClassification: StartClassificationVerdict | null = null): PresenceStart {
  return {
    generation,
    process:     { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
    codeVersion: 'example-code',
    startOrigin: 'user',
    startedAt:   STARTED_AT,
    startClassification,
  };
}

let boardFolder = '';
let files: HephaestusFiles = hephaestusFilesIn('');

beforeEach(() => {
  boardFolder = createScratchDirectory('presence');
  files = hephaestusFilesIn(boardFolder);
  mkdirSync(files.hephaestusDirectory);
});

afterEach(() => {
  removeScratchDirectory(boardFolder);
});

function storedPresence(): PresenceRecord {
  const reading = Presence.readPresence(files);
  if (reading.verdict !== 'read') throw new Error(`presence.json reads ${reading.verdict}`);
  return reading.record;
}

describe('the presence record', () => {
  test('a started record round-trips with no abandoned pass and no ending', () => {
    const written = Presence.writeStartedPresence(files, startOf(4, CLASSIFICATION));

    expect(Presence.readPresence(files)).toEqual({ verdict: 'read', record: written });
    expect(written).toMatchObject({ presenceVersion: 2, abandonedPasses: { inARow: 0, last: null }, ending: null });
  });

  test('a record whose classification is still to come reads with a null classification', () => {
    Presence.writeStartedPresence(files, startOf(1));

    expect(storedPresence().startClassification).toBeNull();
  });

  test('a missing file reads as absent', () => {
    expect(Presence.readPresence(files)).toEqual({ verdict: 'absent' });
  });

  test('an unreadable record reads as unreadable, and an ending finds no record to end', () => {
    writeFileSync(files.presenceFilePath, '{ "presenceVersion": 2, ');

    expect(Presence.readPresence(files).verdict).toBe('unreadable');
    expect(Presence.writeEnding(files, 1, { kind: 'stopped' }, ENDED_AT)).toMatchObject({ verdict: 'no-record', reading: { verdict: 'unreadable' } });
  });

  test('an unreadable record is reported to the board header, a readable or absent one is not', () => {
    const unreadableBoardFiles = createUnreadableBoardFiles(() => undefined);
    Presence.reportUnreadablePresence(Presence.readPresence(files), unreadableBoardFiles);
    Presence.writeStartedPresence(files, startOf(1));
    Presence.reportUnreadablePresence(Presence.readPresence(files), unreadableBoardFiles);
    writeFileSync(files.presenceFilePath, '[]');
    Presence.reportUnreadablePresence(Presence.readPresence(files), unreadableBoardFiles);

    expect(unreadableBoardFiles.files()).toEqual([{ file: 'hephaestus/presence.json', problem: { code: 'not-a-json-object' } }]);
  });

  test('a stop writes its ending on its own generation\'s record', () => {
    Presence.writeStartedPresence(files, startOf(2));

    expect(Presence.writeEnding(files, 2, { kind: 'stopped' }, ENDED_AT).verdict).toBe('written');
    expect(storedPresence().ending).toEqual({ kind: 'stopped', at: ENDED_AT });
  });

  test('an ending for an older generation leaves the newer record untouched', () => {
    Presence.writeStartedPresence(files, startOf(5));
    const before = readFileSync(files.presenceFilePath, 'utf8');

    expect(Presence.writeEnding(files, 4, { kind: 'handed-over' }, ENDED_AT)).toEqual({ verdict: 'not-this-generation', storedGeneration: 5 });
    expect(readFileSync(files.presenceFilePath, 'utf8')).toBe(before);
  });

  test('an ending with no record to end writes nothing', () => {
    expect(Presence.writeEnding(files, 1, { kind: 'stopped' }, ENDED_AT)).toEqual({ verdict: 'no-record', reading: { verdict: 'absent' } });
    expect(Presence.readPresence(files)).toEqual({ verdict: 'absent' });
  });

  test('a crashed ending keeps its component and its crash log\'s number, which is not the generation', () => {
    Presence.writeStartedPresence(files, startOf(3));
    Presence.writeEnding(files, 3, { kind: 'crashed', component: 'talos', crashLogNumber: 7 }, ENDED_AT);

    expect(storedPresence().ending).toEqual({
      kind: 'crashed', component: 'talos', crashLogNumber: 7, at: ENDED_AT
    });
  });

  test('a crashed ending whose crash log could not be written names no log', () => {
    Presence.writeStartedPresence(files, startOf(3));
    Presence.writeEnding(files, 3, { kind: 'crashed', component: 'hephaestus', crashLogNumber: null }, ENDED_AT);

    expect(storedPresence().ending).toEqual({
      kind: 'crashed', component: 'hephaestus', crashLogNumber: null, at: ENDED_AT
    });
  });

  test('an abandoned pass count rises, and a completed pass sets it to 0 and keeps the last one shown', () => {
    Presence.writeStartedPresence(files, startOf(1));
    Presence.recordAbandonedPass(files, 1, 'tracker-lock-held', 'the tracker lock is held by process 4343', STARTED_AT);
    Presence.recordAbandonedPass(files, 1, 'lock-taken-over', 'the tracker lock was taken over', ENDED_AT);
    const last = { reason: 'lock-taken-over' as const, detail: 'the tracker lock was taken over', at: ENDED_AT };
    expect(storedPresence().abandonedPasses).toEqual({ inARow: 2, last });

    expect(Presence.recordCompletedPass(files, 1).verdict).toBe('written');
    expect(storedPresence().abandonedPasses).toEqual({ inARow: 0, last });
  });

  test('a completed pass after a completed pass rewrites nothing', () => {
    Presence.writeStartedPresence(files, startOf(1));

    expect(Presence.recordCompletedPass(files, 1)).toEqual({ verdict: 'unchanged' });
  });

  test('an abandoned pass of an older generation leaves the newer record untouched', () => {
    Presence.writeStartedPresence(files, startOf(2));

    expect(Presence.recordAbandonedPass(files, 1, 'tracker-lock-held', 'held', ENDED_AT).verdict).toBe('not-this-generation');
    expect(storedPresence().abandonedPasses.inARow).toBe(0);
  });
});

describe('the heartbeat', () => {
  test('a missing file reads as absent', () => {
    expect(Presence.readHeartbeat(files)).toEqual({ verdict: 'absent' });
  });

  test('the sequence starts at 1 and rises by one at each beat of a generation', () => {
    expect(Presence.writeHeartbeat(files, 1, STARTED_AT, () => undefined)).toEqual({
      verdict: 'written',
      record:  {
        heartbeatVersion: 1, generation: 1, sequence: 1, at: STARTED_AT
      },
    });
    Presence.writeHeartbeat(files, 1, ENDED_AT, () => undefined);

    expect(Presence.readHeartbeat(files)).toEqual({
      verdict: 'read',
      record:  {
        heartbeatVersion: 1, generation: 1, sequence: 2, at: ENDED_AT
      },
    });
  });

  test('a newer generation\'s first beat starts its own sequence at 1', () => {
    Presence.writeHeartbeat(files, 1, STARTED_AT, () => undefined);
    Presence.writeHeartbeat(files, 1, STARTED_AT, () => undefined);

    const written = Presence.writeHeartbeat(files, 2, ENDED_AT, () => undefined);
    expect(written.verdict === 'written' && written.record.sequence).toBe(1);
  });

  test('a beat of an older generation never replaces a newer one whose record is current', () => {
    Presence.writeStartedPresence(files, startOf(3));
    Presence.writeHeartbeat(files, 3, STARTED_AT, () => undefined);
    const before = readFileSync(files.heartbeatFilePath, 'utf8');

    expect(Presence.writeHeartbeat(files, 2, ENDED_AT, () => undefined)).toEqual({ verdict: 'newer-generation-beats', storedGeneration: 3 });
    expect(readFileSync(files.heartbeatFilePath, 'utf8')).toBe(before);
  });

  test('a run whose generations started again at 1 beats over the last beat of an ended run of a higher generation', () => {
    Presence.writeStartedPresence(files, startOf(5));
    Presence.writeHeartbeat(files, 5, STARTED_AT, () => undefined);
    Presence.writeEnding(files, 5, { kind: 'stopped' }, STARTED_AT);
    Presence.writeStartedPresence(files, startOf(1));

    const written = Presence.writeHeartbeat(files, 1, ENDED_AT, () => undefined);
    expect(written.verdict === 'written' && written.record).toEqual({
      heartbeatVersion: 1, generation: 1, sequence: 1, at: ENDED_AT
    });
  });

  test('an unreadable beat is logged, and the next beat rewrites it starting again at 1', () => {
    writeFileSync(files.heartbeatFilePath, JSON.stringify({
      heartbeatVersion: 2, generation: 1, sequence: 7, at: STARTED_AT
    }));
    const loggedLines: string[] = [];

    const written = Presence.writeHeartbeat(files, 1, ENDED_AT, detailsLoggerOf(loggedLines));

    expect(written.verdict === 'written' && written.record.sequence).toBe(1);
    expect(loggedLines).toEqual(['heartbeat.json could not be read (its heartbeatVersion is not 1); this beat rewrites it.']);
    expect(Presence.readHeartbeat(files).verdict).toBe('read');
  });
});
