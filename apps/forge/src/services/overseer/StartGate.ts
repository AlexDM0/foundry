/**
 * The gate every start of a board's forge passes before it takes a Baton: it reads what the generation before it left, classifies the start,
 * writes the crash log of a crash it finds, and answers whether the start may serve. `start`, the foreground entry and `oversee status` read it.
 */
import type { PlatformPorts }                                from '../../lib/platform-ports/PlatformPortsFor.ts';
import { UNREADABLE_BOOT_IDENTITY }                          from '../../lib/process-identity/ProcessIdentity.ts';
import { requireProgressFile }                               from '../tracker/TrackerReader.ts';
import type { Workspace }                                    from '../tracker/Workspace.ts';
import type { CrashLogJob, CrashLogRecord }                  from './@types/CrashLogRecord.ts';
import type { StartClassificationVerdict, StartGateVerdict } from './@types/StartClassification.ts';
import { Baton }                                             from './Baton.ts';
import { CrashLog }                                          from './CrashLog.ts';
import type { OverseerFiles }                                from './OverseerFiles.ts';
import { Presence }                                          from './Presence.ts';
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

export interface StartGateRequest {
  ports:     PlatformPorts;
  files:     OverseerFiles;
  workspace: Workspace;
  origin:    StartOriginReading;
  stampNow:  () => string;
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
    newestBaton:               Baton.newestBatonOf(ports, files.overseerDirectory),
    talos:                     talosRecordReadingOf(ports, workspace.trackerDirectory),
    currentBootIdentity:       processSupervision.identityOf(process.pid)?.bootIdentity ?? UNREADABLE_BOOT_IDENTITY,
    bootStartedAtEpochSeconds: processSupervision.bootStartedAtEpochSeconds(),
    origin,
  };
}

function crashToLogOf(classification: StartClassificationVerdict): boolean {
  return classification.kind === 'crashed' || (classification.kind === 'machine-went-down' && classification.crashSuspected);
}

/**
 * A crash whose generation nothing names (an unreadable presence record and no Baton) is logged one above the newest crash log, unless that
 * log was itself written for such a crash, so a second start of the same evidence finds it rather than writing another.
 */
function crashLogGenerationOf(files: OverseerFiles, previousGeneration: number | null): number {
  if (previousGeneration !== null) return previousGeneration;
  const newestGeneration = CrashLog.list(files).at(-1);
  if (newestGeneration === undefined) return 1;
  const newest = CrashLog.read(files, newestGeneration);
  const loggedForAnUnnamedGeneration = newest.verdict === 'read' && !newest.record.recordedBy.crashPath && newest.record.classification?.previousGeneration === null;
  return loggedForAnUnnamedGeneration ? newestGeneration : newestGeneration + 1;
}

function readingOrNull<Value>(read: () => Value): Value | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function activeJobsOf(workspace: Workspace): CrashLogJob[] | null {
  return readingOrNull(() => (requireProgressFile(workspace).jobs ?? []).map(CrashLog.activeJobOf));
}

function talosChildrenOf(boardFolder: string): unknown[] | null {
  const newestStartNumber = newestTalosStartNumberIn(boardFolder);
  return newestStartNumber === null ? null : readingOrNull(() => persistedChildRecordsOf(boardFolder, newestStartNumber));
}

/** Written once: the crash path, or an earlier start, may have written it already, and that log stays. */
function writeTheCrashLog(request: StartGateRequest, evidence: StartEvidence, classification: StartClassificationVerdict): number {
  const { files, workspace, origin } = request;
  const crashedGeneration = crashLogGenerationOf(files, classification.previousGeneration);
  const { presence, heartbeat } = evidence;
  const presenceNamesTheCrash = presence.verdict === 'read' && !classification.evidence.newerBatonThanPresence && presence.record.generation === crashedGeneration;
  const presenceOfTheCrash = presenceNamesTheCrash ? presence.record : null;
  const heartbeatOfTheCrash = heartbeat.verdict === 'read' && heartbeat.record.generation === crashedGeneration ? heartbeat.record : null;
  const component: CrashLogRecord['component'] = classification.crashedComponent ?? 'unknown';
  CrashLog.writeOnce(files, CrashLog.assemble({
    crashedGeneration,
    component,
    suspected:     classification.kind === 'machine-went-down',
    classification,
    recordedAt:    request.stampNow(),
    recordedBy:    { generation: null, startOrigin: origin.startOrigin, crashPath: false },
    error:         null,
    presence:      presenceOfTheCrash,
    heartbeat:     heartbeatOfTheCrash,
    activeJobs:    activeJobsOf(workspace),
    talosChildren: talosChildrenOf(workspace.trackerDirectory),
    logTail:       CrashLog.logTailOf(files.logFilePath),
  }));
  return crashedGeneration;
}

/** Only a start the user made serves after a crash or a suspected one (decisions 14 and 39): a login item and a successor stay off. */
function admit(request: StartGateRequest): StartGateVerdict {
  const evidence = evidenceOf(request);
  const classification = StartClassification.classify(evidence);
  if (!crashToLogOf(classification)) return { verdict: 'serve', classification, crashLogGeneration: null };
  const crashLogGeneration = writeTheCrashLog(request, evidence, classification);
  if (request.origin.startOrigin === 'user') return { verdict: 'serve', classification, crashLogGeneration };
  return {
    verdict: 'stay-off', classification, crashLogGeneration, crashLogPath: CrashLog.pathOf(request.files, crashLogGeneration)
  };
}

export const StartGate = Object.freeze({ evidenceOf, admit });
