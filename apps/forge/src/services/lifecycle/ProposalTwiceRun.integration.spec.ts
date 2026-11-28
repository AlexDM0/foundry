/**
 * A proposal's gates run twice on a scratch snapshot, planting each verdict: green twice, red twice, unrunnable, and `disagreeing` for a gate
 * that fails once and passes once. Each gate is judged on its own, a gate that changes a tracked file fails and the snapshot is restored, and
 * a failed prepare step judges no gate. git's answers about the tree come from `src/testing/RecordedGit.ts`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { afterEach, beforeEach, expect }  from 'bun:test';
import type { PipelineGate }              from '../../domain/tracker-model/@types/Pipeline.ts';
import { environmentCopy }                from '../../shared/Environment.ts';
import { FAKE_LINE_REFUSAL, runsAsGiven } from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }            from '../../testing/NativePlatformPorts.ts';
import {
  GIT_CALL_SHAPES,
  type RecordedGitStage,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                    from '../../testing/ScratchWorkspace.ts';
import { spawnedLineRunner }                                                 from '../../testing/SpawnedLineRunner.ts';
import { testWhenGitIsRecorded }                                             from '../../testing/ToolGuard.ts';
import { ProposalTwiceRun, type ProposalRunRecord, type ProposalRunRequest } from './ProposalTwiceRun.ts';

const SNAPSHOT_COMMIT = 'example-snapshot-commit';
const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];
const TREE_UNCHANGED: RecordedGitStep = { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();
let snapshotDirectory = '';
let markerDirectory = '';

function gate(name: string, run: string): PipelineGate {
  return { name, run };
}

/** Both runs read the tree after each of `gateCount` gates, each time unchanged. */
function treeUnchangedAfterBothRunsOf(gateCount: number): RecordedGitStage {
  return Array.from({ length: gateCount * 2 }, () => TREE_UNCHANGED);
}

async function recordOf(stage: RecordedGitStage, request: ProposalRunRequest): Promise<ProposalRunRecord> {
  const run = await recordedGit.playStage(stage, () => ProposalTwiceRun.runProposalTwice(request));
  if ('verdict' in run) throw new Error(`the proposal was refused: ${run.refusal.code}`);
  return run;
}

function requestOf(gates: readonly PipelineGate[], prepare: ProposalRunRequest['prepare'] = []): ProposalRunRequest {
  return {
    shellLine:      nativePlatformPorts().shellLine,
    prepare,
    gates,
    directory:      snapshotDirectory,
    snapshotCommit: SNAPSHOT_COMMIT,
    environment:    environmentCopy(),
    confinedLineOf: runsAsGiven,
    runLine:        spawnedLineRunner,
    childFolder:    join(markerDirectory, 'board', 'pipeline-checks', 'S1'),
    grantsWrites:   true,
  };
}

beforeEach(() => {
  snapshotDirectory = createScratchDirectory('proposal-twice-run');
  writeFileSync(join(snapshotDirectory, 'source.txt'), 'unformatted\n');
  markerDirectory   = createScratchDirectory('proposal-twice-run-marker');
});

afterEach(() => {
  removeScratchDirectory(snapshotDirectory);
  removeScratchDirectory(markerDirectory);
});

testWhenGitIsRecorded('cannot-run, red, green and disagreeing gates are each recorded with both outcomes', async () => {
  const marker = join(markerDirectory, 'ran-once');
  const record = await recordOf(treeUnchangedAfterBothRunsOf(4), requestOf([
    gate('unrunnable', 'no-such-gate-command-anywhere'),
    gate('red', 'exit 1'),
    gate('green', 'true'),
    gate('flaky', `if [ -f '${marker}' ]; then exit 0; fi; touch '${marker}'; exit 1`),
  ]));

  expect(record.gates.map(({ name, outcomes, verdict }) => [name, outcomes, verdict])).toEqual([
    ['unrunnable', ['cannot-run', 'cannot-run'], 'cannot-run'],
    ['red', ['failed', 'failed'], 'red'],
    ['green', ['passed', 'passed'], 'green'],
    ['flaky', ['failed', 'passed'], 'disagreeing'],
  ]);
  expect(record.snapshotCommit).toBe(SNAPSHOT_COMMIT);
  expect(record.prepare.failedSteps).toEqual([null, null]);
});

testWhenGitIsRecorded('each run of each gate records its line\'s run time', async () => {
  const record = await recordOf(treeUnchangedAfterBothRunsOf(1), requestOf([gate('green', 'true')]));

  expect(record.gates[0]?.durationsMilliseconds).toHaveLength(2);
  for (const milliseconds of record.gates[0]?.durationsMilliseconds ?? []) expect(milliseconds).toBeGreaterThanOrEqual(0);
});

testWhenGitIsRecorded('a gate that changes a tracked file is red, and the snapshot is restored before the gate after it', async () => {
  const reformattedThenRestored: RecordedGitStage = [
    { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE },
    { gitArguments: ['checkout', '-q', '--', '.'], answeredAs: GIT_CALL_SHAPES.CHECKOUT_OF_A_REFORMATTED_FILE },
    TREE_UNCHANGED,
  ];

  const record = await recordOf([...reformattedThenRestored, ...reformattedThenRestored], requestOf([
    gate('formats', 'echo formatted > source.txt'),
    gate('reads', 'true'),
  ]));

  expect(record.gates.map(({ verdict }) => verdict)).toEqual(['red', 'green']);
});

testWhenGitIsRecorded('a failed prepare step judges no gate of its run', async () => {
  const record = await recordOf([], requestOf([gate('green', 'true')], [{ name: 'install', run: 'exit 3' }]));

  expect(record.prepare.failedSteps).toEqual(['install', 'install']);
  expect(record.gates.map(({ verdict }) => verdict)).toEqual(['cannot-run']);
  expect(existsSync(join(snapshotDirectory, 'node_modules'))).toBe(false);
});

testWhenGitIsRecorded('a refused line stops the run: no prepare step, gate or second run starts, and no record exists', async () => {
  const marker = join(markerDirectory, 'ran');
  let lines = 0;
  const outcome = await recordedGit.playStage([], () => ProposalTwiceRun.runProposalTwice({
    ...requestOf([gate('green', `touch '${marker}'`)], [{ name: 'install', run: `touch '${marker}'` }]),
    confinedLineOf: () => {
      lines += 1;
      return { verdict: 'refused', refusal: FAKE_LINE_REFUSAL };
    },
  }));
  expect(outcome).toEqual({ verdict: 'sandbox-unavailable', refusal: FAKE_LINE_REFUSAL });
  expect(lines).toBe(1);
  expect(existsSync(marker)).toBe(false);
});
