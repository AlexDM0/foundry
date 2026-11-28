/**
 * Hephaestus's own lines as Talos line children, over fakes of the board's children and the connection: a line launches as a `line`
 * child with its bound, ends by its `state` frame or its record, gives its log's `agent` lines as output, judges a time-bound, lost or
 * refused launch `cannot-run`, and stops on its owner's stop.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { StateFrame }                                from '../../domain/talos/@types/TalosFrame.ts';
import type { ChildEnd, ChildRecord }                     from '../../domain/talos/ChildRecord.ts';
import type { EventLogEntry }                             from '../../domain/talos/EventLog.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import type { LineRunEnd, LineRunRequest }                from '../lifecycle/GateRun.ts';
import type {
  BoardChildren,
  ChildLaunchOutcome,
  ChildLiveness,
  LineChildRequest
} from './BoardChildren.ts';
import type { TalosConnection }                 from './TalosConnection.ts';
import { createLineRunner, stopLiveLinesUnder } from './TalosLines.ts';

const LINE_FOLDER = '/example/board/merge-gates/0123456789abcdef/gate-1';
const NEVER_LOOKS_AGAIN_MILLISECONDS = 600_000;
const LOOKS_AT_ONCE_MILLISECONDS = 1;
const RUN_MILLISECONDS = 4200;

const EXITED_GREEN: ChildEnd = {
  reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: RUN_MILLISECONDS
};

interface FakeChild {
  liveness: ChildLiveness;
  events:   EventLogEntry[];
}

interface FakeBoard {
  children:  BoardChildren;
  launches:  LineChildRequest[];
  stops:     { childFolder: string; instance: number; graceMilliseconds: number }[];
  childAt:   (childFolder: string, instance: number) => FakeChild | undefined;
  plantLive: (childFolder: string, instance: number) => FakeChild;
}

function childKeyOf(childFolder: string, instance: number): string {
  return `${childFolder}#${instance}`;
}

function fakeBoard(launchOutcome: ChildLaunchOutcome = { verdict: 'launched' }): FakeBoard {
  const childrenByKey = new Map<string, FakeChild>();
  const launches: LineChildRequest[] = [];
  const stops: FakeBoard['stops'] = [];
  const plantLive = (childFolder: string, instance: number): FakeChild => {
    const child: FakeChild = { liveness: { verdict: 'live', state: 'running' }, events: [] };
    childrenByKey.set(childKeyOf(childFolder, instance), child);
    return child;
  };
  const instancesIn = (childFolder: string): number[] => [...childrenByKey.keys()]
    .filter((key) => key.startsWith(`${childFolder}#`))
    .map((key) => Number(key.slice(childFolder.length + 1)));
  const children: BoardChildren = {
    beginPass:        () => undefined,
    jobFolderOf:      (jobId) => `/example/board/jobs/${jobId}`,
    livenessOf:       (childFolder, instance) => childrenByKey.get(childKeyOf(childFolder, instance))?.liveness ?? { verdict: 'unlaunched' },
    recordOf:         (childFolder, instance) => (childrenByKey.has(childKeyOf(childFolder, instance)) ? { childId: childKeyOf(childFolder, instance) } as ChildRecord : null),
    newestInstanceIn: (childFolder) => {
      const instances = instancesIn(childFolder);
      return instances.length === 0 ? null : Math.max(...instances);
    },
    eventsAfter: (childFolder, instance, afterSequence) => (childrenByKey.get(childKeyOf(childFolder, instance))?.events ?? [])
      .filter((entry) => entry.sequence > afterSequence),
    recognisedEndingsOf: () => [],
    launchAgent:         () => Promise.reject(new Error('a line runner launches no agent')),
    launchLine:          (request) => {
      launches.push(request);
      if (launchOutcome.verdict === 'launched') plantLive(request.childFolder, request.instance);
      return Promise.resolve(launchOutcome);
    },
    sendInput:     () => Promise.resolve(false),
    sendInputOnce: () => Promise.resolve(false),
    stop:          (childFolder, instance, graceMilliseconds) => {
      stops.push({ childFolder, instance, graceMilliseconds });
      return Promise.resolve(true);
    },
    stopLiveLines: () => Promise.resolve(true),
  };
  return {
    children, launches, stops, childAt: (childFolder, instance) => childrenByKey.get(childKeyOf(childFolder, instance)), plantLive,
  };
}

interface FakeConnection {
  connection: TalosConnection;
  sendState:  (frame: StateFrame) => void;
}

function fakeConnection(): FakeConnection {
  const stateListeners: ((frame: StateFrame) => void)[] = [];
  return {
    connection: {
      send:    () => Promise.resolve('no-answer'),
      onState: (listener) => { stateListeners.push(listener); },
      onClose: () => undefined,
      close:   () => undefined,
    },
    sendState: (frame) => {
      for (const listener of stateListeners) listener(frame);
    },
  };
}

function lineRequestOf(overrides: Partial<LineRunRequest> = {}): LineRunRequest {
  return {
    childFolder:           LINE_FOLDER,
    argv:                  ['/example/gate'],
    verbatimArguments:     false,
    directory:             '/example/worktree',
    environment:           { EXAMPLE: 'kept' },
    label:                 '0123456789abcdef/gate-1',
    timeBoundMilliseconds: 900_000,
    ...overrides,
  };
}

function agentEntry(sequence: number, line: string): EventLogEntry {
  return { sequence, origin: 'agent', line };
}

/** What the shell line makes of an end, as `GateRun.runGate` judges a gate. */
function exitMeaningOf(end: LineRunEnd): string {
  return nativePlatformPorts().shellLine.exitMeaningOf({ ...end, recordedStatus: null });
}

describe('a line run', () => {
  test('launches a line child in the next instance of its folder with its bound, and ends by the state frame of its child', async () => {
    const board = fakeBoard();
    board.plantLive(LINE_FOLDER, 1).liveness = { verdict: 'ended', end: EXITED_GREEN };
    const talos = fakeConnection();
    const runLine = createLineRunner(board.children, () => talos.connection, NEVER_LOOKS_AGAIN_MILLISECONDS);

    const running = runLine(lineRequestOf());
    await waitUntil(() => board.childAt(LINE_FOLDER, 2) !== undefined, 'the line was never launched');
    const child = board.childAt(LINE_FOLDER, 2);
    if (child === undefined) throw new Error('no child');
    child.liveness = { verdict: 'ended', end: EXITED_GREEN };
    talos.sendState({
      kind: 'state', childId: childKeyOf(LINE_FOLDER, 2), state: 'ended', end: EXITED_GREEN, recognisedEnding: null
    });
    const end = await running;

    expect(board.launches).toEqual([{
      childFolder:           LINE_FOLDER,
      instance:              2,
      label:                 '0123456789abcdef/gate-1',
      workingDirectory:      '/example/worktree',
      argv:                  ['/example/gate'],
      verbatimArguments:     false,
      environment:           { EXAMPLE: 'kept' },
      timeBoundMilliseconds: 900_000,
    }]);
    expect(end).toEqual({
      exitCode: 0, signalCode: null, endReason: 'exited', output: '', runMilliseconds: RUN_MILLISECONDS
    });
  });

  test('ends by the look at its record when no frame comes, its output the agent lines joined and each handed on', async () => {
    const board = fakeBoard();
    const outputLines: string[] = [];
    const runLine = createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS);

    const running = runLine(lineRequestOf({ onOutputLine: (line) => outputLines.push(line) }));
    await waitUntil(() => board.childAt(LINE_FOLDER, 1) !== undefined, 'the line was never launched');
    const child = board.childAt(LINE_FOLDER, 1);
    if (child === undefined) throw new Error('no child');
    child.events.push(agentEntry(1, 'first line'), { sequence: 2, origin: 'talos', line: 'a note of Talos' }, agentEntry(3, 'expected 2, received 3'));
    await waitUntil(() => outputLines.length === 2, 'the output lines were never handed on');
    child.liveness = { verdict: 'ended', end: { ...EXITED_GREEN, exitCode: 1 } };
    const end = await running;

    expect(outputLines).toEqual(['first line', 'expected 2, received 3']);
    expect(end).toEqual({
      exitCode: 1, signalCode: null, endReason: 'exited', output: 'first line\nexpected 2, received 3\n', runMilliseconds: RUN_MILLISECONDS
    });
    expect(exitMeaningOf(end)).toBe('failed');
  });

  test('a line Talos stopped at its bound answers no exit code and no signal, and judges cannot-run', async () => {
    const board = fakeBoard();
    const runLine = createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS);

    const running = runLine(lineRequestOf());
    await waitUntil(() => board.childAt(LINE_FOLDER, 1) !== undefined, 'the line was never launched');
    const child = board.childAt(LINE_FOLDER, 1);
    if (child === undefined) throw new Error('no child');
    child.liveness = {
      verdict: 'ended',
      end:     {
        ...EXITED_GREEN, reason: 'time-bound', exitCode: 0, signal: 'SIGKILL'
      }
    };
    const end = await running;

    expect(end).toMatchObject({
      exitCode: null, signalCode: null, endReason: 'time-bound', runMilliseconds: RUN_MILLISECONDS
    });
    expect(exitMeaningOf(end)).toBe('cannot-run');
  });

  test('a launch no Talos took answers talos-unavailable with a run time of 0, and judges cannot-run', async () => {
    const board = fakeBoard({ verdict: 'talos-unavailable' });
    const end = await createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS)(lineRequestOf());

    expect(end).toEqual({
      exitCode: null, signalCode: null, endReason: 'talos-unavailable', output: '', runMilliseconds: 0
    });
    expect(exitMeaningOf(end)).toBe('cannot-run');
  });

  test('a launch Talos refused answers talos-unavailable with the refusal in its output, and judges cannot-run', async () => {
    const board = fakeBoard({ verdict: 'refused', reason: 'folder-outside-board' });
    const end = await createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS)(lineRequestOf());

    expect(end).toEqual({
      exitCode: null, signalCode: null, endReason: 'talos-unavailable', output: 'Talos refused to launch the line: folder-outside-board.\n', runMilliseconds: 0
    });
    expect(exitMeaningOf(end)).toBe('cannot-run');
  });

  test('a child lost with its Talos answers talos-unavailable', async () => {
    const board = fakeBoard();
    const runLine = createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS);

    const running = runLine(lineRequestOf());
    await waitUntil(() => board.childAt(LINE_FOLDER, 1) !== undefined, 'the line was never launched');
    const child = board.childAt(LINE_FOLDER, 1);
    if (child === undefined) throw new Error('no child');
    child.liveness = { verdict: 'lost' };

    expect(await running).toMatchObject({ endReason: 'talos-unavailable', exitCode: null });
  });
});

describe('the owner\'s stop', () => {
  test('sends stop with grace 0 to the launched line', async () => {
    const board = fakeBoard();
    const stopController = new AbortController();
    const runLine = createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS);

    const running = runLine(lineRequestOf({ stopSignal: stopController.signal }));
    await waitUntil(() => board.childAt(LINE_FOLDER, 1) !== undefined, 'the line was never launched');
    stopController.abort();
    const child = board.childAt(LINE_FOLDER, 1);
    if (child === undefined) throw new Error('no child');
    child.liveness = {
      verdict: 'ended',
      end:     {
        ...EXITED_GREEN, reason: 'signalled', exitCode: null, signal: 'SIGKILL'
      }
    };
    const end = await running;

    expect(board.stops).toEqual([{ childFolder: LINE_FOLDER, instance: 1, graceMilliseconds: 0 }]);
    expect(exitMeaningOf(end)).toBe('cannot-run');
  });

  test('launches no line once given', async () => {
    const board = fakeBoard();
    const stopController = new AbortController();
    stopController.abort();

    const end = await createLineRunner(board.children, () => null, LOOKS_AT_ONCE_MILLISECONDS)(lineRequestOf({ stopSignal: stopController.signal }));

    expect(board.launches).toEqual([]);
    expect(exitMeaningOf(end)).toBe('cannot-run');
  });
});

describe('the stop of the lines under a folder', () => {
  test('sends stop to every live line below it, none to an ended one, and waits for their ends', async () => {
    const boardFolder = createScratchDirectory('talos-lines');
    try {
      const board = fakeBoard();
      const liveFolder = join(boardFolder, 'gate-profile-runs', 'P1', 'gate-1');
      const endedFolder = join(boardFolder, 'gate-profile-runs', 'P2', 'prepare-1');
      for (const childFolder of [liveFolder, endedFolder]) {
        mkdirSync(childFolder, { recursive: true });
        writeFileSync(join(childFolder, 'child-1.json'), '{}');
      }
      const liveLine = board.plantLive(liveFolder, 1);
      board.plantLive(endedFolder, 1).liveness = { verdict: 'ended', end: EXITED_GREEN };

      const stopping = stopLiveLinesUnder(board.children, join(boardFolder, 'gate-profile-runs'), { lookMilliseconds: LOOKS_AT_ONCE_MILLISECONDS, looks: 1000 });
      await waitUntil(() => board.stops.length === 1, 'no stop was sent');
      liveLine.liveness = { verdict: 'ended', end: { ...EXITED_GREEN, reason: 'signalled' } };
      await stopping;

      expect(board.stops).toEqual([{ childFolder: liveFolder, instance: 1, graceMilliseconds: 0 }]);
    } finally {
      removeScratchDirectory(boardFolder);
    }
  });
});
