/**
 * Forge's mapping of its presence into the contract's documents, on a board built in memory. What matters: each interrupted job is listed
 * with its contract cause and what it waits for, by the resume policy the passes follow, so Gaia shows the work that waits by cause: a
 * reboot, a network outage and a lease end wait for an instruction, a crashed agent with a restart left resumes by itself, a lost child
 * reads `child-lost`, and a job whose lost line waits is listed with the line's cause; a ticket an `interrupted:` hold keeps is listed; the
 * crash logs are listed newest last, the forge's own process named `hephaestus`, and the last start names the newest log after a crash;
 * Talos's lease standing reads as supervision, and the running Talos is named by its protocol version, code version and start number, none
 * without a live one; a heartbeat of another generation is no beat of this one; and a crash log keeps a board or
 * a log that could not be read as `null`, never as empty.
 */
import { describe, expect, test } from 'bun:test';

import type { TalosRecord }                from '../../lib/talos/TalosRecord.ts';
import type { InterruptionCause }          from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }                      from '../../lib/tracker-model/Board.ts';
import { INTERRUPTED_MERGE_HOLD }          from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { LIFECYCLE_LIMITS }                from '../../shared/constants/LifecycleLimits.ts';
import { boardFixture, ticketFixture }     from '../../testing/BoardFixtures.ts';
import type { CrashLogRecord }             from './@types/CrashLogRecord.ts';
import type { HeartbeatRecord }            from './@types/PresenceRecord.ts';
import type { StartClassificationVerdict } from './@types/StartClassification.ts';
import { CrashLog }                        from './CrashLog.ts';
import {
  PresenceDocumentAssembly,
  type ClassifiedPresenceRecord,
  type NumberedCrashLog,
  type PresenceDocumentInputs
} from './PresenceDocumentAssembly.ts';

const AT = '2026-11-19T02:15:00+01:00';

const VERIFIED_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, review: { name: 'Review' }
};

const SERVING_GENERATION = 5;

function classificationOf(overrides: Partial<StartClassificationVerdict> = {}): StartClassificationVerdict {
  return {
    kind:               'stopped-on-purpose',
    previousGeneration: 4,
    crashSuspected:     false,
    crashedComponent:   null,
    evidence:           {
      presence:               'read',
      previousEnding:         'stopped',
      previousBootIdentity:   'example-boot',
      currentBootIdentity:    'example-boot',
      newerBatonThanPresence: false,
      talos:                  'quit',
      lastHeartbeatAt:        null,
      bootStartedAt:          null,
    },
    ...overrides,
  };
}

function presenceOf(startClassification: StartClassificationVerdict = classificationOf()): ClassifiedPresenceRecord {
  return {
    presenceVersion: 2,
    generation:      SERVING_GENERATION,
    process:         { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
    codeVersion:     'example-code',
    startOrigin:     'successor',
    startedAt:       '2026-11-19T02:00:00.000+01:00',
    startClassification,
    abandonedPasses: { inARow: 2, last: { reason: 'tracker-lock-held', detail: 'tracker-lock-held', at: '2026-11-19T02:10:00.000+01:00' } },
    ending:          null,
  };
}

const HEARTBEAT: HeartbeatRecord = {
  heartbeatVersion: 1, generation: SERVING_GENERATION, sequence: 9, at: '2026-11-19T02:14:45.000+01:00'
};

function talosRecordOf(standing: TalosRecord['lease']['standing']): TalosRecord {
  return {
    formatVersion:   1,
    startNumber:     3,
    protocolVersion: 1,
    codeVersion:     'example-code',
    talos:           { processId: 5151, startStamp: '1700000100', bootIdentity: 'example-boot' },
    state:           'serving',
    endpoint:        null,
    quitReason:      null,
    lease:           { standing, lastRenewer: null },
  } as TalosRecord;
}

function crashLogRecordOf(overrides: Partial<CrashLogRecord> = {}): CrashLogRecord {
  return {
    crashLogVersion:   2,
    crashedGeneration: 2,
    component:         'hephaestus',
    suspected:         false,
    classification:    null,
    recordedAt:        '2026-11-18T23:00:00.000+01:00',
    recordedBy:        { generation: 2, startOrigin: null, crashPath: true },
    crashedProcess:    null,
    codeVersion:       'example-code',
    startedAt:         null,
    lastHeartbeat:     null,
    error:             CrashLog.errorOf('pass', new TypeError('example failure')),
    activeJobs:        [],
    talosChildren:     null,
    logTail:           ['first line', 'last line'],
    ...overrides,
  };
}

function boardWithTickets(tickets: readonly { id: string; hold?: string }[]): Board {
  return boardFixture({
    tickets:  tickets.map((ticket) => ticketFixture({ ...ticket, status: 'in-progress' })),
    pipeline: VERIFIED_PIPELINE,
  }).board;
}

function runningBuildOf(board: Board, ticketId: string): string {
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [ticketId], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.moveJob(job.id, 'running', AT);
  return job.id;
}

function interruptedBuildOf(board: Board, ticketId: string, cause: InterruptionCause): string {
  const jobId = runningBuildOf(board, ticketId);
  board.interruptJob(jobId, cause, AT);
  return jobId;
}

function inputsOf(board: Board, overrides: Partial<PresenceDocumentInputs> = {}): PresenceDocumentInputs {
  return {
    presence:        presenceOf(),
    heartbeat:       HEARTBEAT,
    liveTalosRecord: talosRecordOf('held'),
    board,
    limits:          LIFECYCLE_LIMITS,
    crashLogs:       [],
    ...overrides,
  };
}

describe('the interrupted work', () => {
  test('a reboot-interrupted job waits for an instruction, with no automatic restart counted', () => {
    const board = boardWithTickets([{ id: '001' }]);
    const jobId = interruptedBuildOf(board, '001', 'reboot');

    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork).toEqual([{
      jobId, kind: 'build', ticketIds: ['001'], cause: 'reboot', waitsFor: 'instruction', crashResumes: 0, automaticRestartsLeft: null,
    }]);
  });

  test('an agent that crashed again after one automatic restart resumes by itself, with one restart left', () => {
    const board = boardWithTickets([{ id: '001' }]);
    const jobId = interruptedBuildOf(board, '001', 'agent-crashed');
    board.moveJob(jobId, 'running', AT);
    board.interruptJob(jobId, 'agent-crashed', AT);

    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork).toEqual([{
      jobId, kind: 'build', ticketIds: ['001'], cause: 'agent-crashed', waitsFor: 'nothing', crashResumes: 1, automaticRestartsLeft: 1,
    }]);
  });

  test('a network-outage job and a lease-ended job are listed with their causes, each waiting for an instruction', () => {
    const board = boardWithTickets([{ id: '001' }, { id: '002' }]);
    interruptedBuildOf(board, '001', 'network-outage');
    interruptedBuildOf(board, '002', 'lease-ended');

    const listed = PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork;

    expect(listed.map(({ ticketIds, cause, waitsFor }) => [ticketIds, cause, waitsFor])).toEqual([
      [['001'], 'network-outage', 'instruction'],
      [['002'], 'lease-ended', 'instruction'],
    ]);
  });

  test('a lost child reads child-lost, the contract\'s name, and resumes by itself with both restarts left', () => {
    const board = boardWithTickets([{ id: '001' }]);
    interruptedBuildOf(board, '001', 'talos-lost');

    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork)
      .toMatchObject([{ cause: 'child-lost', waitsFor: 'nothing', automaticRestartsLeft: 2 }]);
  });

  test('a job whose gate line a start found lost waits for an instruction, listed with the line\'s cause, and leaves the list once resumed', () => {
    const board = boardWithTickets([{ id: '001' }]);
    const jobId = runningBuildOf(board, '001');
    board.recordLineLost(jobId, 'gate', 'forge-crashed', AT);

    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork)
      .toMatchObject([{
        jobId, cause: 'forge-crashed', waitsFor: 'instruction', automaticRestartsLeft: null
      }]);
    board.instructResume(jobId, AT);
    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board)).interruptedWork).toEqual([]);
  });

  test('a running job is not listed, and a ticket an interrupted: hold keeps is listed with its hold', () => {
    const board = boardWithTickets([{ id: '001' }, { id: '002', hold: INTERRUPTED_MERGE_HOLD }, { id: '003', hold: 'parked:example' }]);
    runningBuildOf(board, '001');

    const document = PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board));

    expect(document.interruptedWork).toEqual([]);
    expect(document.heldMerges).toEqual([{ ticketId: '002', hold: 'interrupted:merge' }]);
  });
});

describe('the start, the crash logs and the supervision', () => {
  test('the crash logs are listed newest last, and a start after a crash names the newest as its crash log', () => {
    const crashLogs: NumberedCrashLog[] = [
      { crashLogNumber: 1, record: crashLogRecordOf({ crashedGeneration: 2 }) },
      {
        crashLogNumber: 2,
        record:         crashLogRecordOf({
          crashedGeneration: 2, component: 'talos', suspected: true, recordedAt: '2026-11-19T01:00:00.000+01:00'
        })
      },
    ];
    const presence = presenceOf(classificationOf({ kind: 'crashed', crashedComponent: 'talos', previousGeneration: 2 }));

    const document = PresenceDocumentAssembly.presenceDocumentOf(inputsOf(boardWithTickets([]), { presence, crashLogs }));

    expect(document.crashLogs).toEqual([
      {
        number: 1, generation: 2, component: 'hephaestus', recordedAt: '2026-11-18T23:00:00.000+01:00', suspected: false
      },
      {
        number: 2, generation: 2, component: 'talos', recordedAt: '2026-11-19T01:00:00.000+01:00', suspected: true
      },
    ]);
    expect(document.lastStart).toEqual({
      kind: 'crashed', previousGeneration: 2, crashSuspected: false, crashLogNumber: 2
    });
  });

  test('a start after a stop on purpose names no crash log, though older logs are listed', () => {
    const crashLogs: NumberedCrashLog[] = [{ crashLogNumber: 1, record: crashLogRecordOf() }];

    const document = PresenceDocumentAssembly.presenceDocumentOf(inputsOf(boardWithTickets([]), { crashLogs }));

    expect(document.lastStart).toEqual({
      kind: 'stopped-on-purpose', previousGeneration: 4, crashSuspected: false, crashLogNumber: null
    });
    expect(document.crashLogs.map((crashLog) => crashLog.number)).toEqual([1]);
  });

  test('a Talos record whose lease ended reads stopped; held reads supervising, a gap checking-after-a-gap, no live Talos no-talos', () => {
    const supervisionWith = (liveTalosRecord: TalosRecord | null): string => PresenceDocumentAssembly
      .presenceDocumentOf(inputsOf(boardWithTickets([]), { liveTalosRecord })).supervision;

    expect(supervisionWith(talosRecordOf('ended'))).toBe('stopped');
    expect(supervisionWith(talosRecordOf('held'))).toBe('supervising');
    expect(supervisionWith(talosRecordOf('waiting-after-gap'))).toBe('checking-after-a-gap');
    expect(supervisionWith(talosRecordOf('unheld'))).toBe('not-yet-renewed');
    expect(supervisionWith(null)).toBe('no-talos');
  });

  test('names the running Talos by its protocol version, the code version it started from and its start number; none without one', () => {
    const talosWith = (liveTalosRecord: TalosRecord | null): unknown => PresenceDocumentAssembly
      .presenceDocumentOf(inputsOf(boardWithTickets([]), { liveTalosRecord })).talos;

    expect(talosWith(talosRecordOf('held'))).toEqual({ protocolVersion: 1, codeVersion: 'example-code', startNumber: 3 });
    expect(talosWith(null)).toBeNull();
  });

  test('names the serving generation\'s process, start, beat and abandoned passes, and passes over a beat of another generation', () => {
    const board = boardWithTickets([]);

    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board))).toMatchObject({
      generation:      SERVING_GENERATION,
      processId:       4242,
      codeVersion:     'example-code',
      startedAt:       '2026-11-19T02:00:00.000+01:00',
      startOrigin:     'successor',
      heartbeat:       { sequence: 9, at: '2026-11-19T02:14:45.000+01:00' },
      abandonedPasses: { inARow: 2, lastReason: 'tracker-lock-held', lastAt: '2026-11-19T02:10:00.000+01:00' },
    });
    const olderBeat = { ...HEARTBEAT, generation: SERVING_GENERATION - 1 };
    expect(PresenceDocumentAssembly.presenceDocumentOf(inputsOf(board, { heartbeat: olderBeat })).heartbeat).toBeNull();
  });
});

describe('a crash log document', () => {
  test('carries the log\'s own number, the crashed generation, the start kind and the jobs as the crash found them', () => {
    const record = crashLogRecordOf({
      crashedGeneration: 1,
      classification:    classificationOf({ kind: 'machine-went-down', crashSuspected: true }),
      suspected:         true,
      activeJobs:        [{
        jobId: 'J7', kind: 'build', role: 'builder', ticketIds: ['004'], state: 'running', interruption: null, instance: 2, airlockPhase: 'gating', eventSequence: 31,
      }],
    });

    expect(PresenceDocumentAssembly.crashLogDocumentOf(6, record)).toEqual({
      number:     6,
      generation: 1,
      component:  'hephaestus',
      suspected:  true,
      recordedAt: '2026-11-18T23:00:00.000+01:00',
      startKind:  'machine-went-down',
      error:      {
        origin: 'pass', name: 'TypeError', message: 'example failure', stack: expect.any(String) as unknown as string
      },
      activeJobs: [{
        jobId: 'J7', kind: 'build', ticketIds: ['004'], state: 'running', interruption: null, airlockPhase: 'gating'
      }],
      logTail: ['first line', 'last line'],
    });
  });

  test('keeps a board and a log that could not be read as null, and the crash path\'s log has no start kind', () => {
    const document = PresenceDocumentAssembly.crashLogDocumentOf(1, crashLogRecordOf({ activeJobs: null, logTail: null, error: null }));

    expect(document).toMatchObject({
      startKind: null, error: null, activeJobs: null, logTail: null
    });
  });
});
