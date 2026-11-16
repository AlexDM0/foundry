/**
 * A gate pipeline over recorded gate lines and recorded git. What matters: the caller is told the process id of every line it starts,
 * prepare steps and gates alike, and hears each line's output, so the Airlock can stop the tree of a merged-tree gate that never ends. A
 * prepare step that exits 0 but changes a tracked file is a setup failure naming that step, never the red first gate it would make. A
 * prepare step with a folder runs in it, as a gate with one does.
 */
import { join } from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import { environmentCopy }                                from '../../shared/Environment.ts';
import { runsAsGiven }                                    from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { RECORDED_GATE_LINES, useRecordedGateSpawns }     from '../../testing/RecordedGateLines.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { GateRun }                                        from './GateRun.ts';

const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];
const TREE_UNCHANGED = { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();
const recordedGateSpawns = useRecordedGateSpawns();

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createScratchDirectory('gate-run');
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

testWhenGitIsRecorded('the process id of the prepare step and of the gate is told, and the red gate\'s output is heard', async () => {
  const processIds: number[] = [];
  const pieces: string[] = [];
  const { shellLine, processSupervision } = nativePlatformPorts();

  const verdict = await recordedGit.playStage([TREE_UNCHANGED, TREE_UNCHANGED], () => GateRun.runPipeline({
    shellLine,
    prepare:        [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }],
    gates:          [{ name: 'tests', run: RECORDED_GATE_LINES.RED }],
    directory:      checkoutDirectory,
    environment:    environmentCopy(),
    spawnOptions:   processSupervision.spawnOptionsFor('gate'),
    confinedLineOf: runsAsGiven,
    onSpawned:      (processId) => processIds.push(processId),
    onOutput:       (text) => pieces.push(text),
  }));

  expect(verdict).toMatchObject({ outcome: 'failed', gate: 'tests' });
  expect(processIds).toHaveLength(2);
  expect(pieces.join('')).toContain('example-red');
});

testWhenGitIsRecorded('a prepare step that exits 0 but changes a tracked file is a setup failure naming it, and no gate runs', async () => {
  const { shellLine, processSupervision } = nativePlatformPorts();

  const verdict = await recordedGit.playStage([{ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE }], () => GateRun.runPipeline({
    shellLine,
    prepare:        [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }],
    gates:          [{ name: 'tests', run: RECORDED_GATE_LINES.GREEN }],
    directory:      checkoutDirectory,
    environment:    environmentCopy(),
    spawnOptions:   processSupervision.spawnOptionsFor('gate'),
    confinedLineOf: runsAsGiven,
  }));

  expect(verdict).toMatchObject({ outcome: 'setup-failed', step: 'install', gatesRun: [] });
  expect('output' in verdict ? verdict.output : '').toContain('source.txt');
});

testWhenGitIsRecorded('a prepare step and a gate with a folder each run in that folder of the checkout', async () => {
  const { shellLine, processSupervision } = nativePlatformPorts();
  recordedGateSpawns.takeSpawnFolders();

  await recordedGit.playStage([TREE_UNCHANGED, TREE_UNCHANGED], () => GateRun.runPipeline({
    shellLine,
    prepare:        [{ name: 'install', run: RECORDED_GATE_LINES.GREEN, in: 'packages/example' }],
    gates:          [{ name: 'tests', run: RECORDED_GATE_LINES.GREEN, in: 'docs' }],
    directory:      checkoutDirectory,
    environment:    environmentCopy(),
    spawnOptions:   processSupervision.spawnOptionsFor('gate'),
    confinedLineOf: runsAsGiven,
  }));

  expect(recordedGateSpawns.takeSpawnFolders()).toEqual([join(checkoutDirectory, 'packages/example'), join(checkoutDirectory, 'docs')]);
});
