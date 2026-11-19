/**
 * One run of gate lines as real processes in a scratch folder, through a line runner that spawns them as Talos does. What matters: a line's
 * output reaches the listener while the line still runs, so a gate profile's output can stream; and the run's stop signal ends the line and
 * every process it started, and the gate is not judged passed. Git's answers about the tree come from `src/testing/RecordedGit.ts`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import { environmentCopy }                                from '../../shared/Environment.ts';
import { runsAsGiven }                                    from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { spawnedLineRunner }                              from '../../testing/SpawnedLineRunner.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { GateLineRun, type GateLineRunRequest }           from './GateLineRun.ts';
import type { LineRunner }                                from './GateRun.ts';

const TREE_UNCHANGED = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();
const { shellLine } = nativePlatformPorts();

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createScratchDirectory('gate-line-run-real');
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

function requestOf(line: string, overrides: Partial<GateLineRunRequest> = {}): GateLineRunRequest {
  return {
    shellLine,
    environment:    environmentCopy(),
    confinedLineOf: runsAsGiven,
    runLine:        spawnedLineRunner,
    childFolder:    join(checkoutDirectory, 'board', 'gate-profile-runs', 'P1'),
    prepare:        [],
    gates:          [{ name: 'example', run: line }],
    directory:      checkoutDirectory,
    grantsWrites:   false,
    ...overrides,
  };
}

testWhenGitIsRecorded('a line\'s first output reaches the listener while the line still runs', async () => {
  const marker = join(checkoutDirectory, 'go-on');
  let heard = '';
  const line = `echo first-piece; while [ ! -f '${marker}' ]; do sleep 0.05; done; echo second-piece`;

  const run = recordedGit.playStage([TREE_UNCHANGED], () => GateLineRun.runOnce(requestOf(line, { onOutputLine: (outputLine) => { heard += `${outputLine}\n`; } })));
  await waitUntil(() => heard.includes('first-piece'), 'the first piece never arrived');
  expect(heard).not.toContain('second-piece');
  writeFileSync(marker, '');
  const ended = await run;

  if ('verdict' in ended) throw new Error(`the run was refused: ${ended.reason}`);
  expect(ended.gates[0]?.outcome).toBe('passed');
  expect(heard).toContain('second-piece');
});

testWhenGitIsRecorded('the run\'s stop signal ends the line and every process it started, and the gate is not judged passed', async () => {
  const marker = join(checkoutDirectory, 'started');
  const stopController = new AbortController();
  const line = `sleep 600 & touch '${marker}'; wait`;

  const stoppableLineRunner: LineRunner = (lineRequest) => spawnedLineRunner({ ...lineRequest, stopSignal: stopController.signal });
  const run = recordedGit.playStage([TREE_UNCHANGED], () => GateLineRun.runOnce(requestOf(line, { runLine: stoppableLineRunner })));
  await waitUntil(() => existsSync(marker), 'the line never started its child');
  stopController.abort();
  const ended = await run;

  if ('verdict' in ended) throw new Error(`the run was refused: ${ended.reason}`);
  expect(ended.gates[0]?.outcome).not.toBe('passed');
});
