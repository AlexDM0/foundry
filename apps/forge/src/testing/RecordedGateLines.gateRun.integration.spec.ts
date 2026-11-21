/**
 * Records the end of each gate line the mock of `src/testing/RecordedGateLines.ts` answers: a green line, a red line and a line that is
 * stopped, unconfined and under the native confinement, and a line that writes outside the allowed folders, under the confinement only.
 * What matters is the exit code, the signal, the status file text and the output a real `GateRun.runGate` reads of a line spawned as Talos
 * spawns it, and that the sandbox
 * really refuses the outside write: the file is never made and the line ends red.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir }                from 'node:os';
import { join }                  from 'node:path';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { confinedLineOf }               from '../lib/gate-confinement/ConfinedLine.ts';
import type { ConfinementPlan }         from '../lib/gate-confinement/GateConfinement.ts';
import { gateConfinementFor }           from '../lib/gate-confinement/GateConfinementFor.ts';
import { GateRun, type GateProcessRun } from '../services/lifecycle/GateRun.ts';
import { environmentCopy }              from '../shared/Environment.ts';
import { nativePlatformPorts }          from './NativePlatformPorts.ts';
import { recordAnswer }                 from './RecordedAnswers.ts';
import {
  asRecordedGateEnd,
  gateRunCallShapeOf,
  type GateLineConfinementKind,
  OUTSIDE_WRITE_FILE,
  RECORDED_GATE_LINES,
  type RecordedGateLineKind,
  writesOutsideLineOf
} from './RecordedGateLines.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { spawnedLineRunner }                                       from './SpawnedLineRunner.ts';
import { testWhenSandboxExecApplies }                              from './ToolGuard.ts';

const { shellLine } = nativePlatformPorts();
const RED_EXIT_CODE = 1;

let scratch = '';

beforeAll(() => {
  scratch = createCanonicalScratchDirectory('recorded-gate-run');
  for (const folder of ['worktree', 'temp', 'outside']) mkdirSync(join(scratch, folder), { recursive: true });
});

afterAll(() => {
  removeScratchDirectory(scratch);
});

function planOf(): ConfinementPlan {
  return {
    worktree:            join(scratch, 'worktree'),
    writableRoots:       [],
    worktreeAdminFolder: null,
    temporaryDirectory:  join(scratch, 'temp'),
    writableCachePaths:  [],
    // A plan with no denied root renders a Seatbelt rule that denies every read, so this one denies a data folder as Hephaestus's does.
    // The machine's temp folders are writable to every gate, so the outside folder, a scratch folder, is denied by name.
    deniedWritableRoots: [join(scratch, 'temp', 'data'), join(scratch, 'outside')],
    deniedReadableRoots: [join(scratch, 'temp', 'data', 'jobs', '*', 'launch-*.json')],
    network:             false,
    confinementFilePath: join(scratch, 'confinement-profile'),
  };
}

async function gateEndOf(line: string, confinement: GateLineConfinementKind): Promise<GateProcessRun> {
  const statusFile = join(tmpdir(), `example-line-status-${crypto.randomUUID()}`);
  const { argv } = shellLine.spawnRequestOf(line, statusFile);
  const confined = confinement === 'confined' ? confinedLineOf(gateConfinementFor(process.platform), planOf, argv) : { verdict: 'runs' as const, argv };
  if (confined.verdict === 'refused') throw new Error(confined.reason);
  return GateRun.runGate({
    argv:        confined.argv,
    statusFile,
    directory:   join(scratch, 'worktree'),
    environment: environmentCopy(),
    runLine:     spawnedLineRunner,
    childFolder: join(scratch, 'board', 'merge-gates', '0123456789abcdef', 'gate-1'),
  });
}

const EXPECTED_ENDS: Readonly<Record<Exclude<RecordedGateLineKind, 'writes-outside'>, (run: GateProcessRun) => void>> = {
  green:   (run) => expect(run).toMatchObject({ exitCode: 0, signalCode: null }),
  red:     (run) => expect(run).toMatchObject({ exitCode: RED_EXIT_CODE, signalCode: null }),
  stopped: (run) => expect(run).toMatchObject({ exitCode: null, signalCode: 'SIGTERM' }),
};

const LINE_OF_KIND = { green: RECORDED_GATE_LINES.GREEN, red: RECORDED_GATE_LINES.RED, stopped: RECORDED_GATE_LINES.STOPPED } as const;

describe('a gate line with no confinement', () => {
  for (const [kind, expectEnd] of Object.entries(EXPECTED_ENDS) as [keyof typeof EXPECTED_ENDS, (run: GateProcessRun) => void][]) {
    test(`a ${kind} line ends as a ${kind} line`, async () => {
      const run = await gateEndOf(LINE_OF_KIND[kind], 'unconfined');

      expectEnd(run);
      recordAnswer(gateRunCallShapeOf(kind, 'unconfined'), asRecordedGateEnd(run, null));
    });
  }
});

describe('a gate line under the native confinement', () => {
  for (const [kind, expectEnd] of Object.entries(EXPECTED_ENDS) as [keyof typeof EXPECTED_ENDS, (run: GateProcessRun) => void][]) {
    testWhenSandboxExecApplies(`a ${kind} line ends as a ${kind} line`, async () => {
      const run = await gateEndOf(LINE_OF_KIND[kind], 'confined');

      expectEnd(run);
      recordAnswer(gateRunCallShapeOf(kind, 'confined'), asRecordedGateEnd(run, null));
    });
  }

  testWhenSandboxExecApplies('a line that writes outside the allowed folders makes no file and ends red, though the folder is writable', async () => {
    const outsideFolder = join(scratch, 'outside');
    const writableWithoutTheSandbox = join(scratch, 'outside-control');
    mkdirSync(writableWithoutTheSandbox);
    Bun.spawnSync({ cmd: ['/bin/sh', '-c', writesOutsideLineOf(writableWithoutTheSandbox)] });

    const run = await gateEndOf(writesOutsideLineOf(outsideFolder), 'confined');

    expect(existsSync(join(writableWithoutTheSandbox, OUTSIDE_WRITE_FILE))).toBe(true);
    expect(existsSync(join(outsideFolder, OUTSIDE_WRITE_FILE))).toBe(false);
    expect(run.exitCode).not.toBe(0);
    expect(GateRun.gateOutcomeOf(shellLine, run)).toBe('failed');
    recordAnswer(gateRunCallShapeOf('writes-outside', 'confined'), asRecordedGateEnd(run, outsideFolder));
  });
});
