/**
 * Talos, the one commander of a board's children: started as `<board folder> <start number>`, it claims its record, serves its endpoint
 * and runs every child Hephaestus launches, keeping its main loop free by sending every synchronous call to its thread. A failed call
 * ends it with its records left as they are, so Hephaestus reads it as lost.
 * It depends on `src/domain/talos`, `src/lib/atomic-file`, `src/lib/line-patterns`, `src/lib/local-endpoint` and `src/lib/process-identity`.
 */
import { appendFileSync } from 'node:fs';

import type { DoneFrame, ReceivedClientFrame, WelcomeFrame } from '../src/domain/talos/@types/TalosFrame.ts';
import { createLaunchRegistry }                              from '../src/domain/talos/LaunchRegistry.ts';
import { createSupervisionLease }                            from '../src/domain/talos/SupervisionLease.ts';
import {
  launchRegistryPathOf,
  startFilePathOf,
  talosLogPathOf,
  talosRecordPathOf
} from '../src/domain/talos/TalosFiles.ts';
import {
  type LeaseRenewer,
  type TalosQuitReason,
  type TalosRecord,
  talosRecordTextOf
} from '../src/domain/talos/TalosRecord.ts';
import { type TalosStartFile, talosStartFileOf }               from '../src/domain/talos/TalosStartFile.ts';
import { TALOS_PROTOCOL_VERSION, TALOS_RECORD_FORMAT_VERSION } from '../src/domain/talos/constants/TalosProtocol.ts';
import type { LocalEndpoint }                                  from '../src/lib/local-endpoint/LocalEndpoint.ts';
import { localEndpointFor }                                    from '../src/lib/local-endpoint/LocalEndpointFor.ts';
import type { SupervisedSpawnOptions }                         from '../src/lib/process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                               from '../src/lib/process-identity/ProcessSupervisionFor.ts';
import {
  type ChildFrameVerdict,
  type ChildSpawnRequest,
  type ChildStandardInput,
  type ChildSupervisor,
  createChildSupervisor,
  type SpawnedChild
} from './ChildSupervisor.ts';
import { endAgentsAtTurnEnd, PERFORMANCE_TIMER, runCleanQuit } from './CleanQuit.ts';
import {
  createSynchronousCalls,
  type SynchronousCalls,
  startSynchronousCallsWorker,
  type SynchronousCallsWorker
} from './SynchronousCallsClient.ts';
import { type TalosSocketServer, listenOnTalosSocket } from './TalosSocketServer.ts';

const TALOS_DONE_EXIT_CODE    = 0;
const TALOS_REFUSED_EXIT_CODE = 1;
const TALOS_FAILED_EXIT_CODE  = 2;

const START_NUMBER_PATTERN = /^[1-9]\d*$/;

/** The ports Talos works through, chosen once from the platform its binary was told. */
export interface TalosPorts {
  readonly endpoint:                    Pick<LocalEndpoint, 'serverOf'>;
  readonly startSynchronousCallsWorker: () => SynchronousCallsWorker;
  /** Handed to the thread's `start`, which chooses the process and endpoint adapters from it. */
  readonly platformOfTheThread:         string;
  readonly systemRoot:                  string | null;
  readonly spawnChild:                  (request: ChildSpawnRequest) => SpawnedChild;
  readonly ownVariableOf:               (name: string) => string | undefined;
}

/** Talos's clocks: a stamp recorded and shown on each event-log entry, and the wall clock its ticks and time bounds measure. */
export interface TalosClock {
  readonly stampNow:            () => string;
  readonly wallNowMilliseconds: () => number;
}

/** A flush or an end may settle later; one that fails tells of a child already gone, which its exit reports. */
function settleQuietly(outcome: unknown): void {
  if (outcome instanceof Promise) outcome.catch(() => undefined);
}

function standardInputOf(sink: Bun.FileSink): ChildStandardInput {
  return {
    writeLine: (line) => {
      sink.write(`${line}\n`);
      settleQuietly(sink.flush());
    },
    close: () => settleQuietly(sink.end()),
  };
}

function spawnChildWith(spawnOptions: SupervisedSpawnOptions): (request: ChildSpawnRequest) => SpawnedChild {
  return (request) => {
    const child = Bun.spawn({
      cmd:                      [...request.argv],
      cwd:                      request.workingDirectory,
      env:                      { ...request.environment },
      stdin:                    request.takesInput ? 'pipe' : 'ignore',
      stdout:                   'pipe',
      stderr:                   'pipe',
      windowsVerbatimArguments: request.verbatimArguments,
      ...spawnOptions,
    });
    return {
      processId:      child.pid,
      standardInput:  typeof child.stdin === 'object' && child.stdin !== null ? standardInputOf(child.stdin) : null,
      standardOutput: child.stdout,
      standardError:  child.stderr,
      exited:         child.exited,
      signalCode:     () => child.signalCode,
    };
  };
}

/** Every call of `calls`, a failure of which hands its cause to `fail` and never settles, since Talos ends on it. */
function callsEndingTalosOnFailure(calls: SynchronousCalls, fail: (cause: unknown) => void): SynchronousCalls {
  const guardedCalls = Object.fromEntries(Object.entries(calls).map(([callName, call]) => [
    callName,
    (...callArguments: unknown[]): Promise<unknown> => (call as (...passedArguments: unknown[]) => Promise<unknown>)(...callArguments)
      .catch((cause: unknown) => {
        fail(cause);
        return new Promise<never>(() => undefined);
      }),
  ]));
  return Object.freeze(guardedCalls) as unknown as SynchronousCalls;
}

async function fileTextOf(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

/** `null` for arguments, a start file or a secret Talos cannot start from: it then writes nothing. */
async function startOf(talosArguments: readonly string[]): Promise<{ startFile: TalosStartFile; secret: string } | null> {
  const [boardFolder, startNumberText] = talosArguments;
  if (boardFolder === undefined || boardFolder === '' || startNumberText === undefined || !START_NUMBER_PATTERN.test(startNumberText)) return null;
  const startNumber = Number(startNumberText);
  const startFileText = await fileTextOf(startFilePathOf(boardFolder, startNumber));
  const reading = startFileText === null ? null : talosStartFileOf(startFileText);
  if (reading?.verdict !== 'read' || reading.record.startNumber !== startNumber) return null;
  const secret = (await fileTextOf(reading.record.secretFilePath))?.trim() ?? '';
  return secret === '' ? null : { startFile: reading.record, secret };
}

/**
 * Runs `<board folder> <start number>` to its end and returns the exit code; it never exits. A second Talos of a claimed start number
 * returns 0 having spawned nothing. It has no command context, so it chooses its own ports from `platform`.
 */
export async function runTalos(
  talosArguments: readonly string[],
  clock: TalosClock,
  platform: string,
  systemRoot: string | undefined,
  ownVariableOf: (name: string) => string | undefined,
): Promise<number> {
  // Talos binds the endpoint its start file names and never draws one, so it has no pipe name prefix to give.
  return runTalosOnPorts(talosArguments, clock, {
    endpoint:            localEndpointFor(platform, ''),
    startSynchronousCallsWorker,
    platformOfTheThread: platform,
    systemRoot:          systemRoot ?? null,
    spawnChild:          spawnChildWith(processSupervisionFor(platform, systemRoot).spawnOptionsFor('supervised-child')),
    ownVariableOf,
  });
}

export async function runTalosOnPorts(talosArguments: readonly string[], clock: TalosClock, ports: TalosPorts): Promise<number> {
  const start = await startOf(talosArguments);
  if (start === null) return TALOS_REFUSED_EXIT_CODE;
  const { startFile, secret } = start;
  const { boardFolder, startNumber } = startFile;
  const talosLogPath = talosLogPathOf(boardFolder, startNumber);
  const talosRecordFilePath = talosRecordPathOf(boardFolder, startNumber);

  let settleExitCode = (_exitCode: number): void => undefined;
  const exitCode = new Promise<number>((resolve) => {
    settleExitCode = resolve;
  });
  let settled = false;
  let server: TalosSocketServer | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  const worker = ports.startSynchronousCallsWorker();
  const finish = (code: number): void => {
    if (settled) return;
    settled = true;
    worker.terminate();
    settleExitCode(code);
  };
  const fail = (cause: unknown): void => {
    if (settled) return;
    try {
      // The one synchronous write of Talos's main thread: the thread that would write it may be what failed, and the process exits next.
      appendFileSync(talosLogPath, `talos failed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    } catch {
      // The disk that failed Talos may refuse this line too; Talos ends without its cause.
    }
    settled = true;
    // Nothing here writes a record: Hephaestus reads Talos as lost from the records as the failure left them.
    if (tickTimer !== null) clearInterval(tickTimer);
    server?.close();
    worker.terminate();
    settleExitCode(TALOS_FAILED_EXIT_CODE);
  };
  const calls = callsEndingTalosOnFailure(createSynchronousCalls(worker), fail);

  const serve = async (): Promise<void> => {
    await calls.start(ports.platformOfTheThread, ports.systemRoot);
    let record: TalosRecord = {
      formatVersion:   TALOS_RECORD_FORMAT_VERSION,
      startNumber,
      protocolVersion: TALOS_PROTOCOL_VERSION,
      codeVersion:     startFile.codeVersion,
      talos:           await calls.identityOf(process.pid),
      state:           'claimed',
      endpoint:        null,
      quitReason:      null,
      lease:           { standing: 'unheld', lastRenewer: null },
    };
    if (await calls.writeRecord(talosRecordFilePath, talosRecordTextOf(record), true) === 'already-exists') {
      finish(TALOS_DONE_EXIT_CODE);
      return;
    }
    const writeTalosRecord = (changes: Partial<TalosRecord>): Promise<unknown> => {
      record = { ...record, ...changes };
      return calls.writeRecord(talosRecordFilePath, talosRecordTextOf(record), false);
    };
    const refuseStart = async (reason: string): Promise<void> => {
      await calls.appendText(talosLogPath, `start refused: ${reason}\n`);
      await writeTalosRecord({ state: 'quit', quitReason: 'start-refused' });
      finish(TALOS_REFUSED_EXIT_CODE);
    };
    const preparation = await calls.prepareEndpoint(startFile.endpoint);
    if (preparation.verdict === 'refused') {
      await refuseStart(`the endpoint cannot be prepared: ${preparation.reason}`);
      return;
    }

    let quitting = false;
    const supervisor: ChildSupervisor = createChildSupervisor({
      boardFolder,
      startNumber,
      talos:               record.talos,
      calls,
      launchRegistry:      createLaunchRegistry(launchRegistryPathOf(boardFolder, startNumber), calls.appendText),
      spawnChild:          ports.spawnChild,
      ownVariableOf:       ports.ownVariableOf,
      stampNow:            clock.stampNow,
      wallNowMilliseconds: clock.wallNowMilliseconds,
      tickMilliseconds:    startFile.tickMilliseconds,
      talosLogPath,
      broadcastState:      (frame) => server?.broadcast(frame),
      fail,
    });

    const quit = async (reason: TalosQuitReason): Promise<void> => {
      if (quitting) return;
      quitting = true;
      await runCleanQuit({
        children:         supervisor,
        waitMilliseconds: startFile.cleanQuitWaitMilliseconds,
        timer:            PERFORMANCE_TIMER,
        markQuitting:     () => writeTalosRecord({ state: 'quitting', quitReason: reason }),
        finishQuit:       async () => {
          if (tickTimer !== null) clearInterval(tickTimer);
          server?.close();
          await calls.releaseEndpoint(startFile.endpoint);
          await writeTalosRecord({ state: 'quit' });
          finish(TALOS_DONE_EXIT_CODE);
        },
      });
    };
    const quitAndFailOnThrow = (reason: TalosQuitReason): void => {
      quit(reason).catch(fail);
    };

    const lease = createSupervisionLease({
      leaseMilliseconds:           startFile.leaseMilliseconds,
      renewalIntervalMilliseconds: startFile.renewalIntervalMilliseconds,
      tickMilliseconds:            startFile.tickMilliseconds,
      tickGapMilliseconds:         startFile.tickGapMilliseconds,
    }, clock.wallNowMilliseconds());
    let lastRenewer: LeaseRenewer | null = null;
    // Each change of standing, never each renewal, so a held lease costs no write.
    const recordLeaseStandingWhenChanged = async (): Promise<void> => {
      const standing = lease.standing();
      if (standing !== record.lease.standing) await writeTalosRecord({ lease: { standing, lastRenewer } });
    };
    const tick = (): void => {
      const wallNowMilliseconds = clock.wallNowMilliseconds();
      supervisor.ticked(wallNowMilliseconds);
      if (quitting) return;
      const leaseEnded = lease.ticked(wallNowMilliseconds) === 'lease-ended';
      recordLeaseStandingWhenChanged().catch(fail);
      if (!leaseEnded) return;
      endAgentsAtTurnEnd({
        children: supervisor, reason: 'lease-ended', waitMilliseconds: startFile.cleanQuitWaitMilliseconds, timer: PERFORMANCE_TIMER
      }).catch(fail);
    };

    const verdictOf = async (frame: ReceivedClientFrame): Promise<ChildFrameVerdict> => {
      if (quitting) return { verdict: 'refused', reason: 'quitting' };
      switch (frame.kind) {
        case 'launch':
          return supervisor.launch(frame.launch);
        case 'stop':
          return supervisor.stop(frame.childId, frame.graceMilliseconds);
        case 'stop-lines':
          return supervisor.stopLines();
        case 'input':
          return supervisor.input(frame.childId, frame.input);
        case 'lease-renewal':
          lastRenewer = frame.renewer;
          lease.renewed(clock.wallNowMilliseconds());
          await recordLeaseStandingWhenChanged();
          return { verdict: 'done' };
        case 'quit':
          quitAndFailOnThrow(frame.reason);
          return { verdict: 'done' };
      }
    };
    const welcomeOf = (): WelcomeFrame => ({
      kind:            'welcome',
      protocolVersion: TALOS_PROTOCOL_VERSION,
      codeVersion:     startFile.codeVersion,
      startNumber,
      talos:           record.talos,
      leaseStanding:   record.lease.standing,
    });
    const listening = await listenOnTalosSocket({
      serverOf:          ports.endpoint.serverOf,
      endpoint:          startFile.endpoint,
      secret,
      isQuitting:        () => quitting,
      welcomeOf,
      onVersionMismatch: () => quitAndFailOnThrow('protocol-mismatch'),
      onClientFrame:     async (frame): Promise<DoneFrame> => ({ kind: 'done', frameId: frame.frameId, ...(await verdictOf(frame)) }),
    });
    if (listening.verdict === 'unbindable') {
      await refuseStart(`the endpoint cannot be bound: ${listening.reason}`);
      return;
    }
    ({ server } = listening);
    await writeTalosRecord({ state: 'serving', endpoint: startFile.endpoint });
    tickTimer = setInterval(tick, startFile.tickMilliseconds);
  };
  serve().catch(fail);
  return exitCode;
}
