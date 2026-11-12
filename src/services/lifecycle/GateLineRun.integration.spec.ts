/**
 * One run of gate lines as real processes in a scratch folder. What matters: a line's output reaches the listener while the line still
 * runs, so a gate profile's output can stream; the process id the listener is told leads the line's process tree, so a stop through the
 * process port ends the line and every process it started. Git's answers about the tree come from `src/testing/RecordedGit.ts`.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import { environmentCopy }                                from '../../shared/Environment.ts';
import { runsAsGiven }                                    from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { GateLineRun, type GateLineRunRequest }           from './GateLineRun.ts';

const TREE_UNCHANGED = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();
const { shellLine, processSupervision } = nativePlatformPorts();

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
    spawnOptions:    processSupervision.spawnOptionsFor('gate'),
    environment:     environmentCopy(),
    confinedLineOf:  runsAsGiven,
    prepare:         [],
    gates:           [{ name: 'example', run: line }],
    directory:       checkoutDirectory,
    grantsWrites:    false,
    millisecondsNow: () => 0,
    ...overrides,
  };
}

testWhenGitIsRecorded('a line\'s first output reaches the listener while the line still runs', async () => {
  const marker = join(checkoutDirectory, 'go-on');
  let heard = '';
  const line = `echo first-piece; while [ ! -f '${marker}' ]; do sleep 0.05; done; echo second-piece`;

  const run = recordedGit.playStage([TREE_UNCHANGED], () => GateLineRun.runOnce(requestOf(line, { onOutput: (text) => { heard += text; } })));
  await waitUntil(() => heard.includes('first-piece'), 'the first piece never arrived');
  expect(heard).not.toContain('second-piece');
  writeFileSync(marker, '');
  const ended = await run;

  if ('verdict' in ended) throw new Error(`the run was refused: ${ended.reason}`);
  expect(ended.gates[0]?.outcome).toBe('passed');
  expect(heard).toContain('second-piece');
});

testWhenGitIsRecorded('the process id told leads the line\'s tree, and a stop of that tree through the port ends the line', async () => {
  const told: ProcessIdentity[] = [];
  const line = 'sleep 600 & wait';

  const run = recordedGit.playStage([TREE_UNCHANGED], () => GateLineRun.runOnce(requestOf(line, {
    onSpawned: (processId) => {
      const identity = processSupervision.identityOf(processId);
      if (identity !== null) told.push(identity);
    },
  })));
  await waitUntil(() => told.length > 0 && (processSupervision.treeMembersOf(told[0] as ProcessIdentity)?.length ?? 0) > 1, 'the line never started its child');
  const [leader] = told;
  if (leader === undefined) throw new Error('the line never told its process id');
  const stop = processSupervision.stopTree(leader, 'force', processSupervision.treeMembersOf(leader) ?? undefined);
  const ended = await run;

  expect(stop.verdict).toBe('signalled');
  if ('verdict' in ended) throw new Error(`the run was refused: ${ended.reason}`);
  expect(ended.gates[0]?.outcome).not.toBe('passed');
});
