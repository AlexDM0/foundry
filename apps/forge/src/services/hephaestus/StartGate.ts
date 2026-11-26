/**
 * The gate every start of a board's forge passes before it takes a Hephaestus lock: it reads what the generation before it left, classifies the start,
 * writes the crash log of a crash it finds, and answers whether the start may serve. `start`, the foreground entry and `status` read it.
 */
import type { PresenceRecord }                            from '../../adapters/presence/@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                from '../../adapters/presence/@types/StartClassificationVerdict.ts';
import type { PlatformPorts }                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, UNREADABLE_BOOT_IDENTITY } from '../../lib/process-identity/ProcessIdentity.ts';
import type { StoreReadFace }                             from '../store/BoardStore.ts';
import type { Workspace }                                 from '../tracker/Workspace.ts';
import type { CrashLogJob, CrashLogRecord }               from './@types/CrashLogRecord.ts';
import type { StartGateVerdict }                          from './@types/StartClassification.ts';
import { CrashLog }                                       from './CrashLog.ts';
import type { HephaestusFiles }                           from './HephaestusFiles.ts';
import { HephaestusLock }                                 from './HephaestusLock.ts';
import { Presence }                                       from './Presence.ts';
import {
  StartClassification,
  type StartEvidence,
  type StartOriginReading,
  type TalosRecordReading
} from './StartClassification.ts';
import {
  newestTalosStartNumberIn,
  persistedChildRecordsOf,
  runningIdentityOf,
  talosRecordAt
} from './TalosStart.ts';
import type { UnreadableBoardFiles } from './UnreadableBoardFiles.ts';

export interface StartGateRequest {
  ports:                PlatformPorts;
  files:                HephaestusFiles;
  workspace:            Workspace;
  boardReads:           StoreReadFace;
  origin:               StartOriginReading;
  stampNow:             () => string;
  /** Where the gate reports a board-wide file it could not read; the start goes on as an unreadable reading lets it. */
  unreadableBoardFiles: UnreadableBoardFiles;
  /** Where the gate logs a file it could not read that the next write heals. */
  log:                  (line: string) => void;
}

/** A Talos record that cannot be read, or names no process, keeps no boot of its own, so it reads as lost in this boot, as the crash path reads it. */
function talosRecordReadingOf(ports: PlatformPorts, boardFolder: string): TalosRecordReading {
  const newestStartNumber = newestTalosStartNumberIn(boardFolder);
  if (newestStartNumber === null) return { verdict: 'none' };
  const record = talosRecordAt(boardFolder, newestStartNumber);
  if (record?.state === 'quit') return { verdict: 'quit' };
  if (record !== null && runningIdentityOf(ports, record.talos) !== null) return { verdict: 'live' };
  return { verdict: 'gone', bootIdentity: record?.talos?.bootIdentity ?? UNREADABLE_BOOT_IDENTITY };
}

function evidenceOf({
  ports, files, workspace, origin
}: Pick<StartGateRequest, 'ports' | 'files' | 'workspace' | 'origin'>): StartEvidence {
  const { processSupervision } = ports;
  return {
    presence:                  Presence.readPresence(files),
    heartbeat:                 Presence.readHeartbeat(files),
    newestLock:                HephaestusLock.newestOf(ports, files.hephaestusDirectory),
    talos:                     talosRecordReadingOf(ports, workspace.trackerDirectory),
    currentBootIdentity:       processSupervision.identityOf(process.pid)?.bootIdentity ?? UNREADABLE_BOOT_IDENTITY,
    bootStartedAtEpochSeconds: processSupervision.bootStartedAtEpochSeconds(),
    origin,
  };
}

function crashToLogOf(classification: StartClassificationVerdict): boolean {
  return classification.kind === 'crashed' || (classification.kind === 'machine-went-down' && classification.crashSuspected);
}

function readingOrNull<Value>(read: () => Value): Value | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function activeJobsOf(boardReads: StoreReadFace): CrashLogJob[] | null {
  return readingOrNull(() => (boardReads.requireProgress().jobs ?? []).map(CrashLog.activeJobOf));
}

function talosChildrenOf(boardFolder: string): unknown[] | null {
  const newestStartNumber = newestTalosStartNumberIn(boardFolder);
  return newestStartNumber === null ? null : readingOrNull(() => persistedChildRecordsOf(boardFolder, newestStartNumber));
}

/** The holder of the crashed generation's dead Hephaestus lock, which names the crashed process when no presence record does. */
function hephaestusLockHolderOf(evidence: StartEvidence, crashedGeneration: number | null): ProcessIdentity | null {
  const { newestLock } = evidence;
  if (newestLock.verdict !== 'dead' || newestLock.generation !== crashedGeneration || newestLock.record === null) return null;
  const { processId, processStartStamp, bootIdentity } = newestLock.record;
  return { processId, startStamp: processStartStamp, bootIdentity };
}

/** The crash log a `crashed` ending of the crashed generation names, while that log is still there: the crash path wrote it. */
function crashLogNamedByTheEnding(files: HephaestusFiles, presenceOfTheCrash: PresenceRecord | null): number | null {
  const ending = presenceOfTheCrash?.ending;
  if (ending?.kind !== 'crashed' || ending.crashLogNumber === null) return null;
  return CrashLog.read(files, ending.crashLogNumber).verdict === 'read' ? ending.crashLogNumber : null;
}

function presenceOfTheCrashIn(evidence: StartEvidence, classification: StartClassificationVerdict): PresenceRecord | null {
  const { presence } = evidence;
  const presenceNamesTheCrash = presence.verdict === 'read' && !classification.evidence.newerHephaestusLockThanPresence
    && presence.record.generation === classification.previousGeneration;
  return presenceNamesTheCrash ? presence.record : null;
}

/** The log a start already wrote for this crash, or the crash path did, read without writing one: `status` names it. */
function loggedCrashLogOf(files: HephaestusFiles, evidence: StartEvidence, classification: StartClassificationVerdict): number | null {
  const crashedGeneration = classification.previousGeneration;
  const presenceOfTheCrash = presenceOfTheCrashIn(evidence, classification);
  return crashLogNamedByTheEnding(files, presenceOfTheCrash) ?? CrashLog.newestLogOfTheSameCrash(files, {
    crashedGeneration,
    crashedProcess: presenceOfTheCrash?.process ?? hephaestusLockHolderOf(evidence, crashedGeneration),
    classification,
  });
}

/** Written once: the crash path, or an earlier start, may have logged this crash already, and that log stays. Answers the log's number. */
function writeTheCrashLog(request: StartGateRequest, evidence: StartEvidence, classification: StartClassificationVerdict): number {
  const {
    files, workspace, boardReads, origin
  } = request;
  const crashedGeneration = classification.previousGeneration;
  const { heartbeat } = evidence;
  const presenceOfTheCrash = presenceOfTheCrashIn(evidence, classification);
  const loggedByTheCrashPath = crashLogNamedByTheEnding(files, presenceOfTheCrash);
  if (loggedByTheCrashPath !== null) return loggedByTheCrashPath;
  const heartbeatOfTheCrash = heartbeat.verdict === 'read' && heartbeat.record.generation === crashedGeneration ? heartbeat.record : null;
  const component: CrashLogRecord['component'] = classification.crashedComponent ?? 'unknown';
  return CrashLog.writeOnce(files, CrashLog.assemble({
    crashedGeneration,
    component,
    suspected:            classification.kind === 'machine-went-down',
    classification,
    recordedAt:           request.stampNow(),
    recordedBy:           { generation: null, startOrigin: origin.startOrigin, crashPath: false },
    error:                null,
    presence:             presenceOfTheCrash,
    hephaestusLockHolder: hephaestusLockHolderOf(evidence, crashedGeneration),
    heartbeat:            heartbeatOfTheCrash,
    activeJobs:           activeJobsOf(boardReads),
    talosChildren:        talosChildrenOf(workspace.trackerDirectory),
    logTail:              CrashLog.logTailOf(files.logFilePath),
  })).crashLogNumber;
}

/** Only a start the user made serves after a crash or a suspected one (decisions 14 and 39): a successor stays off. */
function admit(request: StartGateRequest): StartGateVerdict {
  const evidence = evidenceOf(request);
  Presence.reportUnreadablePresence(evidence.presence, request.unreadableBoardFiles);
  if (evidence.heartbeat.verdict === 'unreadable') request.log(`heartbeat.json could not be read (${evidence.heartbeat.reason}); the start classifies without a last beat.`);
  const classification = StartClassification.classify(evidence);
  if (!crashToLogOf(classification)) return { verdict: 'serve', classification, crashLogNumber: null };
  const crashLogNumber = writeTheCrashLog(request, evidence, classification);
  if (request.origin.startOrigin === 'user') return { verdict: 'serve', classification, crashLogNumber };
  return {
    verdict:           'stay-off',
    classification,
    crashLogNumber,
    crashedGeneration: classification.previousGeneration,
    crashLogPath:      CrashLog.pathOf(request.files, crashLogNumber),
  };
}

export const StartGate = Object.freeze({
  evidenceOf, crashToLogOf, loggedCrashLogOf, admit
});
