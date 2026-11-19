/**
 * `BoardChildren` over Talos, on planted records and a Talos socket over the recorded endpoint. What matters: each liveness verdict, and
 * above all that a record left `running` by a Talos whose process is gone reads lost, never live; Talos's identity is read once per start
 * number and pass, not once per child; a frame counts as taken only when Talos answered it, so an input's marker is written only after
 * `done` and a refusal leaves it for a later pass; a launch writes the plan's files before its frame and names its folder as Talos takes it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentLaunchPlan }                           from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { PlatformPorts }                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import type { DoneFrame, ReceivedClientFrame }            from '../../lib/talos/@types/TalosFrame.ts';
import type { ChildEnd }                                  from '../../lib/talos/ChildRecord.ts';
import { listenOnTalosSocket }                            from '../../lib/talos/TalosSocketServer.ts';
import { TALOS_PROTOCOL_VERSION }                         from '../../lib/talos/constants/TalosProtocol.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                   from '../../testing/PlantedChild.ts';
import { useRecordedLocalEndpoint }                       from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                               from '../../testing/ToolGuard.ts';
import type { BoardChildren }                             from './BoardChildren.ts';
import { createTalosChildren }                            from './TalosChildren.ts';
import { connectToTalos }                                 from './TalosConnection.ts';

const EXAMPLE_SECRET = 'example-secret';
const THIS_BOOT = 'example-boot';
const LIVE_TALOS: ProcessIdentity = { processId: 4242, startStamp: '1', bootIdentity: THIS_BOOT };
const GONE_TALOS: ProcessIdentity = { processId: 4250, startStamp: '1', bootIdentity: THIS_BOOT };
/** Long enough that no case waits it out: a case that needs an answer gets one at once. */
const ANSWERING_FRAME_TIMEOUT_MILLISECONDS = 60_000;
const SILENT_FRAME_TIMEOUT_MILLISECONDS = 20;
const WELCOME = {
  kind: 'welcome', protocolVersion: TALOS_PROTOCOL_VERSION, codeVersion: 'code-example', startNumber: 1, talos: null, leaseStanding: 'unheld',
} as const;
const EXITED: ChildEnd = {
  reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 1200
};

let boardFolder = '';
let monitorFolder = '';
let lastEndpointInstance = 0;
const closers: (() => void)[] = [];
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  boardFolder = createScratchDirectory('talos-children');
  monitorFolder = createScratchDirectory('talos-children-monitor');
});

afterEach(() => {
  for (const close of closers.splice(0)) close();
  removeScratchDirectory(boardFolder);
  removeScratchDirectory(monitorFolder);
});

interface IdentityReads {
  count: number;
}

/** Only `LIVE_TALOS` runs; every identity read is counted. */
function portsWhereOnlyTheLiveTalosRuns(identityReads: IdentityReads): PlatformPorts {
  const native = nativePlatformPorts();
  return {
    ...native,
    processSupervision: {
      ...native.processSupervision,
      identityOf: (processId) => {
        identityReads.count += 1;
        return processId === LIVE_TALOS.processId ? LIVE_TALOS : null;
      },
      sameProcess: (first, second) => first.processId === second.processId && first.startStamp === second.startStamp,
    },
  };
}

function childrenReading(identityReads: IdentityReads = { count: 0 }): BoardChildren {
  return createTalosChildren({ boardFolder, platformPorts: portsWhereOnlyTheLiveTalosRuns(identityReads), connection: () => null });
}

function child(childFolder: string, instance = 1): { boardFolder: string; childFolder: string; instance: number } {
  return { boardFolder, childFolder, instance };
}

function absoluteFolderOf(childFolder: string): string {
  return join(boardFolder, ...childFolder.split('/'));
}

describe('liveness', () => {
  beforeEach(() => {
    PlantedChild.plantTalosRecord(boardFolder, 1, { talos: LIVE_TALOS });
    PlantedChild.plantTalosRecord(boardFolder, 2, { talos: GONE_TALOS });
  });

  test('a child with no record is not launched', () => {
    expect(childrenReading().livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'unlaunched' });
  });

  test('an ended record reads ended with its end, whether its Talos runs or not', () => {
    PlantedChild.plantChildRecord(child('jobs/J-1'), { state: 'ended', end: EXITED, talosStartNumber: 2 });

    expect(childrenReading().livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'ended', end: EXITED });
  });

  test('a running or starting record of a running Talos reads live in its state', () => {
    PlantedChild.plantChildRecord(child('jobs/J-1'), { state: 'running' });
    PlantedChild.plantChildRecord(child('jobs/J-2'), { state: 'starting' });
    const children = childrenReading();

    expect(children.livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'live', state: 'running' });
    expect(children.livenessOf('jobs/J-2', 1)).toEqual({ verdict: 'live', state: 'starting' });
  });

  test('a record left running by a Talos whose process is gone reads lost', () => {
    PlantedChild.plantChildRecord(child('jobs/J-1'), { state: 'running', talosStartNumber: 2 });

    expect(childrenReading().livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'lost' });
  });

  test('a record naming a Talos that has no record reads lost', () => {
    PlantedChild.plantChildRecord(child('jobs/J-1'), { state: 'stopping', talosStartNumber: 7 });

    expect(childrenReading().livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'lost' });
  });

  test('a record of another format, an unreadable one and an ended one with no end read lost', () => {
    PlantedChild.plantChildRecordText(child('jobs/J-1'), `${JSON.stringify({ formatVersion: 2, state: 'running' })}\n`);
    PlantedChild.plantChildRecordText(child('jobs/J-2'), '{ cut short');
    PlantedChild.plantChildRecord(child('jobs/J-3'), { state: 'ended', end: null });
    const children = childrenReading();

    expect(children.livenessOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual({ verdict: 'lost' });
    expect(children.livenessOf(absoluteFolderOf('jobs/J-2'), 1)).toEqual({ verdict: 'lost' });
    expect(children.livenessOf(absoluteFolderOf('jobs/J-3'), 1)).toEqual({ verdict: 'lost' });
  });

  test('a pass reads each Talos\'s identity once for many children, and the next pass reads it again', () => {
    for (const jobId of ['J-1', 'J-2', 'J-3']) PlantedChild.plantChildRecord(child(`jobs/${jobId}`));
    PlantedChild.plantChildRecord(child('jobs/J-4'), { talosStartNumber: 2 });
    const identityReads = { count: 0 };
    const children = childrenReading(identityReads);

    children.beginPass();
    const firstPass = ['J-1', 'J-2', 'J-3', 'J-4', 'J-1'].map((jobId) => children.livenessOf(children.jobFolderOf(jobId), 1).verdict);
    const readsInTheFirstPass = identityReads.count;
    children.beginPass();
    children.livenessOf(children.jobFolderOf('J-1'), 1);

    expect(firstPass).toEqual(['live', 'live', 'live', 'lost', 'live']);
    expect(readsInTheFirstPass).toBe(2);
    expect(identityReads.count).toBe(3);
  });
});

describe('readings', () => {
  test('the events past a sequence are read from the log, a missing log reads empty and a malformed one malformed', () => {
    const entries = [1, 2, 3].map((sequence) => ({ sequence, origin: 'agent' as const, line: `line ${sequence}` }));
    PlantedChild.plantEventLog(child('jobs/J-1'), entries);
    PlantedChild.plantEventLog(child('jobs/J-2'), `${JSON.stringify({ sequence: 1, origin: 'retired-origin', line: 'an older origin' })}\n`);
    const children = childrenReading();

    expect(children.eventsAfter(absoluteFolderOf('jobs/J-1'), 1, 1)).toEqual(entries.slice(1));
    expect(children.eventsAfter(absoluteFolderOf('jobs/J-2'), 1, 0)).toBe('malformed');
    expect(children.eventsAfter(absoluteFolderOf('jobs/J-3'), 1, 0)).toEqual([]);
  });

  test('the recognised endings and the record are the record\'s own', () => {
    const recognisedEndings = [{ name: 'network-outage', closingLineSequence: 9, countedLines: 2 }];
    const planted = PlantedChild.plantChildRecord(child('jobs/J-1'), { recognisedEndings });
    const children = childrenReading();

    expect(children.recognisedEndingsOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual(recognisedEndings);
    expect(children.recognisedEndingsOf(absoluteFolderOf('jobs/J-2'), 1)).toEqual([]);
    expect(children.recordOf(absoluteFolderOf('jobs/J-1'), 1)).toEqual(planted);
    expect(children.recordOf(absoluteFolderOf('jobs/J-2'), 1)).toBeNull();
  });

  test('the newest instance is the highest child record number, and a folder with none has none', () => {
    PlantedChild.plantChildRecord(child('jobs/J-1', 1));
    PlantedChild.plantChildRecord(child('jobs/J-1', 3));
    PlantedChild.plantEventLog(child('jobs/J-1', 7), '');
    PlantedChild.plantChildRecord(child('jobs/J-1/install', 9));
    const children = childrenReading();

    expect(children.newestInstanceIn(absoluteFolderOf('jobs/J-1'))).toBe(3);
    expect(children.newestInstanceIn(absoluteFolderOf('jobs/J-2'))).toBeNull();
  });
});

interface ServedTalos {
  readonly framesSeen: ReceivedClientFrame[];
  readonly children:   BoardChildren;
}

/** A Talos socket answering each frame through `answerOf`, and the children over a welcomed connection to it. */
async function childrenOverServedTalos(
  answerOf: (frame: ReceivedClientFrame) => Promise<DoneFrame>,
  frameTimeoutMilliseconds = ANSWERING_FRAME_TIMEOUT_MILLISECONDS,
): Promise<ServedTalos> {
  lastEndpointInstance += 1;
  const endpoint = recordedEndpoint.endpoint.endpointOf({
    monitorFolder, trackerId: 'tracker-example', name: 'talos', instance: lastEndpointInstance
  });
  const framesSeen: ReceivedClientFrame[] = [];
  const listening = await listenOnTalosSocket({
    serverOf:          recordedEndpoint.endpoint.serverOf,
    endpoint,
    secret:            EXAMPLE_SECRET,
    isQuitting:        () => false,
    welcomeOf:         () => WELCOME,
    onVersionMismatch: () => undefined,
    onClientFrame:     (frame) => {
      framesSeen.push(frame);
      return answerOf(frame);
    },
  });
  if (listening.verdict !== 'listening') throw new Error(`the Talos endpoint cannot listen: ${listening.reason}`);
  closers.push(listening.server.close);
  const outcome = await connectToTalos({
    endpoint, secret: EXAMPLE_SECRET, localEndpoint: recordedEndpoint.endpoint, frameTimeoutMilliseconds
  });
  if (outcome.verdict !== 'welcomed') throw new Error(`Talos did not welcome the connection: ${outcome.verdict}`);
  const { connection } = outcome;
  closers.unshift(connection.close);
  PlantedChild.plantTalosRecord(boardFolder, 1, { talos: LIVE_TALOS });
  const children = createTalosChildren({ boardFolder, platformPorts: portsWhereOnlyTheLiveTalosRuns({ count: 0 }), connection: () => connection });
  return { framesSeen, children };
}

function answered(verdict: 'done' | 'already-done'): (frame: ReceivedClientFrame) => Promise<DoneFrame> {
  return (frame) => Promise.resolve({ kind: 'done', frameId: frame.frameId, verdict });
}

function refusedWith(reason: 'unknown-child' | 'child-ended' | 'folder-outside-board'): (frame: ReceivedClientFrame) => Promise<DoneFrame> {
  return (frame) => Promise.resolve({
    kind: 'done', frameId: frame.frameId, verdict: 'refused', reason
  });
}

function planWritingFile(path: string): AgentLaunchPlan {
  return {
    argv:                 ['example-agent', '--example-flag'],
    environment:          { EXAMPLE_VARIABLE: 'example value' },
    environmentFromTalos: { EXAMPLE_KEY: 'EXAMPLE_KEY_OF_TALOS' },
    files:                [{ path, text: 'example settings\n' }],
    standingReplies:      [],
    closingLine:          { allOf: [{ test: 'equals', path: 'type', value: 'result' }], anyOf: [], noneOf: [] },
    endingPatterns:       [],
    quitAtTurnEnd:        { act: 'close-input' },
  };
}

describe('acts', () => {
  testWhenRecorded(['local-endpoint-recording'], 'an agent launch writes the plan\'s files before its frame, and names its folder relative to the board', async () => {
    const planFilePath = join(boardFolder, 'jobs', 'J-1', 'settings', 'example.json');
    const fileExistedAtTheFrame: boolean[] = [];
    const served = await childrenOverServedTalos((frame) => {
      fileExistedAtTheFrame.push(existsSync(planFilePath));
      return answered('done')(frame);
    });

    const outcome = await served.children.launchAgent({
      childFolder:                    absoluteFolderOf('jobs/J-1'),
      instance:                       2,
      label:                          'J-1',
      workingDirectory:               boardFolder,
      plan:                           planWritingFile(planFilePath),
      treeStopAtEndGraceMilliseconds: 500,
    });

    expect(outcome).toEqual({ verdict: 'launched' });
    expect(fileExistedAtTheFrame).toEqual([true]);
    expect(readFileSync(planFilePath, 'utf8')).toBe('example settings\n');
    const [frame] = served.framesSeen;
    expect(frame?.kind === 'launch' ? frame.launch : null).toEqual({
      childFolder:                    'jobs/J-1',
      instance:                       2,
      kind:                           'agent',
      label:                          'J-1',
      argv:                           ['example-agent', '--example-flag'],
      environment:                    { EXAMPLE_VARIABLE: 'example value' },
      environmentFromTalos:           { EXAMPLE_KEY: 'EXAMPLE_KEY_OF_TALOS' },
      workingDirectory:               boardFolder,
      verbatimArguments:              false,
      standingReplies:                [],
      closingLine:                    { allOf: [{ test: 'equals', path: 'type', value: 'result' }], anyOf: [], noneOf: [] },
      endingPatterns:                 [],
      quitAtTurnEnd:                  { act: 'close-input' },
      treeStopAtEndGraceMilliseconds: 500,
      timeBoundMilliseconds:          null,
    });
  });

  testWhenRecorded(['local-endpoint-recording'], 'a line launch carries its bound, and each answer maps to its outcome', async () => {
    const lineRequest = {
      childFolder:           absoluteFolderOf('jobs/J-1/install'),
      instance:              1,
      label:                 'install',
      workingDirectory:      boardFolder,
      argv:                  ['example-install'],
      verbatimArguments:     true,
      environment:           {},
      timeBoundMilliseconds: 900,
    };
    const launchedLine = await childrenOverServedTalos(answered('done'));
    const alreadyLaunched = await childrenOverServedTalos(answered('already-done'));
    const refused = await childrenOverServedTalos(refusedWith('folder-outside-board'));

    expect(await launchedLine.children.launchLine(lineRequest)).toEqual({ verdict: 'launched' });
    expect(await alreadyLaunched.children.launchLine(lineRequest)).toEqual({ verdict: 'already-launched' });
    expect(await refused.children.launchLine(lineRequest)).toEqual({ verdict: 'refused', reason: 'folder-outside-board' });
    const [frame] = launchedLine.framesSeen;
    expect(frame?.kind === 'launch' ? frame.launch : null).toMatchObject({
      childFolder: 'jobs/J-1/install', kind: 'line', verbatimArguments: true, timeBoundMilliseconds: 900, closingLine: null, quitAtTurnEnd: null
    });
  });

  testWhenRecorded(['local-endpoint-recording'], 'a launch Talos does not answer, or with no connection, is unavailable, and with no connection writes no file', async () => {
    const planFilePath = join(boardFolder, 'jobs', 'J-1', 'settings', 'example.json');
    const request = {
      childFolder:                    absoluteFolderOf('jobs/J-1'),
      instance:                       1,
      label:                          'J-1',
      workingDirectory:               boardFolder,
      plan:                           planWritingFile(planFilePath),
      treeStopAtEndGraceMilliseconds: null,
    };
    const silent = await childrenOverServedTalos(() => new Promise<DoneFrame>(() => undefined), SILENT_FRAME_TIMEOUT_MILLISECONDS);

    expect(await childrenReading().launchAgent(request)).toEqual({ verdict: 'talos-unavailable' });
    expect(existsSync(planFilePath)).toBe(false);
    expect(await silent.children.launchAgent(request)).toEqual({ verdict: 'talos-unavailable' });
  });

  testWhenRecorded(['local-endpoint-recording'], 'an input, a stop and a stop of the lines count as taken only when Talos answered done', async () => {
    const taking = await childrenOverServedTalos(answered('done'));
    const refusing = await childrenOverServedTalos(refusedWith('unknown-child'));
    const folder = absoluteFolderOf('jobs/J-1');

    expect(await taking.children.sendInput(folder, 3, { act: 'write-line', line: 'example line' })).toBe(true);
    expect(await taking.children.stop(folder, 3, 250)).toBe(true);
    expect(await taking.children.stopLiveLines()).toBe(true);
    expect(await refusing.children.sendInput(folder, 3, { act: 'close' })).toBe(false);
    expect(await refusing.children.stop(folder, 3, 250)).toBe(false);
    expect(await childrenReading().stopLiveLines()).toBe(false);
    expect(taking.framesSeen.map(({ frameId: _frameId, ...frame }) => frame)).toEqual([
      { kind: 'input', childId: 'jobs/J-1#3', input: { act: 'write-line', line: 'example line' } },
      { kind: 'stop', childId: 'jobs/J-1#3', graceMilliseconds: 250 },
      { kind: 'stop-lines' },
    ]);
  });

  testWhenRecorded(['local-endpoint-recording'], 'an input marker is written only after Talos answered done to every input, and then nothing is sent again', async () => {
    const markerPath = join(boardFolder, 'jobs', 'J-1', 'answer-1.sent');
    const inputs = [{ act: 'write-line', line: 'example answer' }, { act: 'close' }] as const;
    const refusing = await childrenOverServedTalos(refusedWith('child-ended'));
    PlantedChild.plantChildRecord(child('jobs/J-1'));

    expect(await refusing.children.sendInputOnce(markerPath, absoluteFolderOf('jobs/J-1'), 1, inputs)).toBe(false);
    expect(existsSync(markerPath)).toBe(false);

    const taking = await childrenOverServedTalos(answered('done'));
    expect(await taking.children.sendInputOnce(markerPath, absoluteFolderOf('jobs/J-1'), 1, inputs)).toBe(true);
    expect(existsSync(markerPath)).toBe(true);
    expect(await taking.children.sendInputOnce(markerPath, absoluteFolderOf('jobs/J-1'), 1, inputs)).toBe(false);
    expect(taking.framesSeen.map((frame) => frame.kind)).toEqual(['input', 'input']);
  });

  testWhenRecorded(['local-endpoint-recording'], 'an input marker is never written for a child that is not live', async () => {
    const markerPath = join(boardFolder, 'jobs', 'J-1', 'answer-1.sent');
    const taking = await childrenOverServedTalos(answered('done'));
    PlantedChild.plantChildRecord(child('jobs/J-1'), { state: 'ended', end: EXITED });

    expect(await taking.children.sendInputOnce(markerPath, absoluteFolderOf('jobs/J-1'), 1, [{ act: 'close' }])).toBe(false);
    expect(existsSync(markerPath)).toBe(false);
    expect(taking.framesSeen).toEqual([]);
  });
});
