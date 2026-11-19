/**
 * The start classification over plain evidence. What matters: each rule decides in its order, so a recorded ending outranks the boot and a
 * Baton of another start than the record's, whatever its generation, outranks the record; a Talos lost in this boot is a crash of Talos
 * whatever the record says, but never spoils a handover or a first start; a crash is suspected only after a reboot with a stale beat of the
 * generation that died unrecorded; and the design's known misreadings stay as they are, written as claims, so a change to them is a decision
 * and not an accident.
 */
import { describe, expect, test } from 'bun:test';

import { LocalTimeUtil }            from '../../lib/local-time/LocalTimeUtil.ts';
import { UNREADABLE_BOOT_IDENTITY } from '../../lib/process-identity/ProcessIdentity.ts';
import type {
  HeartbeatRecord,
  PresenceEnding,
  PresenceFileReading,
  PresenceRecord
} from './@types/PresenceRecord.ts';
import type { BatonReading, BatonRecord }           from './Baton.ts';
import { StartClassification, type StartEvidence }  from './StartClassification.ts';
import { HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS } from './constants/PresenceLimits.ts';

const CURRENT_BOOT = 'example-boot-today';
const EARLIER_BOOT = 'example-boot-yesterday';
const PREVIOUS_GENERATION = 7;
const BOOT_STARTED_AT_EPOCH_SECONDS = 1_800_000_000;
const MILLISECONDS_PER_SECOND = 1_000;
const BOOT_STARTED_AT_MILLISECONDS = BOOT_STARTED_AT_EPOCH_SECONDS * MILLISECONDS_PER_SECOND;
const RECORDED_PROCESS = { processId: 4242, startStamp: '1700000000' } as const;
const ANOTHER_STARTS_PROCESS = { processId: 4343, startStamp: '1700000100' } as const;

type BatonHolder = typeof RECORDED_PROCESS | typeof ANOTHER_STARTS_PROCESS;

function presenceRecordOf(ending: PresenceEnding | null, bootIdentity = CURRENT_BOOT, generation = PREVIOUS_GENERATION): PresenceRecord {
  return {
    presenceVersion:     1,
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

function presenceReadOf(ending: PresenceEnding | null, bootIdentity = CURRENT_BOOT): PresenceFileReading<PresenceRecord> {
  return { verdict: 'read', record: presenceRecordOf(ending, bootIdentity) };
}

function batonRecordOf(holder: BatonHolder, bootIdentity: string): BatonRecord {
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

/** The Baton the recorded process left behind. */
function recordedProcessesDeadBatonOf(bootIdentity = CURRENT_BOOT): BatonReading {
  return { verdict: 'dead', generation: PREVIOUS_GENERATION, record: batonRecordOf(RECORDED_PROCESS, bootIdentity) };
}

/** The Baton of a later start that died before it wrote presence; `null` for one whose record cannot be read. */
function anotherStartsDeadBatonOf(generation: number, bootIdentity: string | null = CURRENT_BOOT): BatonReading {
  return { verdict: 'dead', generation, record: bootIdentity === null ? null : batonRecordOf(ANOTHER_STARTS_PROCESS, bootIdentity) };
}

function heartbeatBefore(millisecondsBeforeBoot: number, generation = PREVIOUS_GENERATION): HeartbeatRecord {
  return {
    heartbeatVersion: 1,
    generation,
    sequence:         12,
    at:               LocalTimeUtil.formatLocalIso(new Date(BOOT_STARTED_AT_MILLISECONDS - millisecondsBeforeBoot)),
  };
}

/** A start by the user after a generation that crashed unrecorded in this boot, its Baton left behind; each case changes what it is about. */
function evidenceWith(changes: Partial<StartEvidence>): StartEvidence {
  return {
    presence:                  presenceReadOf(null),
    heartbeat:                 { verdict: 'absent' },
    newestBaton:               recordedProcessesDeadBatonOf(),
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
  test('a first start with no record and no Baton is a first start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestBaton: { verdict: 'none' } }));
    expect(verdict.kind).toBe('first-start');
    expect(verdict.previousGeneration).toBeNull();
    expect(verdict.evidence.presence).toBe('absent');
  });

  test('a completed stop on record reads as stopped on purpose', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: { verdict: 'none' } }));
    expect(verdict.kind).toBe('stopped-on-purpose');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION);
    expect(verdict.evidence.previousEnding).toBe('stopped');
    expect(verdict.crashedComponent).toBeNull();
  });

  test('a crash the forge recorded itself reads as a crash of the component it names', () => {
    const recordedOverseerCrash = StartClassification.classify(evidenceWith({
      presence: {
        verdict: 'read',
        record:  presenceRecordOf({
          kind: 'crashed', component: 'overseer', crashLogNumber: 2, at: '2026-11-19T10:00:00+01:00'
        }, EARLIER_BOOT)
      }
    }));
    expect(recordedOverseerCrash.kind).toBe('crashed');
    expect(recordedOverseerCrash.crashedComponent).toBe('overseer');
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

  test('a successor whose predecessor died during the Baton pass reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({ origin: { startOrigin: 'successor', predecessorGeneration: PREVIOUS_GENERATION } }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('overseer');
  });

  test('a record of another boot with no ending reads as the machine going down', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(null, EARLIER_BOOT), newestBaton: recordedProcessesDeadBatonOf(EARLIER_BOOT) }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
    expect(verdict.crashedComponent).toBeNull();
    expect(verdict.evidence.previousBootIdentity).toBe(EARLIER_BOOT);
  });

  test('the same boot with no ending reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({}));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('overseer');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION);
  });

  test('a start that failed after its presence write and let go of its Baton reads as stopped on purpose, not as a crash', () => {
    const noBatonLeft = StartClassification.classify(evidenceWith({ newestBaton: { verdict: 'none' } }));
    expect(noBatonLeft.kind).toBe('stopped-on-purpose');
    expect(noBatonLeft.previousGeneration).toBe(PREVIOUS_GENERATION);
  });

  test('a stop on record followed by a start that took Baton 1 again and died before its presence write reads as a crash, not as a stop', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: anotherStartsDeadBatonOf(1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('overseer');
    expect(verdict.previousGeneration).toBe(1);
    expect(verdict.evidence.newerBatonThanPresence).toBe(true);
  });

  test('a start that took Baton 1 again and died before its presence write, before a reboot, reads as the machine going down, judged by no earlier run\'s beat', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(STOPPED, EARLIER_BOOT),
      newestBaton: anotherStartsDeadBatonOf(1, EARLIER_BOOT),
      heartbeat:   { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100, 1) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
  });

  test('a newer Baton than the record, in the same boot, reads as a crash during start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: anotherStartsDeadBatonOf(PREVIOUS_GENERATION + 1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('overseer');
    expect(verdict.previousGeneration).toBe(PREVIOUS_GENERATION + 1);
    expect(verdict.evidence.newerBatonThanPresence).toBe(true);
  });

  test('a newer Baton than the record, of another boot, reads as the machine going down; an unreadable one as a crash', () => {
    const otherBootsBaton = anotherStartsDeadBatonOf(PREVIOUS_GENERATION + 1, EARLIER_BOOT);
    const otherBoot = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: otherBootsBaton }));
    expect(otherBoot.kind).toBe('machine-went-down');
    const unreadableBaton = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: anotherStartsDeadBatonOf(PREVIOUS_GENERATION + 1, null) }));
    expect(unreadableBaton.kind).toBe('crashed');
  });

  test('a Baton with no presence record at all, in the same boot, reads as a crash during start', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestBaton: anotherStartsDeadBatonOf(1) }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.previousGeneration).toBe(1);
    expect(verdict.evidence.newerBatonThanPresence).toBe(true);
  });

  test('an unreadable presence record reads as a crash', () => {
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'unreadable', reason: 'example damage' }, newestBaton: { verdict: 'none' } }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('overseer');
    expect(verdict.evidence.presence).toBe('unreadable');
  });

  test('a Talos lost in this boot after a stop on record reads as a crash of Talos', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(STOPPED),
      newestBaton: { verdict: 'none' },
      talos:       { verdict: 'gone', bootIdentity: CURRENT_BOOT },
    }));
    expect(verdict.kind).toBe('crashed');
    expect(verdict.crashedComponent).toBe('talos');
    expect(verdict.evidence.talos).toBe('lost-this-boot');
  });

  test('a Talos lost in this boot never spoils a first start', () => {
    const talosLostThisBoot = { verdict: 'gone', bootIdentity: CURRENT_BOOT } as const;
    const verdict = StartClassification.classify(evidenceWith({ presence: { verdict: 'absent' }, newestBaton: { verdict: 'none' }, talos: talosLostThisBoot }));
    expect(verdict.kind).toBe('first-start');
  });

  test('a Talos lost in another boot reads as the machine going down, with no crash suspected after a stop on record', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(STOPPED, EARLIER_BOOT),
      newestBaton: { verdict: 'none' },
      heartbeat:   { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100) },
      talos:       { verdict: 'gone', bootIdentity: EARLIER_BOOT },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
    expect(verdict.evidence.talos).toBe('lost-other-boot');
  });

  test('a live or quit Talos changes no kind', () => {
    expect(StartClassification.classify(evidenceWith({ talos: { verdict: 'live' } })).kind).toBe('crashed');
    const afterAStopWithTalosQuit = StartClassification.classify(evidenceWith({ presence: presenceReadOf(STOPPED), newestBaton: { verdict: 'none' }, talos: { verdict: 'quit' } }));
    expect(afterAStopWithTalosQuit.kind).toBe('stopped-on-purpose');
  });

  test('a crash followed by a reboot reads as the machine going down, with the crash suspected when the heartbeat stopped well before the boot', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(null, EARLIER_BOOT),
      newestBaton: recordedProcessesDeadBatonOf(EARLIER_BOOT),
      heartbeat:   { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS + MILLISECONDS_PER_SECOND) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(true);
    expect(verdict.evidence.lastHeartbeatAt).not.toBeNull();
    expect(LocalTimeUtil.parseIso(verdict.evidence.bootStartedAt ?? '')?.getTime()).toBe(BOOT_STARTED_AT_MILLISECONDS);
  });

  test('a heartbeat that stopped less than the bound before the boot is no suspected crash', () => {
    const verdict = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(null, EARLIER_BOOT),
      newestBaton: recordedProcessesDeadBatonOf(EARLIER_BOOT),
      heartbeat:   { verdict: 'read', record: heartbeatBefore(HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS - MILLISECONDS_PER_SECOND) },
    }));
    expect(verdict.kind).toBe('machine-went-down');
    expect(verdict.crashSuspected).toBe(false);
  });

  test('a stale heartbeat of another generation, or with no boot start time, is no suspected crash', () => {
    const staleBeat = HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS * 100;
    const ofAnotherGeneration = StartClassification.classify(evidenceWith({
      presence:    presenceReadOf(null, EARLIER_BOOT),
      newestBaton: recordedProcessesDeadBatonOf(EARLIER_BOOT),
      heartbeat:   { verdict: 'read', record: heartbeatBefore(staleBeat, PREVIOUS_GENERATION - 1) },
    }));
    expect(ofAnotherGeneration.crashSuspected).toBe(false);
    expect(ofAnotherGeneration.evidence.lastHeartbeatAt).toBeNull();
    const withNoBootStart = StartClassification.classify(evidenceWith({
      presence:                  presenceReadOf(null, EARLIER_BOOT),
      newestBaton:               recordedProcessesDeadBatonOf(EARLIER_BOOT),
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
      newestBaton:         recordedProcessesDeadBatonOf(EARLIER_BOOT),
      currentBootIdentity: UNREADABLE_BOOT_IDENTITY,
    }));
    expect(unreadableNow.kind).toBe('crashed');
    const unreadableBefore = StartClassification.classify(evidenceWith({ presence: presenceReadOf(null, UNREADABLE_BOOT_IDENTITY) }));
    expect(unreadableBefore.kind).toBe('crashed');
  });
});
