/**
 * The one path every crash a live forge process sees runs: it writes the crash log once, ends the generation's presence `crashed` and stops the
 * lease renewal, synchronously so a dying process makes them, then tells the registry within a bound. It never throws.
 */
import type { HephaestusLog } from '../../adapters/@types/HephaestusLogRecord.ts';
import type {
  CrashedComponent,
  CrashErrorOrigin,
  CrashLogError,
  CrashLogJob
} from '../../adapters/crash-log/@types/CrashLogRecord.ts';
import type { PresenceRegistration }              from '../tracker/MonitorRegistration.ts';
import type { CrashLogWrite }                     from './@types/CrashLogRecord.ts';
import type { PresenceUpdate }                    from './@types/PresenceRecord.ts';
import { CrashLog }                               from './CrashLog.ts';
import type { HephaestusFiles }                   from './HephaestusFiles.ts';
import { Presence }                               from './Presence.ts';
import { thrownNamedOf }                          from './ThrownNaming.ts';
import type { UnreadableBoardFiles }              from './UnreadableBoardFiles.ts';
import { CRASH_PATH_REGISTRY_BOUND_MILLISECONDS } from './constants/PresenceLimits.ts';

/** The registry's presence key of a crash, which the crash path's registry step writes. */
export type RegistryCrashReport = Extract<PresenceRegistration, { state: 'crashed' }>;

export interface CrashPathContext {
  files:                      HephaestusFiles;
  /** The generation that crashed: the one this process serves. */
  generation:                 number;
  /** The board's live jobs; `null` when the board cannot be read. */
  activeJobs:                 () => CrashLogJob[] | null;
  /** Talos's persisted child records as stored; `null` when they cannot be read. */
  talosChildren:              () => unknown[] | null;
  stopLeaseRenewal:           () => void;
  writeRegistryCrash:         (report: RegistryCrashReport) => Promise<unknown>;
  stampNow:                   () => string;
  log:                        HephaestusLog;
  /** The serving Hephaestus's board files it could not read; the crash path reports a crash log it cannot read there. */
  unreadableBoardFiles:       UnreadableBoardFiles;
  registryBoundMilliseconds?: number;
}

export interface Crash {
  component: CrashedComponent;
  error:     CrashLogError | null;
}

/** `crashLogPath` is `null` only when the crash log could not be written. */
export interface CrashPathOutcome {
  crashLogPath: string | null;
  crashLog:     CrashLogWrite['verdict'] | 'not-written';
  presence:     PresenceUpdate['verdict'] | 'not-written';
  registry:     'written' | 'cut-off' | 'failed';
}

function readingOrNull<Value>(read: () => Value | null): Value | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function writeTheCrashLog(context: CrashPathContext, crash: Crash, recordedAt: string): CrashLogWrite | 'not-written' {
  const { files, generation } = context;
  const presenceReading = readingOrNull(() => Presence.readPresence(files));
  const heartbeatReading = readingOrNull(() => Presence.readHeartbeat(files));
  // The dying process has no board header left to warn in, so an unreadable file is logged and left out of the crash log.
  if (presenceReading?.verdict === 'unreadable') context.log({ kind: 'crash-log-leaves-out-presence', generation, problem: presenceReading.problem });
  if (heartbeatReading?.verdict === 'unreadable') context.log({ kind: 'crash-log-leaves-out-heartbeat', generation, problem: heartbeatReading.problem });
  const presence = presenceReading?.verdict === 'read' && presenceReading.record.generation === generation ? presenceReading.record : null;
  const heartbeat = heartbeatReading?.verdict === 'read' && heartbeatReading.record.generation === generation ? heartbeatReading.record : null;
  const record = CrashLog.assemble({
    crashedGeneration:    generation,
    component:            crash.component,
    suspected:            false,
    classification:       null,
    recordedAt,
    recordedBy:           { generation, startOrigin: presence?.startOrigin ?? null, crashPath: true },
    error:                crash.error,
    presence,
    hephaestusLockHolder: null,
    heartbeat,
    activeJobs:           readingOrNull(context.activeJobs),
    talosChildren:        readingOrNull(context.talosChildren),
    logTail:              CrashLog.logTailOf(files.logFilePath),
  });
  try {
    return CrashLog.writeOnce(files, record, context.unreadableBoardFiles);
  } catch (thrown) {
    context.log({ kind: 'crash-log-unwritten', generation, ...thrownNamedOf(thrown) });
    return 'not-written';
  }
}

function writeTheCrashedEnding(context: CrashPathContext, crash: Crash, crashLogNumber: number | null, at: string): CrashPathOutcome['presence'] {
  try {
    const ending = { kind: 'crashed', component: crash.component, crashLogNumber } as const;
    return Presence.writeEnding(context.files, context.generation, ending, at).verdict;
  } catch (thrown) {
    context.log({ kind: 'crashed-ending-unwritten', generation: context.generation, ...thrownNamedOf(thrown) });
    return 'not-written';
  }
}

function stopTheLeaseRenewal(context: CrashPathContext): void {
  try {
    context.stopLeaseRenewal();
  } catch (thrown) {
    context.log({ kind: 'lease-renewal-unstoppable', ...thrownNamedOf(thrown) });
  }
}

/** A registry write still running at the bound is cut off; the dying process goes on without it. */
async function boundedRegistryWrite(context: CrashPathContext, report: RegistryCrashReport): Promise<CrashPathOutcome['registry']> {
  let boundTimer: ReturnType<typeof setTimeout> | null = null;
  const boundReached = new Promise<'cut-off'>((resolve) => {
    boundTimer = setTimeout(() => resolve('cut-off'), context.registryBoundMilliseconds ?? CRASH_PATH_REGISTRY_BOUND_MILLISECONDS);
  });
  const written = (async (): Promise<'written' | 'failed'> => {
    try {
      await context.writeRegistryCrash(report);
      return 'written';
    } catch (thrown) {
      context.log({ kind: 'registry-crash-unwritten', ...thrownNamedOf(thrown) });
      return 'failed';
    }
  })();
  try {
    return await Promise.race([written, boundReached]);
  } finally {
    if (boundTimer !== null) clearTimeout(boundTimer);
  }
}

/** The first three steps run before this returns; the promise settles once the registry was told, or at the bound. */
function record(context: CrashPathContext, crash: Crash): Promise<CrashPathOutcome> {
  let recordedAt = '';
  try {
    recordedAt = context.stampNow();
  } catch {
    // An unreadable clock leaves the stamp empty rather than losing the crash.
  }
  const crashLogWrite = writeTheCrashLog(context, crash, recordedAt);
  const crashLogNumber = crashLogWrite === 'not-written' ? null : crashLogWrite.crashLogNumber;
  const crashLogPath = crashLogNumber === null ? null : CrashLog.pathOf(context.files, crashLogNumber);
  const crashLog = crashLogWrite === 'not-written' ? crashLogWrite : crashLogWrite.verdict;
  const presence = writeTheCrashedEnding(context, crash, crashLogNumber, recordedAt);
  stopTheLeaseRenewal(context);
  const report: RegistryCrashReport = {
    state:      'crashed',
    generation: context.generation,
    at:         recordedAt,
    crash:      {
      component:    crash.component,
      suspected:    false,
      errorName:    crash.error?.name ?? null,
      errorMessage: crash.error?.message ?? null,
      crashLogPath,
    },
  };
  return boundedRegistryWrite(context, report).then((registry) => ({
    crashLogPath, crashLog, presence, registry
  }));
}

/**
 * Listens for an uncaught exception and an unhandled rejection. Each runs the crash path, removes both listeners and rethrows in a microtask,
 * so the process still dies as an uncaught error does; the bound rethrows if the registry step has not settled. A process that serves no
 * generation yet has nothing to record and only rethrows. `crashErrorOf` is the edge's, which words a refusal for the crash log. Answers the
 * removal of both listeners.
 */
function listenForProcessCrashes(
  contextNow: () => CrashPathContext | null, crashErrorOf: (origin: CrashErrorOrigin, thrown: unknown) => CrashLogError
): () => void {
  const removeListeners = (): void => {
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
  };

  function crashWith(origin: 'uncaught-exception' | 'unhandled-rejection', thrown: unknown): void {
    removeListeners();
    let rethrown = false;
    let boundTimer: ReturnType<typeof setTimeout> | null = null;
    const rethrow = (): void => {
      if (rethrown) return;
      rethrown = true;
      if (boundTimer !== null) clearTimeout(boundTimer);
      queueMicrotask(() => {
        throw thrown;
      });
    };
    const context = readingOrNull(contextNow);
    if (context === null) {
      rethrow();
      return;
    }
    boundTimer = setTimeout(rethrow, context.registryBoundMilliseconds ?? CRASH_PATH_REGISTRY_BOUND_MILLISECONDS);
    void record(context, { component: 'hephaestus', error: crashErrorOf(origin, thrown) }).then(rethrow, rethrow);
  }

  function onUncaughtException(thrown: unknown): void {
    crashWith('uncaught-exception', thrown);
  }

  function onUnhandledRejection(reason: unknown): void {
    crashWith('unhandled-rejection', reason);
  }
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  return removeListeners;
}

export const CrashPath = Object.freeze({
  record,
  listenForProcessCrashes,
});
