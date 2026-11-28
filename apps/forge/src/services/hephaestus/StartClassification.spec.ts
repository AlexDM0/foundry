/**
 * The start classification over plain evidence: each rule decides in its order, so a recorded ending outranks the boot and a foreign
 * Hephaestus lock outranks the record; and the design's known misreadings stay written as claims, so a change to them is a decision and
 * not an accident.
 */
import { describe, expect, test } from 'bun:test';

import type { HeartbeatRecord }                             from '../../adapters/heartbeat/@types/HeartbeatRecord.ts';
import type { PresenceProblem }                             from '../../adapters/presence/@types/PresenceProblem.ts';
import type { PresenceEnding, PresenceRecord }              from '../../adapters/presence/@types/PresenceRecord.ts';
import { LocalTimeUtil }                                    from '../../lib/local-time/LocalTimeUtil.ts';
import { UNREADABLE_BOOT_IDENTITY }                         from '../../lib/process-identity/ProcessIdentity.ts';
import type { PresenceFileReading }                         from './@types/PresenceRecord.ts';
import type { HephaestusLockReading, HephaestusLockRecord } from './HephaestusLock.ts';
import { StartClassification, type StartEvidence }          from './StartClassification.ts';
import { HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS }         from './constants/PresenceLimits.ts';

const CURRENT_BOOT = 'example-boot-today';
const EARLIER_BOOT = 'example-boot-yesterday';
const PREVIOUS_GENERATION = 7;
const BOOT_STARTED_AT_EPOCH_SECONDS = 1_800_000_000;
const MILLISECONDS_PER_SECOND = 1_000;
const BOOT_STARTED_AT_MILLISECONDS = BOOT_STARTED_AT_EPOCH_SECONDS * MILLISECONDS_PER_SECOND;
const RECORDED_PROCESS = { processId: 4242, startStamp: '1700000000' } as const;
const ANOTHER_STARTS_PROCESS = { processId: 4343, startStamp: '1700000100' } as const;

type HephaestusLockHolder = typeof RECORDED_PROCESS | typeof ANOTHER_STARTS_PROCESS;

function presenceRecordOf(ending: PresenceEnding | null, bootIdentity = CURRENT_BOOT, generation = PREVIOUS_GENERATION): PresenceRecord {
  return {
    presenceVersion:     2,
    generation,
    process:             { ...RECORDED_PROCESS, bootIdentity },
    codeVersion:         'example-code',
    startOrigin:         'user',
    startedAt:           '2026-11-19T09:00:00+01:00',
    startClassification: null,
    abandonedPasses:     { inARow: 0, last: null },
    ending,
  };
}

function presenceReadOf(ending: PresenceEnding | null, bootIdentity = CURRENT_BOOT): PresenceFileReading<PresenceRecord, PresenceProblem> {
  return { verdict: 'read', record: presenceRecordOf(ending, bootIdentity) };
}

function hephaestusLockRecordOf(holder: HephaestusLockHolder, bootIdentity: string): HephaestusLockRecord {
  return {
    processId:            holder.processId,
    processStartStamp:    holder.startStamp,
    bootIdentity,
    port:                 4100,
    url:                  'http://127.0.0.1:4100',
    tokenFile:            '/example/token',
    codeVersion:          'example-code',
    installVersion:       1,
    talosProtocolVersion: 1,
  };
}

/** The Hephaestus lock the recorded process left behind. */
function recordedProcessesDeadLockOf(bootIdentity = CURRENT_BOOT): HephaestusLockReading {
  return { verdict: 'dead', generation: PREVIOUS_GENERATION, record: hephaestusLockRecordOf(RECORDED_PROCESS, bootIdentity) };
}

/** The Hephaestus lock of a later start that died before it wrote presence; `null` for one whose record cannot be read. */
function anotherStartsDeadLockOf(generation: number, bootIdentity: string | null = CURRENT_BOOT): HephaestusLockReading {
  return { verdict: 'dead', generation, record: bootIdentity === null ? null : hephaestusLockRecordOf(ANOTHER_STARTS_PROCESS, bootIdentity) };
}

function heartbeatBefore(millisecondsBeforeBoot: number, generation = PREVIOUS_GENERATION): HeartbeatRecord {
  return {
    heartbeatVersion: 1,
    generation,
    sequence:         12,
    at:               LocalTimeUtil.formatLocalIso(new Date(BOOT_STARTED_AT_MILLISECONDS - millisecondsBeforeBoot)),
  };
}

/** A start by the user after a generation that crashed unrecorded in this boot, its Hephaestus lock left behind; each case changes what it is about. */
function evidenceWith(changes: Partial<StartEvidence>): StartEvidence {
  return {
    presence:                  presenceReadOf(null),
    heartbeat:                 { verdict: 'absent' },
    newestLock:                recordedProcessesDeadLockOf(),
    talos:                     { verdict: 'none' },
    currentBootIdentity:       CURRENT_BOOT,
    bootStartedAtEpochSeconds: BOOT_STARTED_AT_EPOCH_SECONDS,
    origin:                    { startOrigin: 'user' },
    ...changes,
  };
}

const STOPPED: PresenceEnding = { kind: 'stopped', at: '2026-11-19T10:00:00+01:00' };
const HANDED_OVER: PresenceEnding = { kind: 'handed-over', at: '2026-11-19T10:00:00+01:00' };

describe('StartClassification.classify', () => {
  test('a first start with no record and no Hephaestus lock is a first start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestLock: { verdict: 'none' } }));
    expect(verdict.kind).toBe('first-start');
    expect(verdict.previousGeneration).toBeNull();
    expect(verdict.evidence.presence).toBe('absent');
  });

  test('a completed stop on record reads as stopped on purpose', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: { verdict: 'none' } }));
    expect(verdict.kind).toBe('stopped-on-purpose');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION);
    expect(verdict.evidence.previousEnding).toBe('stopped');
    expect(verdict.crashedComponent).toBeNull();
  });

  test('a crash the forge recorded itself reads as a crash of the component it names', () => {
    const recordedHephaestusCrash = StartClassification.classify(evidenceWith({
      presence: {
        verdict: 'read',
        record:  presenceRecordOf({
          kind: 'crashed', component: 'hephaestus', crashLogNumber: 2, at: '2026-11-19T10:00:00+01:00'
        }, EARLIER_BOOT)
      }
    }));
    expect(recordedHephaestusCrash.kind).toBe('crashed');
    expect(recordedHephaestusCrash.crashedComponent).toBe('hephaestus');
    const recordedTalosCrash = StartClassification.classify(evidenceWith({
      presence: {
        verdict: 'read',
        record:  presenceRecordOf({
          kind: 'crashed', component: 'talos', crashLogNumber: 2, at: '2026-11-19T10:00:00+01:00'
        })
      }
    }));
    expect(recordedTalosCrash.crashedComponent).toBe('talos');
  });

  test('a successor taking over the generation that handed over reads as a handover', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence: presenceReadOf(HANDED_OVER),
      origin:   { startOrigin: 'successor', predecessorGeneration: PREVIOUS_GENERATION },
      talos:    { verdict: 'gone', bootIdentity: CURRENT_BOOT },
    }));
    expect(verdict.kind).toBe('handover');
    expect(verdict.crashedComponent).toBeNull();
  });

  test('a handover no successor took over reads as stopped on purpose', () => {
    const userStart = StartClassification.classify(evidenceWith({ presence: presenceReadOf(HANDED_OVER) }));
    expect(userStart.kind).toBe('stopped-on-purpose');
    const successorOfAnotherGeneration = StartClassification.classify(evidenceWith({
      presence: presenceReadOf(HANDED_OVER),
      origin:   { startOrigin: 'successor', predecessorGeneration: PREVIOUS_GENERATION - 1 },
    }));
    expect(successorOfAnotherGeneration.kind).toBe('stopped-on-purpose');
  });

  test('a successor whose predecessor died during the restart reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({ origin: { startOrigin: 'successor', predecessorGeneration: PREVIOUS_GENERATION } }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('hephaestus');
  });

  test('a record of another boot with no ending reads as the machine going down', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(null, EARLIER_BOOT), newestLock: recordedProcessesDeadLockOf(EARLIER_BOOT) }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
    expect(verdict.crashedComponent).toBeNull();
    expect(verdict.evidence.previousBootIdentity).toBe(EARLIER_BOOT);
  });

  test('the same boot with no ending reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({}));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('hephaestus');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION);
  });

  test('a start that failed after its presence write and let go of its Hephaestus lock reads as stopped on purpose, not as a crash', () => {
    const noHephaestusLockLeft = StartClassification.classify(evidenceWith({ newestLock: { verdict: 'none' } }));
    expect(noHephaestusLockLeft.kind).toBe('stopped-on-purpose');
    expect(noHephaestusLockLeft.previousGeneration).toBe(PREVIOUS_GENERATION);
  });

  test('a stop on record followed by a start that took Hephaestus lock 1 again and died before its presence write reads as a crash, not as a stop', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: anotherStartsDeadLockOf(1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('hephaestus');
    expect(verdict.previousGeneration).toBe(1);
    expect(verdict.evidence.newerHephaestusLockThanPresence).toBe(true);
  });

  test('a start that took Hephaestus lock 1 again and died before its presence write, before a reboot, reads as the machine going down, judged by no earlier run\'s beat', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(STOPPED, EARLIER_BOOT),
      newestLock: anotherStartsDeadLockOf(1, EARLIER_BOOT),
      heartbeat:  { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100, 1) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
  });

  test('a newer Hephaestus lock than the record, in the same boot, reads as a crash during start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: anotherStartsDeadLockOf(PREVIOUS_GENERATION + 1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('hephaestus');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION + 1);
    expect(verdict.evidence.newerHephaestusLockThanPresence).toBe(true);
  });

  test('a newer Hephaestus lock than the record, of another boot, reads as the machine going down; an unreadable one as a crash', () => {
    const otherBootsHephaestusLock = anotherStartsDeadLockOf(PREVIOUS_GENERATION + 1, EARLIER_BOOT);
    const otherBoot = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: otherBootsHephaestusLock }));
    expect(otherBoot.kind).toBe('machine-went-down');
    const unreadableLock = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: anotherStartsDeadLockOf(PREVIOUS_GENERATION + 1, null) }));
    expect(unreadableLock.kind).toBe('crashed');
  });

  test('a Hephaestus lock with no presence record at all, in the same boot, reads as a crash during start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestLock: anotherStartsDeadLockOf(1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.previousGeneration).toBe(1);
    expect(verdict.evidence.newerHephaestusLockThanPresence).toBe(true);
  });

  test('an unreadable presence record reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'unreadable', problem: { code: 'not-a-json-object' } }, newestLock: { verdict: 'none' } }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('hephaestus');
    expect(verdict.evidence.presence).toBe('unreadable');
  });

  test('a Talos lost in this boot after a stop on record reads as a crash of Talos', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(STOPPED),
      newestLock: { verdict: 'none' },
      talos:      { verdict: 'gone', bootIdentity: CURRENT_BOOT },
    }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('talos');
    expect(verdict.evidence.talos).toBe('lost-this-boot');
  });

  test('a Talos lost in this boot never spoils a first start', () => {
    const talosLostThisBoot = { verdict: 'gone', bootIdentity: CURRENT_BOOT } as const;
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestLock: { verdict: 'none' }, talos: talosLostThisBoot }));
    expect(verdict.kind).toBe('first-start');
  });

  test('a Talos lost in another boot reads as the machine going down, with no crash suspected after a stop on record', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(STOPPED, EARLIER_BOOT),
      newestLock: { verdict: 'none' },
      heartbeat:  { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100) },
      talos:      { verdict: 'gone', bootIdentity: EARLIER_BOOT },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
    expect(verdict.evidence.talos).toBe('lost-other-boot');
  });

  test('a live or quit Talos changes no kind', () => {
    expect(StartClassification.classify(evidenceWith({ talos: { verdict: 'live' } })).kind).toBe('crashed');
    const afterAStopWithTalosQuit = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestLock: { verdict: 'none' }, talos: { verdict: 'quit' } }));
    expect(afterAStopWithTalosQuit.kind).toBe('stopped-on-purpose');
  });

  test('a crash followed by a reboot reads as the machine going down, with the crash suspected when the heartbeat stopped well before the boot', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(null, EARLIER_BOOT),
      newestLock: recordedProcessesDeadLockOf(EARLIER_BOOT),
      heartbeat:  { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS + MILLISECONDS_PER_SECOND) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(true);
    expect(verdict.evidence.lastHeartbeatAt).not.toBeNull();
    expect(LocalTimeUtil.parseIso(verdict.evidence.bootStartedAt ?? '')?.getTime()).toBe(BOOT_STARTED_AT_MILLISECONDS);
  });

  test('a heartbeat that stopped less than the bound before the boot is no suspected crash', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(null, EARLIER_BOOT),
      newestLock: recordedProcessesDeadLockOf(EARLIER_BOOT),
      heartbeat:  { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS - MILLISECONDS_PER_SECOND) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
  });

  test('a stale heartbeat of another generation, or with no boot start time, is no suspected crash', () => {
    const staleBeat = HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100;
    const ofAnotherGeneration = StartClassification.classify(evidenceWith({
      presence:   presenceReadOf(null, EARLIER_BOOT),
      newestLock: recordedProcessesDeadLockOf(EARLIER_BOOT),
      heartbeat:  { verdict: 'read', record: heartbeatBefore(staleBeat, PREVIOUS_GENERATION - 1) },
    }));
    expect(ofAnotherGeneration.crashSuspected).toBe(false);
    expect(ofAnotherGeneration.evidence.lastHeartbeatAt).toBeNull();
    const withNoBootStart = StartClassification.classify(evidenceWith({
      presence:                  presenceReadOf(null, EARLIER_BOOT),
      newestLock:                recordedProcessesDeadLockOf(EARLIER_BOOT),
      heartbeat:                 { verdict: 'read', record: heartbeatBefore(staleBeat) },
      bootStartedAtEpochSeconds: null,
    }));
    expect(withNoBootStart.crashSuspected).toBe(false);
    expect(withNoBootStart.evidence.bootStartedAt).toBeNull();
  });

  test('a stop on record followed by a killed, wedged process reads as stopped on purpose (misreading two, kept)', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:  presenceReadOf(STOPPED),
      heartbeat: { verdict: 'read', record: heartbeatBefore(MILLISECONDS_PER_SECOND) },
    }));
    expect(verdict.kind).toBe('stopped-on-purpose');
  });

  test('an unreadable boot identity reads as the same boot, so a reboot on such a machine reads as a crash (sameBoot\'s rule, kept)', () => {
    const unreadableNow = StartClassification.classify(evidenceWith({
      presence:            presenceReadOf(null, EARLIER_BOOT),
      newestLock:          recordedProcessesDeadLockOf(EARLIER_BOOT),
      currentBootIdentity: UNREADABLE_BOOT_IDENTITY,
    }));
    expect(unreadableNow.kind).toBe('crashed');
    const unreadableBefore = StartClassification.classify(evidenceWith({ presence: presenceReadOf(null, UNREADABLE_BOOT_IDENTITY) }));
    expect(unreadableBefore.kind).toBe('crashed');
  });
});
