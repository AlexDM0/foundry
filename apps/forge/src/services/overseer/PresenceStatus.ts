/**
 * The `presence` block of `oversee status` and the off-after-crash notice of `status`, read from the board's files alone: with the forge down
 * it classifies the evidence as a start by the user would, and writes nothing, not even a crash log.
 */
import type { PlatformPorts }                                         from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { LeaseStanding }                                         from '../../lib/talos/SupervisionLease.ts';
import type { TalosRecord }                                           from '../../lib/talos/TalosRecord.ts';
import type { Workspace }                                             from '../tracker/Workspace.ts';
import type { HeartbeatRecord, PresenceRecord }                       from './@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                            from './@types/StartClassification.ts';
import { Baton, type BatonReading }                                   from './Baton.ts';
import { CrashLog }                                                   from './CrashLog.ts';
import type { OverseerFiles }                                         from './OverseerFiles.ts';
import { Presence }                                                   from './Presence.ts';
import { StartClassification }                                        from './StartClassification.ts';
import { StartGate }                                                  from './StartGate.ts';
import { newestTalosStartNumberIn, runningIdentityOf, talosRecordAt } from './TalosStart.ts';

export type PresenceState = 'serving' | 'starting' | 'down' | 'off-after-crash';

export type Supervision = 'supervising' | 'stopped' | 'checking-after-a-gap' | 'not-yet-renewed' | 'no-talos';

export interface StatusCrashLog {
  number:     number;
  generation: number | null;
  path:       string;
  suspected:  boolean;
}

export interface StatusPresence {
  state:           PresenceState;
  lastStart:       StartClassificationVerdict | null;
  crashLog:        StatusCrashLog | null;
  heartbeat:       HeartbeatRecord | null;
  supervision:     Supervision;
  abandonedPasses: PresenceRecord['abandonedPasses'] | null;
}

/** What the off-after-crash text names besides the crash log: the crashed generation and whether the crash is only suspected. */
export interface CrashReading {
  crashedGeneration: number | null;
  suspected:         boolean;
}

export interface StatusPresenceReading {
  presence: StatusPresence;
  /** Set only with the state `off-after-crash`. */
  crash:    CrashReading | null;
}

/** The live Overseer `oversee status` found, or `null` when the newest Baton names no live process. */
export interface LiveOverseer {
  generation:     number;
  answersAlready: boolean;
}

export interface PresenceStatusRequest {
  ports:     PlatformPorts;
  files:     OverseerFiles;
  workspace: Workspace;
}

/** Talos's lease standing in the words presence uses for its agents' supervision. */
const SUPERVISION_OF_LEASE_STANDING: Readonly<Record<LeaseStanding, Supervision>> = Object.freeze({
  'held':              'supervising',
  'ended':             'stopped',
  'waiting-after-gap': 'checking-after-a-gap',
  'unheld':            'not-yet-renewed',
});

/** The newest Talos record while its Talos runs and has not quit; `null` with no such record. */
function liveTalosRecordOf(ports: PlatformPorts, workspace: Workspace): TalosRecord | null {
  const newestStartNumber = newestTalosStartNumberIn(workspace.trackerDirectory);
  if (newestStartNumber === null) return null;
  const record = talosRecordAt(workspace.trackerDirectory, newestStartNumber);
  if (record === null || record.state === 'quit' || runningIdentityOf(ports, record.talos) === null) return null;
  return record;
}

/** The supervision a live Talos's record names; `no-talos` without one. */
function supervisionOfTalosRecord(liveTalosRecord: TalosRecord | null): Supervision {
  return liveTalosRecord === null ? 'no-talos' : SUPERVISION_OF_LEASE_STANDING[liveTalosRecord.lease.standing];
}

function supervisionOf({ ports, workspace }: PresenceStatusRequest): Supervision {
  return supervisionOfTalosRecord(liveTalosRecordOf(ports, workspace));
}

function storedPresenceOf(files: OverseerFiles): PresenceRecord | null {
  const reading = Presence.readPresence(files);
  return reading.verdict === 'read' ? reading.record : null;
}

function storedHeartbeatOf(files: OverseerFiles): HeartbeatRecord | null {
  const reading = Presence.readHeartbeat(files);
  return reading.verdict === 'read' ? reading.record : null;
}

function statusCrashLogOf(files: OverseerFiles, crashLogNumber: number | null): StatusCrashLog | null {
  if (crashLogNumber === null) return null;
  const reading = CrashLog.read(files, crashLogNumber);
  return {
    number:     crashLogNumber,
    generation: reading.verdict === 'read' ? reading.record.crashedGeneration : null,
    path:       CrashLog.pathOf(files, crashLogNumber),
    suspected:  reading.verdict === 'read' && reading.record.suspected,
  };
}

/** A start that served after a crash wrote or found its log, the newest on disk while it serves. */
function crashLogNumberOfTheLastStart(lastStart: StartClassificationVerdict | null, crashLogNumbers: readonly number[]): number | null {
  if (lastStart === null || !StartGate.crashToLogOf(lastStart)) return null;
  return crashLogNumbers.at(-1) ?? null;
}

function crashLogOfTheLastStart(files: OverseerFiles, lastStart: StartClassificationVerdict | null): StatusCrashLog | null {
  return statusCrashLogOf(files, crashLogNumberOfTheLastStart(lastStart, CrashLog.list(files)));
}

function liveReadingOf(request: PresenceStatusRequest, live: LiveOverseer): StatusPresenceReading {
  const stored = storedPresenceOf(request.files);
  const ownRecord = stored?.generation === live.generation ? stored : null;
  const heartbeat = storedHeartbeatOf(request.files);
  const lastStart = ownRecord?.startClassification ?? null;
  return {
    presence: {
      state:           live.answersAlready ? 'serving' : 'starting',
      lastStart,
      crashLog:        crashLogOfTheLastStart(request.files, lastStart),
      heartbeat:       heartbeat?.generation === live.generation ? heartbeat : null,
      supervision:     supervisionOf(request),
      abandonedPasses: ownRecord?.abandonedPasses ?? null,
    },
    crash: null,
  };
}

function classificationOfAStartByTheUser(request: PresenceStatusRequest): StartClassificationVerdict {
  return StartClassification.classify(StartGate.evidenceOf({ ...request, origin: { startOrigin: 'user' } }));
}

function downReadingOf(request: PresenceStatusRequest): StatusPresenceReading {
  const { files } = request;
  const evidence = StartGate.evidenceOf({ ...request, origin: { startOrigin: 'user' } });
  const classification = StartClassification.classify(evidence);
  const stored = storedPresenceOf(files);
  const offAfterCrash = StartGate.crashToLogOf(classification);
  return {
    presence: {
      state:           offAfterCrash ? 'off-after-crash' : 'down',
      lastStart:       stored?.startClassification ?? null,
      crashLog:        offAfterCrash ? statusCrashLogOf(files, StartGate.loggedCrashLogOf(files, evidence, classification)) : null,
      heartbeat:       storedHeartbeatOf(files),
      supervision:     supervisionOf(request),
      abandonedPasses: stored?.abandonedPasses ?? null,
    },
    crash: offAfterCrash ? { crashedGeneration: classification.previousGeneration, suspected: classification.crashSuspected } : null,
  };
}

function readingOf(request: PresenceStatusRequest, live: LiveOverseer | null): StatusPresenceReading {
  return live === null ? downReadingOf(request) : liveReadingOf(request, live);
}

/**
 * Whether the forge is down after a crash, or a crash suspected before a reboot. A board where no forge ever ran, with no presence record and
 * no Baton, is answered at once, so `status` asks the process table nothing there.
 */
function forgeIsOffAfterACrash(request: PresenceStatusRequest): boolean {
  const newestBaton: BatonReading = Baton.newestBatonOf(request.ports, request.files.overseerDirectory);
  if (newestBaton.verdict === 'live') return false;
  if (newestBaton.verdict === 'none' && Presence.readPresence(request.files).verdict === 'absent') return false;
  return StartGate.crashToLogOf(classificationOfAStartByTheUser(request));
}

export const PresenceStatus = Object.freeze({
  readingOf,
  forgeIsOffAfterACrash,
  liveTalosRecordOf,
  supervisionOfTalosRecord,
  crashLogNumberOfTheLastStart,
});
