/**
 * The Watcher boundary played in this process, for a DrivePass spec that tests the Overseer's code rather than the processes under it. A spawn
 * leaves the same job folder a Watcher leaves: the claimed record, the event log and the ended record, written by the same writers; a frame
 * reaches the world through a fake socket; a process is an entry in a table, so nothing starts and nothing needs ending. A session plays its
 * `FakeAgentAdapter` scenario, a process Watcher's line ends as `scriptLine` said. `src/testing/FakeWatcherWorld.integration.spec.ts` holds
 * that it logs what the real Watcher logs. A crash has no step here: those cases stay on the real Watcher.
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Socket }  from 'node:net';

import { createFileAtomically, writeFileAtomically }                                 from '../lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                                                from '../lib/git/GitProcess.ts';
import type { PlatformPorts }                                                        from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                                      from '../lib/process-identity/ProcessIdentity.ts';
import type { ProcessSupervision }                                                   from '../lib/process-identity/ProcessSupervision.ts';
import type { ActingFrame }                                                          from '../lib/watcher/@types/WatcherFrame.ts';
import { type EventLogWriter, createEventLogWriter, eventLogEntriesOf }              from '../lib/watcher/EventLog.ts';
import type { LocalEndpoint }                                                        from '../lib/watcher/LocalEndpoint.ts';
import { type WatcherFiles, watcherFilesOf }                                         from '../lib/watcher/WatcherFiles.ts';
import { type WatcherLaunch, readWatcherLaunch }                                     from '../lib/watcher/WatcherLaunch.ts';
import { type WatcherRecord, watcherRecordTextOf }                                   from '../lib/watcher/WatcherRecord.ts';
import { EVENT_LOG_FORMAT_VERSION, WATCHER_LINGER_FRAMES, WATCHER_PROTOCOL_VERSION } from '../lib/watcher/constants/WatcherProtocol.ts';
import type { ProcessStarts }                                                        from '../services/overseer/ProcessStarts.ts';
import type { WatcherSpawnRequest }                                                  from '../services/overseer/WatcherFleet.ts';
import { FAKE_HEAD_PLACEHOLDER, type FakeAgentStep }                                 from './FakeAgentAdapter.ts';

/** How a scripted process line ends: `exitCode` 0 and no output unless said. */
export interface ScriptedLineEnd {
  readonly exitCode?: number;
  readonly signal?:   string;
  readonly output?:   string;
}

export interface FakeWatcherWorld {
  /** The native ports with the process table and the fake socket in the place of the real ones. */
  readonly ports:         PlatformPorts;
  readonly processStarts: ProcessStarts;
  readonly scriptLine:    (line: string, end: ScriptedLineEnd) => void;
  /** What a session's `shell` step with this very command does, in the session's working directory. */
  readonly scriptShell:   (command: string, action: (workingDirectory: string) => void) => void;
  /** Every process line a Watcher or a merge gate ran, in order. */
  readonly linesRun:      () => readonly string[];
}

interface FakeHost {
  readonly files:     WatcherFiles;
  readonly launch:    WatcherLaunch;
  readonly watcher:   ProcessIdentity;
  readonly child:     ProcessIdentity;
  readonly runRecord: WatcherRecord;
  readonly eventLog:  EventLogWriter;
  readonly steps:     readonly FakeAgentStep[];
  nextStep:           number;
  linesWaiting:       number;
  inputClosed:        boolean;
  ended:              boolean;
  framesAfterTheEnd:  number;
}

const FIRST_FAKE_PROCESS_ID = 4_000_000;
const FAKE_BOOT = 'example-boot';
/** Differs from the scratch Baton's stamp, so a Baton this process took reads as dead to a successor, as it does on the native ports. */
const FAKE_START_STAMP = '2';
const SCENARIO_ARGUMENT_INDEX = 2;
const BUILT_IN_LINES: Readonly<Record<string, ScriptedLineEnd>> = { true: {}, false: { exitCode: 1 } };

const fakeStampNow = (): string => '2026-09-18T22:11:03+02:00';

function scenarioOf(launch: WatcherLaunch): readonly FakeAgentStep[] {
  if (launch.kind !== 'agent') return [];
  return JSON.parse(readFileSync(launch.argv[SCENARIO_ARGUMENT_INDEX] ?? '', 'utf8')) as FakeAgentStep[];
}

function lineWithHeadOf(line: string, workingDirectory: string): string {
  return line.includes(FAKE_HEAD_PLACEHOLDER) ? line.replaceAll(FAKE_HEAD_PLACEHOLDER, GitProcess.resolvedCommitOf(workingDirectory, 'HEAD') ?? '') : line;
}

export function createFakeWatcherWorld(nativePorts: PlatformPorts): FakeWatcherWorld {
  const liveProcesses = new Map<number, ProcessIdentity>();
  const hosts = new Map<string, FakeHost>();
  const lineEnds = new Map<string, ScriptedLineEnd>(Object.entries(BUILT_IN_LINES));
  const shellActions = new Map<string, (workingDirectory: string) => void>();
  const linesRun: string[] = [];
  let lastProcessId = FIRST_FAKE_PROCESS_ID;
  const ownIdentity: ProcessIdentity = { processId: process.pid, startStamp: FAKE_START_STAMP, bootIdentity: FAKE_BOOT };

  function bornProcess(): ProcessIdentity {
    lastProcessId += 1;
    const identity = { processId: lastProcessId, startStamp: FAKE_START_STAMP, bootIdentity: FAKE_BOOT };
    liveProcesses.set(lastProcessId, identity);
    return identity;
  }

  function endHost(host: FakeHost, exitCode: number | null, signalCode: string | null): void {
    host.ended = true;
    liveProcesses.delete(host.child.processId);
    host.eventLog.syncAndClose();
    const end = nativePorts.processSupervision.endOf({ exitCode, signalCode });
    writeFileAtomically(host.files.watcherRecordPath, watcherRecordTextOf({ ...host.runRecord, state: 'ended', end }));
  }

  function exitWatcher(host: FakeHost): void {
    liveProcesses.delete(host.watcher.processId);
    hosts.delete(host.launch.socketPath);
  }

  function playScenario(host: FakeHost): void {
    const { workingDirectory } = host.launch;
    while (!host.ended) {
      const step = host.steps[host.nextStep];
      if (step === undefined) {
        endHost(host, 0, null);
        return;
      }
      if (step.kind === 'await-line') {
        if (host.linesWaiting === 0) {
          if (host.inputClosed) endHost(host, 0, null);
          return;
        }
        host.linesWaiting -= 1;
      } else if (step.kind === 'print') {
        host.eventLog.append('agent', lineWithHeadOf(step.line, workingDirectory));
      } else if (step.kind === 'shell') {
        const action = shellActions.get(step.command);
        if (action === undefined) throw new Error(`no action is scripted for the shell step ${step.command}`);
        action(workingDirectory);
      } else if (step.kind === 'exit') {
        endHost(host, step.code, null);
        return;
      } else {
        throw new Error('a crash has no step in the fake Watcher world: such a case runs on the real Watcher');
      }
      host.nextStep += 1;
    }
  }

  function runProcessLine(host: FakeHost): void {
    const line = host.launch.argv.at(-1) ?? '';
    linesRun.push(line);
    const lineEnd = lineEnds.get(line);
    if (lineEnd === undefined) throw new Error(`no end is scripted for the process line ${line}`);
    for (const outputLine of (lineEnd.output ?? '').split('\n').filter((text) => text !== '')) host.eventLog.append('agent', outputLine);
    endHost(host, lineEnd.signal === undefined ? lineEnd.exitCode ?? 0 : null, lineEnd.signal ?? null);
  }

  function spawnWatcher(_ports: PlatformPorts, request: WatcherSpawnRequest): number {
    const files = watcherFilesOf(request.jobFolder, request.instance);
    const watcher = bornProcess();
    const claimedRecord: WatcherRecord = {
      protocolVersion: WATCHER_PROTOCOL_VERSION, eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION, watcherInstance: request.instance, state: 'claimed', watcher,
    };
    if (createFileAtomically(files.watcherRecordPath, watcherRecordTextOf(claimedRecord)) === 'already-exists') {
      liveProcesses.delete(watcher.processId);
      return watcher.processId;
    }
    const reading = readWatcherLaunch(files.launchPath, nativePorts.localEndpoint);
    if (reading.verdict !== 'read') throw new Error(`the fake Watcher cannot read ${files.launchPath}`);
    const { launch } = reading;
    const child = bornProcess();
    const runRecord: WatcherRecord = {
      ...claimedRecord, watcherCodeVersion: launch.watcherCodeVersion, socketPath: launch.socketPath, state: 'running', childProcess: child, childProcessGroupId: child.processId,
    };
    writeFileAtomically(files.watcherRecordPath, watcherRecordTextOf(runRecord));
    const host: FakeHost = {
      files,
      launch,
      watcher,
      child,
      runRecord,
      eventLog:          createEventLogWriter(files.eventLogPath, fakeStampNow),
      steps:             scenarioOf(launch),
      nextStep:          0,
      linesWaiting:      0,
      inputClosed:       false,
      ended:             false,
      framesAfterTheEnd: 0,
    };
    hosts.set(launch.socketPath, host);
    if (launch.kind === 'agent') playScenario(host);
    else runProcessLine(host);
    return watcher.processId;
  }

  function actOnFrame(host: FakeHost, frame: ActingFrame): void {
    if (host.ended) {
      host.framesAfterTheEnd += 1;
      const acknowledgement: ActingFrame['kind'] = host.launch.kind === 'agent' ? 'close-input' : 'stop';
      if (frame.kind === acknowledgement || host.framesAfterTheEnd >= WATCHER_LINGER_FRAMES) exitWatcher(host);
      return;
    }
    host.eventLog.append('client', JSON.stringify(frame));
    if (frame.kind === 'write') host.linesWaiting += 1;
    else host.inputClosed = true;
    playScenario(host);
  }

  function historyLineOf(host: FakeHost, sinceSequence: number): string {
    const reading = eventLogEntriesOf(readFileSync(host.files.eventLogPath, 'utf8'));
    const entries = reading.verdict === 'read' ? reading.entries.filter((entry) => entry.sequence > sinceSequence) : [];
    return `${JSON.stringify({ kind: 'history', entries })}\n`;
  }

  function fakeSocketTo(endpoint: string): Socket {
    const socket = new EventEmitter() as EventEmitter & Record<'write' | 'end', (text?: string) => void> & { destroy: () => void };
    const host = hosts.get(endpoint);
    const takeLines = (text: string): void => {
      if (host === undefined) return;
      for (const line of text.split('\n').filter((frameLine) => frameLine !== '')) {
        const frame = JSON.parse(line) as ActingFrame | { kind: 'hello'; sinceSequence: number };
        if (frame.kind !== 'hello') actOnFrame(host, frame);
        else if (!host.ended || frame.sinceSequence !== Number.MAX_SAFE_INTEGER) socket.emit('data', Buffer.from(historyLineOf(host, frame.sinceSequence)));
      }
    };
    socket.write = (text = '') => {
      takeLines(text);
    };
    socket.end = (text = '') => {
      takeLines(text);
      queueMicrotask(() => socket.emit('close'));
    };
    socket.destroy = () => undefined;
    queueMicrotask(() => socket.emit(host === undefined ? 'error' : 'connect', new Error('no fake Watcher listens here')));
    return socket as unknown as Socket;
  }

  const processSupervision: ProcessSupervision = {
    ...nativePorts.processSupervision,
    identityOf:    (processId) => (processId === process.pid ? ownIdentity : liveProcesses.get(processId) ?? null),
    processIsGone: (processId) => processId !== process.pid && !liveProcesses.has(processId),
    treeMembersOf: () => [],
    stopTree:      () => ({ verdict: 'group-gone' }),
    stopProcess:   () => ({ verdict: 'gone' }),
  };
  const localEndpoint: LocalEndpoint = { ...nativePorts.localEndpoint, connectionTo: fakeSocketTo };

  return {
    ports:         { ...nativePorts, processSupervision, localEndpoint },
    processStarts: {
      spawnWatcher,
      runGatePipeline: (request) => {
        const lines = [...request.prepare, ...request.gates].map((step) => step.run);
        linesRun.push(...lines);
        const failing = lines.filter((line) => lineEnds.get(line)?.exitCode !== undefined);
        if (failing.length > 0) throw new Error(`a failing merge gate is a real-system case: ${failing.join(', ')}`);
        return Promise.resolve({ outcome: 'passed', gatesRun: request.gates.map((gate) => gate.name) });
      },
    },
    scriptLine:  (line, end) => { lineEnds.set(line, end); },
    scriptShell: (command, action) => { shellActions.set(command, action); },
    linesRun:    () => linesRun,
  };
}
