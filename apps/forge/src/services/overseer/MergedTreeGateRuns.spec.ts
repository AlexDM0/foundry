/**
 * The merged-tree gate runs beside the drive pass, over a fake run. What matters: an ask starts one run and answers `running`, an ask while
 * it runs starts nothing (two runs on one worktree would gate the same folder twice), and a later ask answers the outcome the run kept;
 * the folder's key holds the stamp and the gated entities, so a changed pipeline or another entity set is another run and an outcome of
 * another pipeline never settles a re-gate; `settled` lets the outcome go, `settleAtStart` removes only the folders of runs that died
 * unfinished, and an unreadable outcome or one of another format version is no outcome. A stopped run keeps no outcome.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GateRunStamp }                              from '../../lib/tracker-model/@types/GatePhase.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { firstValueOf, waitUntil }                        from '../../testing/WaitUntil.ts';
import type { MergedTreeGate }                            from './Airlocks.ts';
import {
  createMergedTreeGateRuns,
  MERGED_TREE_GATE_OUTCOME_FILE,
  MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION,
  MERGED_TREE_GATE_RUNS_FOLDER,
  type MergedTreeGateRunRequest,
  type MergedTreeGateRuns
} from './MergedTreeGateRuns.ts';

const STAMP: GateRunStamp = { phase: 'merge', phaseHash: 'example-phase-hash' };

const PASSED_GATE: MergedTreeGate = {
  outcome: 'passed', step: null, output: '', stamp: STAMP
};

const RED_GATE: MergedTreeGate = {
  outcome: 'failed', step: 'tests', output: 'expected 2, received 3', stamp: STAMP
};

interface FakeRun {
  started: number;
  finish:  (gate: MergedTreeGate) => void;
  fail:    (failure: Error) => void;
}

interface RunsUnderTest {
  boardFolder: string;
  runs:        MergedTreeGateRuns;
  wakes:       boolean[];
  sentences:   string[];
  fakeRun:     FakeRun;
  requestOf:   (overrides?: Partial<MergedTreeGateRunRequest>) => MergedTreeGateRunRequest;
  runFolders:  () => string[];
}

const scratchFolders: string[] = [];

afterEach(() => {
  for (const folder of scratchFolders.splice(0)) removeScratchDirectory(folder);
});

function runsUnderTest(): RunsUnderTest {
  const boardFolder = createScratchDirectory('merged-tree-gate-runs');
  scratchFolders.push(boardFolder);
  const wakes: boolean[] = [];
  const sentences: string[] = [];
  const fakeRun: FakeRun = { started: 0, finish: () => undefined, fail: () => undefined };
  const runs = createMergedTreeGateRuns({ boardFolder, wake: (forced) => wakes.push(forced), log: (sentence) => sentences.push(sentence) });
  const requestOf = (overrides: Partial<MergedTreeGateRunRequest> = {}): MergedTreeGateRunRequest => ({
    worktreePath:  join(boardFolder, 'worktrees', 'ticket-7'),
    treeId:        'b'.repeat(40),
    phase:         'merge',
    gatedEntities: undefined,
    stamp:         STAMP,
    run:           () => new Promise<MergedTreeGate>((resolve, reject) => {
      fakeRun.started += 1;
      fakeRun.finish = resolve;
      fakeRun.fail = reject;
    }),
    ...overrides,
  });
  const runsFolder = join(boardFolder, MERGED_TREE_GATE_RUNS_FOLDER);
  return {
    boardFolder,
    runs,
    wakes,
    sentences,
    fakeRun,
    requestOf,
    runFolders: () => (existsSync(runsFolder) ? readdirSync(runsFolder) : []),
  };
}

function keptOutcomeOf(subject: RunsUnderTest, request: MergedTreeGateRunRequest): Promise<MergedTreeGate> {
  return firstValueOf(() => {
    const answer = subject.runs.gateOf(request);
    return answer === 'running' ? undefined : answer;
  }, 'the run kept its outcome');
}

describe('an ask', () => {
  test('the first ask starts one run and answers running', () => {
    const subject = runsUnderTest();
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
    expect(subject.runFolders()).toHaveLength(1);
  });

  test('an ask while the run is in flight starts nothing', () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
  });

  test('after the run the ask answers the kept outcome, and the run woke a forced pass', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.finish(RED_GATE);
    expect(await keptOutcomeOf(subject, subject.requestOf())).toEqual(RED_GATE);
    expect(subject.fakeRun.started).toBe(1);
    expect(subject.wakes).toEqual([true]);
    expect(subject.sentences).toEqual([
      `The merged-tree gate of ticket-7 at tree ${'b'.repeat(12)} in phase merge started.`,
      `The merged-tree gate of ticket-7 at tree ${'b'.repeat(12)} in phase merge ended: failed.`,
    ]);
  });

  test('a changed stamp is another run folder, started once the run on the same worktree ended', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    const changedPipeline = subject.requestOf({ stamp: { phase: 'merge', phaseHash: 'another-phase-hash' } });
    expect(subject.runs.gateOf(changedPipeline)).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
    subject.fakeRun.finish(PASSED_GATE);
    await keptOutcomeOf(subject, subject.requestOf());
    expect(subject.runs.gateOf(changedPipeline)).toBe('running');
    expect(subject.fakeRun.started).toBe(2);
    expect(subject.runFolders()).toHaveLength(2);
  });

  test('another entity set or other entity phase hashes are other run folders', () => {
    const subject = runsUnderTest();
    const entityStamp: GateRunStamp = { ...STAMP, entityPhaseHashes: { shop: 'shop-hash' } };
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/one', gatedEntities: ['shop'], stamp: entityStamp }));
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/two', gatedEntities: ['shop', 'tokens'], stamp: entityStamp }));
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/three', gatedEntities: ['shop'], stamp: { ...STAMP, entityPhaseHashes: { shop: 'other-hash' } } }));
    const folderNames = subject.runFolders();
    expect(folderNames).toHaveLength(3);
    expect(new Set(folderNames).size).toBe(3);
  });

  test('a run that throws keeps no outcome and wakes nothing, so the next ask runs it again', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.fail(new Error('the Overseer stopped while it ran'));
    await waitUntil(() => subject.sentences.length === 2, 'the run ended');
    expect(subject.sentences[1]).toContain('ended with no outcome: the Overseer stopped while it ran');
    expect(subject.wakes).toEqual([]);
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(2);
  });
});

describe('settling', () => {
  test('settled removes the run folder, so the next ask runs the gate again', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.finish(PASSED_GATE);
    await keptOutcomeOf(subject, subject.requestOf());
    subject.runs.settled(subject.requestOf());
    expect(subject.runFolders()).toEqual([]);
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(2);
  });

  test('settleAtStart removes a folder with no outcome and keeps one with an outcome', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.finish(PASSED_GATE);
    await keptOutcomeOf(subject, subject.requestOf());
    const deadRunFolder = join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER, '0123456789abcdef');
    mkdirSync(deadRunFolder, { recursive: true });
    const nextStart = createMergedTreeGateRuns({ boardFolder: subject.boardFolder, wake: () => undefined, log: () => undefined });
    nextStart.settleAtStart();
    expect(existsSync(deadRunFolder)).toBe(false);
    expect(nextStart.gateOf(subject.requestOf())).toEqual(PASSED_GATE);
  });

  test('stopAll awaits the runs in flight and starts no further run', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    const stopped = subject.runs.stopAll();
    subject.fakeRun.fail(new Error('stopped'));
    await stopped;
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
  });
});

describe('a kept outcome that is no outcome', () => {
  function plantOutcome(subject: RunsUnderTest, contents: string): void {
    subject.runs.gateOf(subject.requestOf());
    const [folderName] = subject.runFolders();
    if (folderName === undefined) throw new Error('No run folder.');
    writeFileSync(join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER, folderName, MERGED_TREE_GATE_OUTCOME_FILE), contents);
  }

  test('an unreadable outcome.json is no outcome', () => {
    const subject = runsUnderTest();
    plantOutcome(subject, '{"formatVersion": 1, "gate": ');
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
  });

  test('an outcome of another format version is no outcome', () => {
    const subject = runsUnderTest();
    plantOutcome(subject, JSON.stringify({ formatVersion: MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION + 1, gate: PASSED_GATE }));
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
  });

  test('an outcome of the current format version is the kept outcome', () => {
    const subject = runsUnderTest();
    plantOutcome(subject, JSON.stringify({ formatVersion: MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, gate: PASSED_GATE }));
    expect(subject.runs.gateOf(subject.requestOf())).toEqual(PASSED_GATE);
  });
});
