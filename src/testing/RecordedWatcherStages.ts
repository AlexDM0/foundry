/**
 * The Watcher of a default spec: `useRecordedWatcherStages` spawns no Watcher, and each stage of a job leaves what the real Watcher left in
 * that stage, which `src/services/overseer/WatcherFleet.stages.integration.spec.ts` records under `bun run record src/lib/watcher/Watcher.ts`:
 * the Watcher record, the origin of each event log line, the frames an attached client gets and whether the Watcher still runs. A stage with no
 * recorded answer fails the case. The Watcher's processes are in the recorded process table and its socket is the recorded local endpoint.
 * What the child does is not the Watcher's: a session plays its `FakeAgentAdapter` scenario, and a process line ends as `scriptLine` said.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, beforeEach } from 'bun:test';

import { createFileAtomically, writeFileAtomically }                       from '../lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                                      from '../lib/git/GitProcess.ts';
import type { PlatformPorts }                                              from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                            from '../lib/process-identity/ProcessIdentity.ts';
import type { ProcessTreeMember }                                          from '../lib/process-identity/ProcessSupervision.ts';
import type { ActingFrame, WatcherActivity, WatcherFrame }                 from '../lib/watcher/@types/WatcherFrame.ts';
import { type EventLogWriter, type EventOrigin }                           from '../lib/watcher/EventLog.ts';
import { createEventLogWriter, eventLogEntriesOf }                         from '../lib/watcher/EventLog.ts';
import { type WatcherFiles, watcherFilesOf }                               from '../lib/watcher/WatcherFiles.ts';
import { type WatcherLaunch, readWatcherLaunch, readWatcherSecret }        from '../lib/watcher/WatcherLaunch.ts';
import { type WatcherEnd, type WatcherRecord, watcherRecordTextOf }        from '../lib/watcher/WatcherRecord.ts';
import { type WatcherSocketServer, listenOnWatcherSocket }                 from '../lib/watcher/WatcherSocketServer.ts';
import { WATCHER_LINGER_FRAMES }                                           from '../lib/watcher/constants/WatcherProtocol.ts';
import type { ProcessStarts }                                              from '../services/overseer/ProcessStarts.ts';
import type { WatcherSpawnRequest }                                        from '../services/overseer/WatcherFleet.ts';
import type { BoundaryRecording }                                          from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf }                                from './BoundaryRecordings.ts';
import { FAKE_HEAD_PLACEHOLDER, type FakeAgentStep }                       from './FakeAgentAdapter.ts';
import { type RecordedLocalEndpoint, createRecordedLocalEndpoint }         from './RecordedLocalEndpoint.ts';
import { type ControlledRecordedProcessTable, createRecordedProcessTable } from './RecordedProcessTable.ts';
import { recordedLineOf }                                                  from './fake-agent/RecordedClaudeLines.ts';

const WATCHER_BOUNDARY = 'src/lib/watcher/Watcher.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const SCENARIO_ARGUMENT_INDEX = 2;
const BUILT_IN_LINES: Readonly<Record<string, ScriptedLineEnd>> = { true: {}, false: { exitCode: 1 } };
const AGENT_FRAMES: readonly ActingFrame['kind'][] = ['write', 'close-input', 'stop'];
const PROCESS_FRAMES: readonly ActingFrame['kind'][] = ['stop'];

/** The stages the boundary spec walks a real Watcher through, each recorded once. */
export const WATCHER_STAGES = {
  LAUNCH_AND_CLAIM:     'launch and claim',
  SESSION_LINE:         'a session line',
  SESSION_INPUT_CLOSED: 'a session whose input closed',
  SESSION_ACKNOWLEDGED: 'an ended session acknowledged',
  PROCESS_LINE_GREEN:   'a process line that ends green',
  PROCESS_LINE_RED:     'a process line that ends red',
  STOP_BY_THE_OVERSEER: 'a stop by the Overseer',
  PROCESS_ACKNOWLEDGED: 'an ended process line acknowledged',
  WATCHER_CRASH:        'a Watcher crash',
  AGENT_CRASH:          'an agent crash',
} as const;

export type WatcherStage = typeof WATCHER_STAGES[keyof typeof WATCHER_STAGES];

/** The places a recorded stage holds for what differs from run to run, which a replay fills with the values of its own job. */
export const WATCHER_STAGE_PLACEHOLDERS = {
  WATCHER:          '<watcher>',
  CHILD:            '<child>',
  CHILD_PROCESS_ID: '<child process id>',
  SOCKET:           '<socket>',
  CODE_VERSION:     '<code version>',
  EXIT_CODE:        '<exit code>',
  FRAME:            '<frame>',
  CHILD_LINE:       '<child line>',
} as const;

/** What a real Watcher left at the end of one stage. */
export interface WatcherStageAnswer {
  /** The Watcher record, its run-to-run values as placeholders. */
  readonly record:                 unknown;
  /** Each event log line the stage added, a frame sent and a line of the child as placeholders. */
  readonly entries:                readonly { readonly origin: EventOrigin; readonly line: string }[];
  /** Each frame an attached client got in the stage, the lines of its messages as placeholders. */
  readonly frames:                 readonly unknown[];
  /** What a `welcome` says at the stage's end. */
  readonly activity:               WatcherActivity;
  readonly watcherRuns:            boolean;
  readonly childRuns:              boolean;
  /** For a stage that stops the child: what `treeMembersOf` answers for the ended child, given the tree members read before the stop. */
  readonly childTreeAfterTheStop?: readonly ProcessTreeMember[] | null;
}

export function watcherStageCallShapeOf(stage: WatcherStage): string {
  return `watcher stage "${stage}"`;
}

interface RecordedValues {
  readonly watcher:         ProcessIdentity | null;
  readonly child?:          ProcessIdentity | null;
  readonly childProcessId?: number;
  readonly socketPath?:     string;
  readonly codeVersion?:    string;
  readonly exitCode?:       number;
  readonly frameLines?:     readonly string[];
  readonly childLines?:     readonly string[];
}

function sameJson(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function replacedDeeply(value: unknown, replace: (leaf: unknown) => unknown): unknown {
  const replaced = replace(value);
  if (replaced !== value) return replaced;
  if (Array.isArray(value)) return value.map((element) => replacedDeeply(element, replace));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, element]) => [key, replacedDeeply(element, replace)]));
  return value;
}

/** What the boundary spec records: every value of `values` in the answer as its placeholder. */
export function asRecordedWatcherStage(answer: unknown, values: RecordedValues): unknown {
  const {
    WATCHER, CHILD, CHILD_PROCESS_ID, SOCKET, CODE_VERSION, EXIT_CODE, FRAME, CHILD_LINE
  } = WATCHER_STAGE_PLACEHOLDERS;
  return replacedDeeply(answer, (leaf) => {
    if (leaf !== null && typeof leaf === 'object') {
      if (values.watcher !== null && sameJson(leaf, values.watcher)) return WATCHER;
      if (values.child !== undefined && values.child !== null && sameJson(leaf, values.child)) return CHILD;
      const end = leaf as Partial<WatcherEnd>;
      if (end.reason === 'exited' && end.exitCode === values.exitCode) return { ...end, exitCode: EXIT_CODE };
      return leaf;
    }
    if (leaf === values.childProcessId) return CHILD_PROCESS_ID;
    if (leaf === values.socketPath) return SOCKET;
    if (leaf === values.codeVersion) return CODE_VERSION;
    if (typeof leaf === 'string' && values.frameLines?.includes(leaf) === true) return FRAME;
    if (typeof leaf === 'string' && values.childLines?.includes(leaf) === true) return CHILD_LINE;
    return leaf;
  });
}

function asReplayedWatcherStage(answer: unknown, values: RecordedValues): unknown {
  const replacements = new Map<unknown, unknown>([
    [WATCHER_STAGE_PLACEHOLDERS.WATCHER, values.watcher],
    [WATCHER_STAGE_PLACEHOLDERS.CHILD, values.child],
    [WATCHER_STAGE_PLACEHOLDERS.CHILD_PROCESS_ID, values.childProcessId],
    [WATCHER_STAGE_PLACEHOLDERS.SOCKET, values.socketPath],
    [WATCHER_STAGE_PLACEHOLDERS.CODE_VERSION, values.codeVersion],
    [WATCHER_STAGE_PLACEHOLDERS.EXIT_CODE, values.exitCode],
  ]);
  return replacedDeeply(answer, (leaf) => (typeof leaf === 'string' && replacements.has(leaf) ? replacements.get(leaf) : leaf));
}

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(WATCHER_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) throw new Error(`no Watcher stages are recorded for ${process.platform}: run \`${recordCommandOf(WATCHER_BOUNDARY)}\`.`);
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

/** How a scripted process line ends: `exitCode` 0 and no output unless said; `runsUntilStopped` keeps it live until a `stop` frame ends it. */
export interface ScriptedLineEnd {
  readonly exitCode?:         number;
  readonly output?:           string;
  readonly runsUntilStopped?: boolean;
}

export interface RecordedWatcherStages {
  /** The native ports with the recorded process table and the recorded local endpoint in the place of the real ones. */
  readonly ports:         PlatformPorts;
  readonly processStarts: ProcessStarts;
  readonly scriptLine:    (line: string, end: ScriptedLineEnd) => void;
  /** What a session's `shell` step with this very command does, in the session's working directory. */
  readonly scriptShell:   (command: string, action: (workingDirectory: string) => void) => void;
  /** Every process line a Watcher or a merge gate ran, in order. */
  readonly linesRun:      () => readonly string[];
  /** The Watcher of the instance dies with no word, as a kill or a reboot ends it. */
  readonly crashWatcher:  (jobFolder: string, instance: number) => void;
  /** The Watcher of the instance and its child are gone with the machine, and nothing writes the record; the spec writes the record of another boot. */
  readonly rebootMachine: (jobFolder: string, instance: number) => void;
}

interface MockedWatcher {
  readonly files:    WatcherFiles;
  readonly launch:   WatcherLaunch;
  readonly watcher:  ProcessIdentity;
  readonly child:    ProcessIdentity;
  readonly eventLog: EventLogWriter;
  readonly steps:    readonly FakeAgentStep[];
  server:            WatcherSocketServer | null;
  activity:          WatcherActivity;
  endAnswer:         WatcherStageAnswer | null;
  nextStep:          number;
  linesWaiting:      number;
  inputClosed:       boolean;
  ended:             boolean;
  exited:            boolean;
  lingerFrames:      number;
}

export interface ControlledRecordedWatcherStages {
  readonly stages:              RecordedWatcherStages;
  /** Each call that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
  readonly forget:              () => void;
}

/** Call at a spec file's top level: each case starts with no Watcher, and a stage with no recorded answer fails the case. */
export function useRecordedWatcherStages(nativePorts: PlatformPorts): RecordedWatcherStages {
  const controlled = createRecordedWatcherStages(nativePorts);
  beforeEach(controlled.forget);
  afterEach(() => {
    // Production code may catch the throw of an unanswered stage, so the case fails here too.
    const unanswered = controlled.takeUnansweredCalls();
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return controlled.stages;
}

function scenarioOf(launch: WatcherLaunch): readonly FakeAgentStep[] {
  if (launch.kind !== 'agent') return [];
  return JSON.parse(readFileSync(launch.argv[SCENARIO_ARGUMENT_INDEX] ?? '', 'utf8')) as FakeAgentStep[];
}

function lineWithHeadOf(line: string, workingDirectory: string): string {
  return line.includes(FAKE_HEAD_PLACEHOLDER) ? line.replaceAll(FAKE_HEAD_PLACEHOLDER, GitProcess.resolvedCommitOf(workingDirectory, 'HEAD') ?? '') : line;
}

/** `answers` are this OS's recording unless a spec of the mock itself gives others. */
export function createRecordedWatcherStages(nativePorts: PlatformPorts, answers?: ReadonlyMap<string, unknown>): ControlledRecordedWatcherStages {
  const processTable: ControlledRecordedProcessTable = createRecordedProcessTable(nativePorts);
  const localEndpoint: RecordedLocalEndpoint = createRecordedLocalEndpoint();
  let watchers = new Map<string, MockedWatcher>();
  let lineEnds = new Map<string, ScriptedLineEnd>(Object.entries(BUILT_IN_LINES));
  let shellActions = new Map<string, (workingDirectory: string) => void>();
  let linesRun: string[] = [];
  const unansweredCalls: string[] = [];
  const { table } = processTable;

  const stageAnswerOf = (stage: WatcherStage): WatcherStageAnswer => {
    const callShape = watcherStageCallShapeOf(stage);
    const answer = (answers ?? recordedAnswersOfThisOs()).get(callShape);
    if (answer === undefined) {
      const unanswered = `${callShape} has no recorded answer: run \`${recordCommandOf(WATCHER_BOUNDARY)}\``;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    return answer as WatcherStageAnswer;
  };
  const originOf = (stage: WatcherStage, placeholder: string): EventOrigin => {
    const entry = stageAnswerOf(stage).entries.find((recorded) => recorded.line === placeholder);
    if (entry === undefined) throw new Error(`the recorded stage "${stage}" logs no ${placeholder}`);
    return entry.origin;
  };
  const valuesOf = (host: MockedWatcher, exitCode?: number): RecordedValues => ({
    watcher:        host.watcher,
    child:          host.child,
    childProcessId: host.child.processId,
    socketPath:     host.launch.socketPath,
    codeVersion:    host.launch.watcherCodeVersion,
    ...(exitCode === undefined ? {} : { exitCode }),
  });

  function log(host: MockedWatcher, origin: EventOrigin, line: string): void {
    const entry = host.eventLog.append(origin, line);
    host.server?.broadcast({ kind: 'message', entry });
  }

  function exitWatcher(host: MockedWatcher): void {
    if (host.exited) return;
    host.exited = true;
    table.endProcess(host.watcher);
    host.server?.close();
  }

  /**
   * The record, the frames, the activity and the processes as the recorded stage left them. An ended Watcher never writes its record again,
   * so a stage after the end, as an acknowledgement, keeps the end of the stage that ended it.
   */
  function enterStage(host: MockedWatcher, stage: WatcherStage, exitCode?: number): void {
    const answer = asReplayedWatcherStage(stageAnswerOf(stage), valuesOf(host, exitCode)) as WatcherStageAnswer;
    if (host.ended) {
      if (!answer.watcherRuns) exitWatcher(host);
      return;
    }
    const record = answer.record as WatcherRecord;
    if (record.end !== undefined) {
      host.ended = true;
      host.endAnswer = answer;
      host.eventLog.syncAndClose();
    }
    writeFileAtomically(host.files.watcherRecordPath, watcherRecordTextOf(record));
    host.activity = answer.activity;
    for (const frame of answer.frames as WatcherFrame[]) {
      if (frame.kind === 'state') host.server?.broadcast(frame);
    }
    if (!answer.childRuns) table.endProcess(host.child);
    if (!answer.watcherRuns) exitWatcher(host);
  }

  function playScenario(host: MockedWatcher): void {
    const { workingDirectory } = host.launch;
    while (!host.ended) {
      const step = host.steps[host.nextStep];
      if (step === undefined || (step.kind === 'await-line' && host.linesWaiting === 0 && host.inputClosed)) {
        enterStage(host, WATCHER_STAGES.SESSION_INPUT_CLOSED, 0);
        return;
      }
      if (step.kind === 'await-line') {
        if (host.linesWaiting === 0) return;
        host.linesWaiting -= 1;
      } else if (step.kind === 'print') {
        log(host, originOf(WATCHER_STAGES.SESSION_LINE, WATCHER_STAGE_PLACEHOLDERS.CHILD_LINE), lineWithHeadOf(recordedLineOf(step.line), workingDirectory));
      } else if (step.kind === 'shell') {
        const action = shellActions.get(step.command);
        if (action === undefined) throw new Error(`no action is scripted for the shell step ${step.command}`);
        action(workingDirectory);
      } else if (step.kind === 'exit') {
        enterStage(host, WATCHER_STAGES.SESSION_INPUT_CLOSED, step.code);
        return;
      } else {
        enterStage(host, WATCHER_STAGES.AGENT_CRASH);
        return;
      }
      host.nextStep += 1;
    }
  }

  function runProcessLine(host: MockedWatcher): void {
    const line = host.launch.argv.at(-1) ?? '';
    linesRun.push(line);
    const lineEnd = lineEnds.get(line);
    if (lineEnd === undefined) throw new Error(`no end is scripted for the process line ${line}`);
    const exitCode = lineEnd.exitCode ?? 0;
    const stage = exitCode === 0 ? WATCHER_STAGES.PROCESS_LINE_GREEN : WATCHER_STAGES.PROCESS_LINE_RED;
    const origin = originOf(stage, WATCHER_STAGE_PLACEHOLDERS.CHILD_LINE);
    for (const outputLine of (lineEnd.output ?? '').split('\n').filter((text) => text !== '')) log(host, origin, outputLine);
    if (lineEnd.runsUntilStopped !== true) enterStage(host, stage, exitCode);
  }

  /** An ended Watcher takes only its acknowledgement, or lingers out its frames; a live one logs and acts on the frame. */
  function actOnFrame(host: MockedWatcher, frame: ActingFrame): void {
    const isAgent = host.launch.kind === 'agent';
    if (host.ended) {
      if (frame.kind === (isAgent ? 'close-input' : 'stop')) enterStage(host, isAgent ? WATCHER_STAGES.SESSION_ACKNOWLEDGED : WATCHER_STAGES.PROCESS_ACKNOWLEDGED);
      return;
    }
    const frameStage = isAgent ? WATCHER_STAGES.SESSION_LINE : WATCHER_STAGES.STOP_BY_THE_OVERSEER;
    log(host, originOf(frameStage, WATCHER_STAGE_PLACEHOLDERS.FRAME), JSON.stringify(frame));
    if (frame.kind === 'stop' && !isAgent) {
      enterStage(host, WATCHER_STAGES.STOP_BY_THE_OVERSEER);
      return;
    }
    // A session's stop closes its input first, which ends a scenario waiting for a line before any signal is sent.
    if (frame.kind === 'write') host.linesWaiting += 1;
    else host.inputClosed = true;
    playScenario(host);
  }

  function countLingerFrame(host: MockedWatcher): void {
    if (!host.ended) return;
    host.lingerFrames += 1;
    if (host.lingerFrames >= WATCHER_LINGER_FRAMES) exitWatcher(host);
  }

  function listen(host: MockedWatcher, watcherSecret: string): void {
    const listening = listenOnWatcherSocket({
      endpoint:       localEndpoint.endpoint,
      socketPath:     host.launch.socketPath,
      watcherSecret,
      acceptedKinds:  host.launch.kind === 'agent' ? AGENT_FRAMES : PROCESS_FRAMES,
      welcomeOf:      () => ({ watcherCodeVersion: host.launch.watcherCodeVersion, jobId: host.launch.jobId, state: host.activity }),
      durableEntries: () => {
        const reading = eventLogEntriesOf(readFileSync(host.files.eventLogPath, 'utf8'));
        return reading.verdict === 'read' ? reading.entries : [];
      },
      onClientLine:  () => countLingerFrame(host),
      onActingFrame: (frame) => actOnFrame(host, frame),
    });
    void listening.then((outcome) => {
      if (outcome.verdict === 'unbindable') throw new Error(`the mocked Watcher cannot listen: ${outcome.reason}`);
      if (host.exited) outcome.server.close();
      else host.server = outcome.server;
    });
  }

  /** The Watcher of the instance, its listener gone with no word to a client. */
  function killedWatcherOf(jobFolder: string, instance: number): MockedWatcher {
    const host = watchers.get(watcherFilesOf(jobFolder, instance).watcherRecordPath);
    if (host === undefined) throw new Error(`no mocked Watcher runs instance ${instance} of ${jobFolder}`);
    host.server = null;
    localEndpoint.killListener(host.launch.socketPath);
    return host;
  }

  function spawnWatcher(_ports: PlatformPorts, request: WatcherSpawnRequest): number {
    const files = watcherFilesOf(request.jobFolder, request.instance);
    const watcher = table.bornProcess();
    const reading = readWatcherLaunch(files.launchPath, localEndpoint.endpoint);
    const watcherSecret = reading.verdict === 'read' ? readWatcherSecret(reading.launch.secretFilePath) : null;
    if (reading.verdict !== 'read' || watcherSecret === null) throw new Error(`the mocked Watcher cannot read ${files.launchPath}`);
    const { launch } = reading;
    const child = table.bornProcess();
    const values: RecordedValues = {
      watcher, child, childProcessId: child.processId, socketPath: launch.socketPath, codeVersion: launch.watcherCodeVersion,
    };
    const launchAnswer = asReplayedWatcherStage(stageAnswerOf(WATCHER_STAGES.LAUNCH_AND_CLAIM), values) as WatcherStageAnswer;
    if (createFileAtomically(files.watcherRecordPath, watcherRecordTextOf(launchAnswer.record as WatcherRecord)) === 'already-exists') {
      // A second Watcher of a claimed instance exits at once and starts no child.
      table.endProcess(watcher);
      table.endProcess(child);
      return watcher.processId;
    }
    const host: MockedWatcher = {
      files,
      launch,
      watcher,
      child,
      eventLog:     createEventLogWriter(files.eventLogPath, () => '2026-09-18T22:11:03+02:00'),
      steps:        scenarioOf(launch),
      server:       null,
      activity:     launchAnswer.activity,
      endAnswer:    null,
      nextStep:     0,
      linesWaiting: 0,
      inputClosed:  false,
      ended:        false,
      exited:       false,
      lingerFrames: 0,
    };
    watchers.set(files.watcherRecordPath, host);
    listen(host, watcherSecret);
    if (launch.kind === 'agent') playScenario(host);
    else runProcessLine(host);
    return watcher.processId;
  }

  const stages: RecordedWatcherStages = {
    ports: {
      ...table.ports,
      processSupervision: {
        ...table.ports.processSupervision,
        identityOf: (processId) => {
          if (processId === process.pid) table.callerProcess();
          return table.ports.processSupervision.identityOf(processId);
        },
        processIsGone: (processId) => {
          if (processId === process.pid) table.callerProcess();
          return table.ports.processSupervision.processIsGone(processId);
        },
        treeMembersOf: (leader, earlierMembers) => {
          const endedHost = [...watchers.values()].find((host) => host.endAnswer !== null && host.child.processId === leader.processId);
          if (endedHost === undefined || earlierMembers === undefined) return table.ports.processSupervision.treeMembersOf(leader, earlierMembers);
          const treeAfterTheStop = endedHost.endAnswer?.childTreeAfterTheStop;
          if (treeAfterTheStop === undefined) {
            const unanswered = `treeMembersOf of the ended child of ${endedHost.launch.jobId} has no recorded answer: run \`${recordCommandOf(WATCHER_BOUNDARY)}\``;
            unansweredCalls.push(unanswered);
            throw new Error(unanswered);
          }
          return treeAfterTheStop;
        },
      },
      localEndpoint: localEndpoint.endpoint,
    },
    processStarts: {
      spawnWatcher,
      runGatePipeline: (request) => {
        const lines = [...request.prepare, ...request.gates].map((step) => step.run);
        linesRun.push(...lines);
        const failing = lines.filter((line) => (lineEnds.get(line)?.exitCode ?? 0) !== 0);
        if (failing.length > 0) throw new Error(`a failing merge gate is a real-system case: ${failing.join(', ')}`);
        return Promise.resolve({ outcome: 'passed', gatesRun: request.gates.map((gate) => gate.name) });
      },
    },
    scriptLine:   (line, end) => { lineEnds.set(line, end); },
    scriptShell:  (command, action) => { shellActions.set(command, action); },
    linesRun:     () => linesRun,
    crashWatcher: (jobFolder, instance) => {
      const host = killedWatcherOf(jobFolder, instance);
      enterStage(host, WATCHER_STAGES.WATCHER_CRASH);
    },
    rebootMachine: (jobFolder, instance) => {
      const host = killedWatcherOf(jobFolder, instance);
      table.endProcess(host.child);
      exitWatcher(host);
    },
  };

  return {
    stages,
    takeUnansweredCalls: () => [...unansweredCalls.splice(0), ...processTable.takeUnansweredCalls(), ...localEndpoint.takeUnansweredCalls()],
    forget:              () => {
      processTable.forgetProcesses();
      watchers = new Map();
      lineEnds = new Map(Object.entries(BUILT_IN_LINES));
      shellActions = new Map();
      linesRun = [];
    },
  };
}
