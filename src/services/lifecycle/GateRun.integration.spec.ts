/**
 * The gate pipeline run on a checkout. What matters: the prepare steps run first and a failed one is a setup failure, never a red gate;
 * the gates run in list order and the first red one stops the rest, reported by name with its output; a gate that exits 0 but changes a
 * tracked file is red with the diff as its output; each step gets its own confinement (a prepare step the network, a gate only its own
 * domains and writes) and a gate runs its own line in its `in` folder, never a joined line; an empty pipeline runs nothing, and a phase
 * with no gates runs no prepare step either; a gate takes a machine slot while it runs; nothing is cached, so the same tree gated twice
 * runs twice; and the gate process runs the argv it is handed, in a process group of its own, without the job variables.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                        from 'bun:test';
import { shellLineFor }                                               from '../../lib/shell-line/ShellLineFor.ts';
import type { PipelineGate }                                          from '../../lib/tracker-model/@types/Pipeline.ts';
import { environmentCopy, JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE } from '../../shared/Environment.ts';
import { FAKE_MISSING_TOOLS_REASON, runsAsGiven }                     from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                        from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit }     from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import {
  type GateConfinement,
  type GateProcessRun,
  type GateRequest,
  GateRun,
  type PipelineRunRequest,
  type PipelineVerdict
} from './GateRun.ts';

let scratchDirectory = '';
const recordedGit = useRecordedGit();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('gate-run');
});

const { shellLine, processSupervision } = nativePlatformPorts();
const NO_HOST_SHELLS = { userShell: () => undefined, commandInterpreter: () => undefined, systemRoot: () => undefined };
const repositories: string[] = [];

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
  for (const repository of repositories.splice(0)) removeScratchDirectory(repository);
});

const gateSpawnOptions = processSupervision.spawnOptionsFor('gate');

function runPipelineInThisEnvironment(request: Omit<PipelineRunRequest, 'environment' | 'spawnOptions'>): Promise<PipelineVerdict> {
  return GateRun.runPipeline({ environment: environmentCopy(), spawnOptions: gateSpawnOptions, ...request });
}

function runGateInThisEnvironment(request: Omit<GateRequest, 'environment' | 'spawnOptions'> & Partial<GateRequest>): Promise<GateProcessRun> {
  return GateRun.runGate({ environment: environmentCopy(), spawnOptions: gateSpawnOptions, ...request });
}

/** A plain folder: the gates run in it for real, and git's answer about the tree after each gate is a recorded one. */
function gatedRepository(): string {
  const repository = createScratchDirectory('gate-pipeline');
  repositories.push(repository);
  return repository;
}

const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];

/** The tree read once after each of `gateCount` gates, each time unchanged. */
/** The tree is read unchanged after each passing prepare step and after each gate. */
function treeUnchangedAfter(stepCount: number): RecordedGitStage {
  return Array.from({ length: stepCount }, () => ({ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE }));
}

function playedPipeline(stage: RecordedGitStage, request: Omit<PipelineRunRequest, 'environment' | 'spawnOptions'>): Promise<PipelineVerdict> {
  return recordedGit.playStage(stage, () => runPipelineInThisEnvironment(request));
}

function journalLine(name: string): string {
  return `echo ${name} >> '${join(scratchDirectory, 'journal.txt')}'`;
}

function journal(): string[] {
  const journalPath = join(scratchDirectory, 'journal.txt');
  return existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trim().split('\n') : [];
}

function gateOf(name: string, run: string, extra: Partial<PipelineGate> = {}): PipelineGate {
  return { name, run, ...extra };
}

describeWhenGitIsRecorded('the pipeline', () => {
  test('runs gate a then the red gate b and never c, reporting b by name with its output', async () => {
    const repository = gatedRepository();

    const verdict = await playedPipeline(treeUnchangedAfter(2), {
      shellLine,
      prepare:        [],
      gates:          [gateOf('a', journalLine('a')), gateOf('b', `${journalLine('b')}; echo 'expected 2, received 3'; exit 1`), gateOf('c', journalLine('c'))],
      directory:      repository,
      confinedLineOf: runsAsGiven,
    });

    expect(verdict).toEqual({
      outcome: 'failed', gate: 'b', output: 'expected 2, received 3\n', gatesRun: ['a', 'b']
    });
    expect(journal()).toEqual(['a', 'b']);
  });

  test('holds a gate that exits 0 but changes a tracked file red, with the diff as its output', async () => {
    const repository = gatedRepository();
    writeFileSync(join(repository, 'source.txt'), 'unformatted\n');
    const treeReformatted = [{ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE }];

    const verdict = await playedPipeline(treeReformatted, {
      shellLine, prepare: [], gates: [gateOf('format', 'echo formatted > source.txt')], directory: repository, confinedLineOf: runsAsGiven
    });

    expect(verdict.outcome).toBe('failed');
    expect('output' in verdict ? verdict.output : '').toContain('-unformatted\n+formatted');
  });

  test('passes every gate that exits 0 and leaves the tree, and runs them again on the same tree, caching nothing', async () => {
    const repository = gatedRepository();
    const request    = {
      shellLine, prepare: [], gates: [gateOf('a', journalLine('a')), gateOf('b', journalLine('b'))], directory: repository, confinedLineOf: runsAsGiven
    };

    expect(await playedPipeline(treeUnchangedAfter(2), request)).toEqual({ outcome: 'passed', gatesRun: ['a', 'b'] });
    expect(await playedPipeline(treeUnchangedAfter(2), request)).toEqual({ outcome: 'passed', gatesRun: ['a', 'b'] });
    expect(journal()).toEqual(['a', 'b', 'a', 'b']);
  });

  test('a failed prepare step is a setup failure that runs no gate', async () => {
    const repository = gatedRepository();

    const verdict = await runPipelineInThisEnvironment({
      shellLine,
      prepare:        [{ name: 'install', run: 'echo registry unreachable; exit 1' }],
      gates:          [gateOf('a', journalLine('a'))],
      directory:      repository,
      confinedLineOf: runsAsGiven,
    });

    expect(verdict).toEqual({
      outcome: 'setup-failed', step: 'install', output: 'registry unreachable\n', gatesRun: []
    });
    expect(journal()).toEqual([]);
  });

  test('a gate the shell cannot find is one that cannot run', async () => {
    const repository = gatedRepository();

    const verdict = await playedPipeline(treeUnchangedAfter(1), {
      shellLine, prepare: [], gates: [gateOf('missing', 'no-such-example-tool --check')], directory: repository, confinedLineOf: runsAsGiven
    });

    expect(verdict.outcome).toBe('cannot-run');
  });

  test('confines a prepare step to the network and every gate to its own domains and writes, run in its in folder', async () => {
    const repository = gatedRepository();
    mkdirSync(join(repository, 'service'));
    writeFileSync(join(repository, 'service', '.gitkeep'), '');
    const confinements: [string, GateConfinement][] = [];

    await playedPipeline(treeUnchangedAfter(3), {
      shellLine,
      prepare: [{ name: 'install', run: 'true' }],
      gates:   [
        gateOf('tests', `pwd > '${join(scratchDirectory, 'tests-folder.txt')}'`, { in: 'service', network: ['registry.example.com'], writes: ['~/.cache/example'] }),
        gateOf('lint', 'true'),
      ],
      directory:      repository,
      confinedLineOf: (argv, confinement) => {
        confinements.push([String(argv.at(-1)), confinement]);
        return runsAsGiven(argv);
      },
    });

    expect(confinements).toEqual([
      ['true', { network: true, networkDomains: [], writes: ['~/.cache/example'] }],
      [`pwd > '${join(scratchDirectory, 'tests-folder.txt')}'`, { network: true, networkDomains: ['registry.example.com'], writes: ['~/.cache/example'] }],
      ['true', { network: false, networkDomains: [], writes: [] }],
    ]);
    expect(readFileSync(join(scratchDirectory, 'tests-folder.txt'), 'utf8').trim()).toEndWith('/service');
  });

  test('a folder the shell line refuses, such as a network share under cmd.exe, is a worded refusal before any confinement or process', async () => {
    const networkShareRefusingShellLine = { ...shellLine, runRefusalOf: () => 'network-share-folder' as const };
    const confinedArgvs: (readonly string[])[] = [];

    const verdict = await runPipelineInThisEnvironment({
      shellLine:      networkShareRefusingShellLine,
      prepare:        [],
      gates:          [gateOf('a', journalLine('a'))],
      directory:      scratchDirectory,
      confinedLineOf: (argv) => {
        confinedArgvs.push(argv);
        return runsAsGiven(argv);
      },
    });

    expect(verdict).toEqual({
      outcome:  'sandbox-unavailable',
      step:     'a',
      output:   `cmd.exe runs no line in the network share folder ${scratchDirectory}; move the repository to a drive letter`,
      gatesRun: [],
    });
    expect(confinedArgvs).toEqual([]);
    expect(journal()).toEqual([]);
  });

  test('a passing line whose status the shell reads as cannot-run never passes the prepare step or the gate', async () => {
    const statusBlindShellLine = { ...shellLine, exitMeaningOf: () => 'cannot-run' as const };

    const prepareVerdict = await runPipelineInThisEnvironment({
      shellLine: statusBlindShellLine, prepare: [{ name: 'install', run: 'true' }], gates: [gateOf('a', 'true')], directory: scratchDirectory, confinedLineOf: runsAsGiven
    });
    const gateVerdict = await playedPipeline(treeUnchangedAfter(1), {
      shellLine: statusBlindShellLine, prepare: [], gates: [gateOf('a', 'true')], directory: scratchDirectory, confinedLineOf: runsAsGiven
    });

    expect(prepareVerdict.outcome).toBe('setup-failed');
    expect(gateVerdict.outcome).toBe('cannot-run');
  });

  test('an empty pipeline starts no process and passes, whichever shell line it is handed', async () => {
    for (const anyShellLine of [shellLine, shellLineFor('example-platform', NO_HOST_SHELLS)]) {
      const confinedArgvs: (readonly string[])[] = [];

      const verdict = await runPipelineInThisEnvironment({
        shellLine:      anyShellLine,
        prepare:        [],
        gates:          [],
        directory:      scratchDirectory,
        confinedLineOf: (argv) => {
          confinedArgvs.push(argv);
          return runsAsGiven(argv);
        },
      });

      expect(verdict).toEqual({ outcome: 'passed', gatesRun: [] });
      expect(confinedArgvs).toEqual([]);
    }
  });

  test('a phase with no gates passes at once and runs none of the prepare steps', async () => {
    const verdict = await runPipelineInThisEnvironment({
      shellLine,
      prepare:        [{ name: 'install', run: journalLine('install') }],
      gates:          [],
      directory:      gatedRepository(),
      confinedLineOf: runsAsGiven,
    });

    expect(verdict).toEqual({ outcome: 'passed', gatesRun: [] });
    expect(journal()).toEqual([]);
  });

  test('a gate with an in folder runs its own line there, no cd and no joined line, and a red first gate stops the second', async () => {
    const repository = gatedRepository();
    mkdirSync(join(repository, 'service'));
    const firstLine = `pwd > '${join(scratchDirectory, 'first-folder.txt')}'; exit 1`;
    const spawnedLines: string[] = [];

    const verdict = await playedPipeline(treeUnchangedAfter(1), {
      shellLine,
      prepare:        [],
      gates:          [gateOf('first', firstLine, { in: 'service' }), gateOf('second', journalLine('second'))],
      directory:      repository,
      confinedLineOf: (argv) => {
        spawnedLines.push(String(argv.at(-1)));
        return runsAsGiven(argv);
      },
    });

    expect(verdict).toMatchObject({ outcome: 'failed', gate: 'first', gatesRun: ['first'] });
    expect(spawnedLines).toEqual([firstLine]);
    expect(readFileSync(join(scratchDirectory, 'first-folder.txt'), 'utf8').trim()).toEndWith('/service');
    expect(journal()).toEqual([]);
  });

  test('a refused gate line never starts, takes no gate slot and is no gate run', async () => {
    const repository = gatedRepository();
    const marker = join(scratchDirectory, 'ran.txt');
    const slotEvents: string[] = [];

    const verdict = await runPipelineInThisEnvironment({
      shellLine,
      prepare:         [],
      gates:           [gateOf('tests', `touch '${marker}'`)],
      directory:       repository,
      confinedLineOf:  () => ({ verdict: 'refused', reason: FAKE_MISSING_TOOLS_REASON }),
      acquireGateSlot: () => {
        slotEvents.push('acquired');
        return Promise.resolve(() => slotEvents.push('released'));
      },
    });

    expect(verdict).toEqual({
      outcome: 'sandbox-unavailable', step: 'tests', output: FAKE_MISSING_TOOLS_REASON, gatesRun: []
    });
    expect(existsSync(marker)).toBe(false);
    expect(slotEvents).toEqual([]);
  });

  test('a refused prepare line stops the pipeline before any gate', async () => {
    const verdict = await runPipelineInThisEnvironment({
      shellLine,
      prepare:        [{ name: 'install', run: 'true' }],
      gates:          [gateOf('tests', 'true')],
      directory:      gatedRepository(),
      confinedLineOf: () => ({ verdict: 'refused', reason: FAKE_MISSING_TOOLS_REASON }),
    });

    expect(verdict).toMatchObject({ outcome: 'sandbox-unavailable', step: 'install' });
  });

  test('takes a gate slot for each gate and releases it when the gate ends, a prepare step taking none', async () => {
    const repository = gatedRepository();
    const slotEvents: string[] = [];

    await playedPipeline(treeUnchangedAfter(3), {
      shellLine,
      prepare:         [{ name: 'install', run: 'true' }],
      gates:           [gateOf('a', 'true'), gateOf('b', 'true')],
      directory:       repository,
      confinedLineOf:  runsAsGiven,
      acquireGateSlot: () => {
        slotEvents.push('acquired');
        return Promise.resolve(() => slotEvents.push('released'));
      },
    });

    expect(slotEvents).toEqual(['acquired', 'released', 'acquired', 'released']);
  });
});

describeWhenGitIsRecorded('the gate process', () => {
  test('runs the argv it is handed in the directory it names, its two streams joined', async () => {
    const run = await runGateInThisEnvironment({ argv: ['/bin/sh', '-c', 'pwd; echo to-error >&2'], directory: scratchDirectory });

    expect(run.exitCode).toBe(0);
    expect(run.output).toContain('to-error');
    expect(run.output).toContain(scratchDirectory.split('/').at(-1) ?? scratchDirectory);
  });

  test('leads a process group of its own, so a checks line that signals its group reaches only the gate', async () => {
    const run = await runGateInThisEnvironment({ argv: ['/bin/sh', '-c', 'echo "$$ $(ps -o pgid= -p $$)"'], directory: scratchDirectory });

    const [shellProcessId, processGroupId] = run.output.trim().split(/\s+/);
    expect(processGroupId).toBe(shellProcessId);
    expect(processGroupId).not.toBe(String(process.pid));
  });

  test('a gate ended by a signal is one that cannot run', async () => {
    const run = await runGateInThisEnvironment({ argv: ['/bin/sh', '-c', 'kill -TERM $$'], directory: scratchDirectory });

    expect(run.signalCode).toBe('SIGTERM');
    expect(GateRun.gateOutcomeOf(shellLine, run)).toBe('cannot-run');
  });

  test('has the job id and the Hatch folder removed from its environment, and keeps every other variable', async () => {
    const environment = {
      [JOB_ID_VARIABLE]: 'J7', [HATCH_DIRECTORY_VARIABLE]: '/example/hatch', EXAMPLE_KEPT: 'kept', PATH: '/usr/bin:/bin'
    };

    const run = await runGateInThisEnvironment({
      argv:      ['/bin/sh', '-c', `echo "\${${JOB_ID_VARIABLE}-unset} \${${HATCH_DIRECTORY_VARIABLE}-unset} $EXAMPLE_KEPT"`],
      directory: scratchDirectory,
      environment,
    });

    expect(run.output.trim()).toBe('unset unset kept');
  });

  test('gets exactly the environment it is handed, nothing of this process', async () => {
    const run = await GateRun.runGate({
      argv: ['/usr/bin/env'], directory: scratchDirectory, environment: { EXAMPLE_ONLY: 'kept' }, spawnOptions: gateSpawnOptions
    });

    expect(run.output).toBe('EXAMPLE_ONLY=kept\n');
  });

  test('a shell line is handed to the user\'s shell through sh, so it is one argument whatever it holds', () => {
    const { argv } = shellLine.spawnRequestOf('bun test && echo "done"', '/example/line-status');

    expect(argv.at(-1)).toBe('bun test && echo "done"');
    expect(argv[0]).toBe('/bin/sh');
  });
});
