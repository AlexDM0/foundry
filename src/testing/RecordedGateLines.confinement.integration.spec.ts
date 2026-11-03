/**
 * Records the argv the native gate confinement wraps a gate argv in, for a plan with no network and no extra writes. What matters is the
 * prefix before the wrapped argv, which the mock of `src/testing/RecordedGateLines.ts` reads as the mark of a confined spawn, and that a
 * line under it still runs; a platform that confines nothing records an empty prefix.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterAll,
  beforeAll,
  expect,
  test
} from 'bun:test';

import type { ConfinementPlan }                                    from '../lib/gate-confinement/GateConfinement.ts';
import { gateConfinementFor }                                      from '../lib/gate-confinement/GateConfinementFor.ts';
import { recordAnswer }                                            from './RecordedAnswers.ts';
import { CONFINEMENT_CALL_SHAPES, RECORDED_GATE_PLACEHOLDERS }     from './RecordedGateLines.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

const WRAPPED_LINE_OUTPUT = 'example-confined';
const WRAPPED_ARGV: readonly string[] = ['/bin/sh', '-c', `echo ${WRAPPED_LINE_OUTPUT}`];

let scratch = '';

beforeAll(() => {
  scratch = createCanonicalScratchDirectory('recorded-confinement');
  for (const folder of ['worktree', 'temp']) mkdirSync(join(scratch, folder), { recursive: true });
});

afterAll(() => {
  removeScratchDirectory(scratch);
});

test('the native confinement puts its own argv before the gate argv, leaves the gate argv whole, and the confined line runs', () => {
  const plan: ConfinementPlan = {
    worktree:            join(scratch, 'worktree'),
    worktreeAdminFolder: null,
    temporaryDirectory:  join(scratch, 'temp'),
    writableCachePaths:  [],
    deniedWritableRoots: [join(scratch, 'temp', 'data')],
    deniedReadableRoots: [join(scratch, 'temp', 'data', 'jobs', '*', 'launch-*.json')],
    network:             false,
    confinementFilePath: join(scratch, 'confinement-profile'),
  };

  const confinedArgv = gateConfinementFor(process.platform).confinedArgvOf(plan, WRAPPED_ARGV);
  const run = Bun.spawnSync({ cmd: [...confinedArgv], cwd: plan.worktree, stdout: 'pipe' });

  expect(confinedArgv.slice(-WRAPPED_ARGV.length)).toEqual([...WRAPPED_ARGV]);
  expect(run.stdout.toString()).toBe(`${WRAPPED_LINE_OUTPUT}\n`);
  const prefix = confinedArgv.slice(0, -WRAPPED_ARGV.length).map((argument) => argument.replaceAll(scratch, RECORDED_GATE_PLACEHOLDERS.SCRATCH));
  recordAnswer(CONFINEMENT_CALL_SHAPES.CONFINED_ARGV, [...prefix, RECORDED_GATE_PLACEHOLDERS.ARGV]);
});
