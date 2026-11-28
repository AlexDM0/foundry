/**
 * The merged-tree gate runs beside the drive pass, over a fake run: an ask starts one run and answers `running`, a second ask while it runs
 * starts nothing, a later ask answers the kept outcome, and a changed pipeline or entity set is another run; `settleAtStart` stops the lines
 * an earlier Hephaestus left and removes unfinished runs' folders, and a stopped run keeps no outcome.
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

import type { MergedTreeGate, MergedTreeGateRunEnd }      from '../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import { MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION }        from '../../adapters/gate-outcome/MergedTreeGateOutcomeIngestion.ts';
import type { GateRunStamp }                              from '../../domain/tracker-model/@types/GatePhase.ts';
import { detailsLoggerOf }                                from '../../testing/LoggedDetails.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { firstValueOf, waitUntil }                        from '../../testing/WaitUntil.ts';
import { LinePausedError }                                from '../lifecycle/GateRun.ts';
import {
  createMergedTreeGateRuns,
  MERGED_TREE_GATE_OUTCOME_FILE,
  MERGED_TREE_GATE_RUNS_FOLDER,
  type MergedTreeGateRunRequest,
  type MergedTreeGateRuns
} from './MergedTreeGateRuns.ts';

const STAMP: GateRunStamp = { phase: 'merge', phaseHash: 'example-phase-hash' };

const PASSED_GATE: MergedTreeGateRunEnd & MergedTreeGate = {
  outcome: 'passed', step: null, output: '', stamp: STAMP
};

const RED_GATE: MergedTreeGateRunEnd & MergedTreeGate = {
  outcome: 'failed', step: 'tests', output: 'expected 2, received 3', stamp: STAMP
};

interface FakeRun {
  started:    number;
  /** The folder and the stop signal the last run started was handed. */
  runFolder:  string;
  stopSignal: AbortSignal | null;
  finish:     (gate: MergedTreeGateRunEnd) => void;
  fail:       (failure: Error) => void;
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
  const fakeRun: FakeRun = {
    started: 0, runFolder: '', stopSignal: null, finish: () => undefined, fail: () => undefined
  };
  const runsFolder = join(boardFolder, MERGED_TREE_GATE_RUNS_FOLDER);
  const runFolders = (): string[] => (existsSync(runsFolder) ? readdirSync(runsFolder) : []);
  const runs = createMergedTreeGateRuns({
    boardFolder,
    wake:               (forced) => wakes.push(forced),
    log:                detailsLoggerOf(sentences),
    stopLiveLinesUnder: () => Promise.resolve(),
  });
  const requestOf = (overrides: Partial<MergedTreeGateRunRequest> = {}): MergedTreeGateRunRequest => ({
    worktreePath:  join(boardFolder, 'worktrees', 'ticket-7'),
    treeId:        'b'.repeat(40),
    phase:         'merge',
    gatedEntities: undefined,
    stamp:         STAMP,
    ownerJobId:    'J4',
    run:           (runFolder, stopSignal) => new Promise<MergedTreeGateRunEnd>((resolve, reject) => {
      fakeRun.started += 1;
      fakeRun.runFolder = runFolder;
      fakeRun.stopSignal = stopSignal;
      fakeRun.finish = resolve;
      fakeRun.fail = reject;
      // As the line runner does: an aborted signal stops the line, whose run then ends judged on a stopped line.
      stopSignal.addEventListener('abort', () => resolve(RED_GATE), { once: true });
    }),
    ...overrides,
  });
  return {
    boardFolder,
    runs,
    wakes,
    sentences,
    fakeRun,
    requestOf,
    runFolders,
  };
}

function keptOutcomeOf(subject: RunsUnderTest, request: MergedTreeGateRunRequest): Promise<MergedTreeGate> {
  return firstValueOf(() => {
    const answer = subject.runs.gateOf(request);
    return answer === 'running' ? undefined : answer;
  }, 'the run kept its outcome');
}

describe('an ask', () => {
  test('the first ask starts one run in its run folder and answers running', () => {
    const subject = runsUnderTest();
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
    expect(subject.runFolders()).toHaveLength(1);
    expect(subject.fakeRun.runFolder).toBe(join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER, subject.runFolders()[0] ?? ''));
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
    subject.fakeRun.fail(new Error('Hephaestus stopped while it ran'));
    await waitUntil(() => subject.sentences.length === 2, 'the run ended');
    expect(subject.sentences[1]).toContain('ended with no outcome: Hephaestus stopped while it ran');
    expect(subject.wakes).toEqual([]);
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(2);
  });

  test('a run whose line Talos paused keeps no outcome and wakes a forced pass, which asks again', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.fail(new LinePausedError('/example/board/merge-gates/0123456789abcdef/gate-1'));
    await waitUntil(() => subject.wakes.length === 1, 'the paused run woke a pass');
    expect(subject.wakes).toEqual([true]);
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
    const leftoverLineStops: { folder: string; deadRunFolderThen: boolean }[] = [];
    const nextStart = createMergedTreeGateRuns({
      boardFolder:        subject.boardFolder,
      wake:               () => undefined,
      log:                () => undefined,
      stopLiveLinesUnder: (folder) => {
        leftoverLineStops.push({ folder, deadRunFolderThen: existsSync(deadRunFolder) });
        return Promise.resolve();
      },
    });
    await nextStart.settleAtStart();
    expect(leftoverLineStops).toEqual([{ folder: join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER), deadRunFolderThen: true }]);
    expect(existsSync(deadRunFolder)).toBe(false);
    expect(nextStart.gateOf(subject.requestOf())).toEqual(PASSED_GATE);
  });

  test('stopAll aborts the run\'s signal, awaits its end, keeps no outcome and starts no further run', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    await subject.runs.stopAll();
    expect(subject.fakeRun.stopSignal?.aborted).toBe(true);
    expect(subject.sentences[1]).toContain('ended with no outcome: the run was stopped while it ran');
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(1);
  });

  test('stopRunsIn stops only the runs in that worktree, which keep no outcome and lose their folder', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/other-worktree' }));
    const otherRunSignal = subject.fakeRun.stopSignal;
    subject.runs.gateOf(subject.requestOf());
    await subject.runs.stopRunsIn(subject.requestOf().worktreePath);
    expect([subject.fakeRun.stopSignal?.aborted, otherRunSignal?.aborted]).toEqual([true, false]);
    expect(subject.runFolders()).toHaveLength(1);
    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(3);
  });

  test('stopRunsOfEndedJobs stops, unawaited, only the runs whose owner job left the board, and a stopped run loses its folder at its end', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/stale-green-worktree', ownerJobId: null }));
    const staleGreenRunSignal = subject.fakeRun.stopSignal;
    subject.runs.gateOf(subject.requestOf({ worktreePath: '/example/live-job-worktree', ownerJobId: 'J9' }));
    const liveJobRunSignal = subject.fakeRun.stopSignal;
    let endedJobRunEnds: (gate: MergedTreeGateRunEnd) => void = () => undefined;
    subject.runs.gateOf(subject.requestOf({
      run: (_runFolder, stopSignal) => {
        subject.fakeRun.stopSignal = stopSignal;
        return new Promise<MergedTreeGateRunEnd>((resolve) => {
          endedJobRunEnds = resolve;
        });
      },
    }));
    const endedJobRunSignal = subject.fakeRun.stopSignal;

    subject.runs.stopRunsOfEndedJobs((jobId) => jobId === 'J9');

    expect([endedJobRunSignal?.aborted, liveJobRunSignal?.aborted, staleGreenRunSignal?.aborted]).toEqual([true, false, false]);
    expect(subject.runFolders()).toHaveLength(3);
    endedJobRunEnds(RED_GATE);
    await waitUntil(() => subject.runFolders().length === 2, 'the stopped run of the ended job loses its folder');
  });

  test('a run a later ask took over for a new owner job is not stopped as its first owner\'s', () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf({ ownerJobId: 'J4' }));
    subject.runs.gateOf(subject.requestOf({ ownerJobId: 'J5' }));
    subject.runs.stopRunsOfEndedJobs((jobId) => jobId === 'J5');
    expect(subject.fakeRun.stopSignal?.aborted).toBe(false);
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

  test('an unreadable outcome of an ended run runs the gate again, logged, and the new run\'s outcome replaces it', async () => {
    const subject = runsUnderTest();
    subject.runs.gateOf(subject.requestOf());
    subject.fakeRun.finish(PASSED_GATE);
    await keptOutcomeOf(subject, subject.requestOf());
    const [folderName] = subject.runFolders();
    writeFileSync(join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER, folderName ?? '', MERGED_TREE_GATE_OUTCOME_FILE), '{"formatVersion": 1, "gate": {}}');

    expect(subject.runs.gateOf(subject.requestOf())).toBe('running');
    expect(subject.fakeRun.started).toBe(2);
    expect(subject.sentences.filter((sentence) => sentence.includes('cannot be read'))).toHaveLength(1);
    subject.fakeRun.finish(PASSED_GATE);
    expect(await keptOutcomeOf(subject, subject.requestOf())).toEqual(PASSED_GATE);
  });

  test('settleAtStart removes a run folder whose kept outcome cannot be read, logged', async () => {
    const subject = runsUnderTest();
    const unreadableRunFolder = join(subject.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER, '0123456789abcdef');
    mkdirSync(unreadableRunFolder, { recursive: true });
    writeFileSync(join(unreadableRunFolder, MERGED_TREE_GATE_OUTCOME_FILE), '{"gate": ');

    await subject.runs.settleAtStart();

    expect(existsSync(unreadableRunFolder)).toBe(false);
    expect(subject.sentences).toEqual([expect.stringContaining('0123456789abcdef is removed: its kept outcome cannot be read')]);
  });

  test('an outcome of the current format version is the kept outcome', () => {
    const subject = runsUnderTest();
    plantOutcome(subject, JSON.stringify({ formatVersion: MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, gate: PASSED_GATE }));
    expect(subject.runs.gateOf(subject.requestOf())).toEqual(PASSED_GATE);
  });
});
