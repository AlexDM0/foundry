/**
 * The `gate` verbs over a scratch tracker. What matters: no pipeline and `gate none` are told apart in `pipeline.json`, `gate list` and the
 * log; the verbs are the file's writers, through the lock, accepted with a ticket in flight, and write version 2, a gate in every phase
 * unless `--phases` names some, each phase's run order set by `gate order`; the hashes printed are the content hash and one per phase, the
 * content hash moving on any change and a phase hash only on its own phase's; `gate list` in text names the phases of a gate that runs in
 * only some, since a line with none reads as every phase; a malformed file is refused, never overwritten, and a refused write leaves the
 * progress file, the pipeline and the log as they were. An older file is `cli/OlderPipelineRefusal.spec.ts`'s.
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
}                                             from 'bun:test';
import { PipelineFile }                           from '../../src/adapters/pipeline/PipelineFile.ts';
import { platformPortsFor }                       from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { PLATFORM_HOST_FACTS }                    from '../../src/shared/PlatformHostFacts.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }        from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                        from '../testing/ReadyTicketFiling.ts';
import { storedLogTextOf }                        from '../testing/StoredLogText.ts';

const FROZEN_NOW = new Date('2026-10-30T09:00:00Z');

let repositoryDirectory = '';

const pipelineFilePath = (): string => workspacePathsFor(repositoryDirectory).pipelineFilePath;

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { context, exitCode } = await runWithExitCode(commandLineArguments);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

interface ListedPipeline {
  pipelineIsSet: boolean;
  contentHash:   string | null;
  phaseHashes:   Record<'build' | 'review' | 'merge', string> | null;
  prepare:       unknown[];
  gates:         { name: string; run: string }[];
}

async function listed(): Promise<ListedPipeline> {
  return JSON.parse((await run(['gate', 'list', '--json'])).outputText()) as Awaited<ReturnType<typeof listed>>;
}

function storedFiles(): string[] {
  const workspace = workspacePathsFor(repositoryDirectory);
  return [workspace.progressFilePath, workspace.logFilePath, workspace.pipelineFilePath].map((filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''));
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('gate-pipeline-verbs', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the gate pipeline verbs', () => {
  test('with no pipeline gate list prints it unset with no gates, and writes no file', async () => {
    expect(await listed()).toEqual({
      pipelineIsSet: false, contentHash: null, phaseHashes: null, prepare: [], gates: []
    });
    expect((await run(['gate', 'list'])).outputText()).toContain('checks-not-set');
    expect(existsSync(pipelineFilePath())).toBe(false);
  });

  test('gate none stores an empty gate list on purpose, logs it once, and gate list prints it set with no gates', async () => {
    await run(['gate', 'none']);

    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toEqual({
      version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    });
    expect(storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line.includes('"pipeline-gates-none"'))).toHaveLength(1);
    const pipeline = await listed();
    expect(pipeline.pipelineIsSet).toBe(true);
    expect(pipeline.gates).toEqual([]);
  });

  test('gate approval is refused at exit 1 with no pipeline stored, so the switch never lifts checks-not-set', async () => {
    const refusal = await runWithExitCode(['gate', 'approval', 'tickets', 'off']);
    expect(refusal.exitCode).toBe(1);
    expect(refusal.context.errorText()).toContain('No gate pipeline is stored');
    expect(existsSync(pipelineFilePath())).toBe(false);
  });

  test('gate approval tickets off and on write approvals.tickets, log each change, and gate list prints it', async () => {
    await run(['gate', 'none']);
    await run(['gate', 'approval', 'tickets', 'off']);
    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toEqual({
      version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, approvals: { tickets: false },
    });
    expect(JSON.parse((await run(['gate', 'list', '--json'])).outputText())).toMatchObject({ approvals: { tickets: false } });
    expect((await run(['gate', 'list'])).outputText()).toContain('Ticket review: off');

    await run(['gate', 'approval', 'tickets', 'on']);
    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toMatchObject({ approvals: { tickets: true } });
    expect(storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line.includes('"pipeline-approval-set"'))).toEqual([
      expect.stringContaining('"state":"off"'),
      expect.stringContaining('"state":"on"'),
    ]);
  });

  test('gate approval merge on and off write approvals.merge, log each change, and gate list prints it, off with no key', async () => {
    await run(['gate', 'none']);
    expect((await run(['gate', 'list'])).outputText()).toContain('Merge approval: off');
    await run(['gate', 'approval', 'merge', 'on']);
    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toEqual({
      version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, approvals: { merge: true },
    });
    expect(JSON.parse((await run(['gate', 'list', '--json'])).outputText())).toMatchObject({ approvals: { merge: true } });
    expect((await run(['gate', 'list'])).outputText()).toContain('Merge approval: on');

    await run(['gate', 'approval', 'merge', 'off']);
    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toMatchObject({ approvals: { merge: false } });
    expect(storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line.includes('"pipeline-approval-set"'))).toEqual([
      expect.stringContaining('"approval":"merge","state":"on"'),
      expect.stringContaining('"approval":"merge","state":"off"'),
    ]);
  });

  test('gate approval refuses an unknown approval or a switch that is not on or off, and writes nothing', async () => {
    const before = storedFiles();
    for (const words of [['merges', 'on'], ['tickets', 'yes'], ['tickets']]) {
      expect((await runWithExitCode(['gate', 'approval', ...words])).exitCode, words.join(' ')).toBe(1);
    }
    expect(storedFiles()).toEqual(before);
  });

  test('gate prepare, add and remove write the pipeline in run order, a same-named gate replaced where it stands', async () => {
    await run(['gate', 'prepare', 'install', '--', 'bun', 'install']);
    await run(['gate', 'add', 'types', '--defined-by', 'tsconfig.json', '--', 'bun run typecheck']);
    await run(['gate', 'add', 'test', '--in', 'packages/example', '--writes', '~/.cache/example', '--overseer-only', '--', 'bun test']);
    await run(['gate', 'add', 'types', '--', 'tsc --noEmit']);
    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toMatchObject({ phases: { build: ['types', 'test'], review: ['types', 'test'], merge: ['types', 'test'] } });
    await run(['gate', 'remove', 'test']);

    expect(JSON.parse(readFileSync(pipelineFilePath(), 'utf8'))).toEqual({
      version: 2,
      prepare: [{ name: 'install', run: 'bun install' }],
      gates:   [{ name: 'types', run: 'tsc --noEmit' }],
      phases:  { build: ['types'], review: ['types'], merge: ['types'] },
    });
  });

  test('a gate added while a ticket is in progress is accepted, and the hashes gate list prints follow the pipeline', async () => {
    await run(['gate', 'add', 'test', '--', 'bun test']);
    const before = await listed();
    const added = JSON.parse((await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Example checkout page', '--json'])).outputText()) as { id: string };
    await run(['ticket', 'start', added.id]);

    await run(['gate', 'add', 'lint', '--phases', 'merge', '--', 'bun run lint']);

    const after = await listed();
    expect(after.contentHash).not.toBeNull();
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.phaseHashes?.merge).not.toBe(before.phaseHashes?.merge);
    expect([after.phaseHashes?.build, after.phaseHashes?.review]).toEqual([before.phaseHashes?.build, before.phaseHashes?.review]);
  });

  test('gate add --phases writes a version 2 file with the gate in those phases, and gate order reorders one phase', async () => {
    await run(['gate', 'add', 'types', '--', 'bun run typecheck']);
    await run(['gate', 'add', 'test', '--phases', 'build,merge', '--', 'bun test']);
    await run(['gate', 'add', 'lint', '--phases', 'merge', '--', 'bun run lint']);

    const ordered = JSON.parse((await run(['gate', 'order', 'merge', 'lint', 'types', 'test', '--json'])).outputText()) as { pipeline: unknown; contentHash: string | null };

    const stored = JSON.parse(readFileSync(pipelineFilePath(), 'utf8')) as { version: number; phases: unknown };
    expect(stored.version).toBe(2);
    expect(stored.phases).toEqual({ build: ['types', 'test'], review: ['types'], merge: ['lint', 'types', 'test'] });
    expect(ordered.pipeline).toEqual(stored);
    expect(ordered.contentHash).toBe((await listed()).contentHash);
    expect(storedLogTextOf(repositoryDirectory)).toContain('"kind":"pipeline-gates-ordered","fields":{"phase":"merge","names":["lint","types","test"]}');
  });

  test('gate list in text names the phases of a gate that runs in only some, and marks a gate in every phase with none', async () => {
    await run(['gate', 'add', 'types', '--', 'bun run typecheck']);
    await run(['gate', 'add', 'test', '--phases', 'build,merge', '--', 'bun test']);
    await run(['gate', 'add', 'lint', '--phases', 'merge', '--', 'bun run lint']);

    const gateLines = (await run(['gate', 'list'])).outputText().split('\n').filter((line) => line.startsWith('  '));

    expect(gateLines).toEqual(['  types: bun run typecheck', '  test (runs in build, merge): bun test', '  lint (runs in merge): bun run lint']);
  });

  test.each([
    ['an unknown phase', ['gate', 'add', 'lint', '--phases', 'build,deploy', '--', 'bun run lint'], 'Name a phase: build, review, merge.'],
    ['a phase named twice', ['gate', 'add', 'lint', '--phases', 'merge,merge', '--', 'bun run lint'], 'Name each phase once in --phases.'],
    ['an order with no phase', ['gate', 'order', 'deploy', 'test'], 'Name a phase: build, review, merge.'],
    ['an order with no gate', ['gate', 'order', 'merge'], 'Name every gate the merge phase runs, in the new order.'],
    ['an order leaving a gate out', ['gate', 'order', 'merge', 'test'], 'The merge phase was not reordered: name each of types, test once, and no other gate.'],
    ['an order naming an unknown gate', ['gate', 'order', 'merge', 'test', 'lint'], 'There is no gate lint: the gates are types, test.'],
  ])('%s is refused at exit 1 with every file left as it was', async (_case, commandLine, named) => {
    await run(['gate', 'add', 'types', '--', 'bun run typecheck']);
    await run(['gate', 'add', 'test', '--', 'bun test']);
    const before = storedFiles();

    const refused = await runWithExitCode(commandLine);

    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain(named);
    expect(storedFiles()).toEqual(before);
  });

  test('an unknown gate, and a write over a malformed pipeline.json, are refused at exit 1 with every file left as it was', async () => {
    await run(['gate', 'add', 'test', '--', 'bun test']);
    const before = storedFiles();
    const unknown = await runWithExitCode(['gate', 'remove', 'lint']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.context.errorText()).toContain('There is no gate lint: the gates are test.');
    expect(storedFiles()).toEqual(before);

    writeFileSync(pipelineFilePath(), '{ "version": 2, "prepare": [], "gates": [{ "run": "bun test" }], "phases": { "build": [], "review": [], "merge": [] } }\n');
    const malformedBefore = storedFiles();
    for (const verb of [['gate', 'none'], ['gate', 'list']]) {
      const refused = await runWithExitCode(verb);
      expect(refused.exitCode, verb.join(' ')).toBe(1);
      expect(refused.context.errorText()).toContain('gates[0] has no name');
    }
    expect(storedFiles()).toEqual(malformedBefore);
  });

  test.each([
    ['~/.bun, which holds a bin folder', '~/.bun', 'holds a bin folder'],
    ['~/.bun/bin, a bin folder', '~/.bun/bin', 'holds a bin folder'],
    ['a folder holding one on PATH', '~/.local', 'folder on PATH'],
    ['a folder inside one on PATH', '/opt/example-tools/bin-cache', 'folder on PATH'],
    ['a relative path', 'cache', 'absolute or ~/ folder'],
  ])('gate add --writes refuses %s at exit 1 and writes nothing', async (_case, path, named) => {
    mkdirSync(join(repositoryDirectory, 'spec-home', '.bun', 'bin'), { recursive: true });
    const before  = storedFiles();
    const context = createCapturedCommandContext({
      currentDirectory:     repositoryDirectory,
      now:                  () => FROZEN_NOW,
      executableSearchPath: [join(repositoryDirectory, 'spec-home', '.local', 'bin'), '/opt/example-tools'],
    });

    expect(await runCommandLineWithOverseerMoves(['gate', 'add', 'test', '--writes', '~/.bun/install/cache', '--writes', path, '--', 'bun test'], context)).toBe(1);
    expect(context.errorText()).toContain(named);
    expect(storedFiles()).toEqual(before);
  });

  test('under the win32 path module gate add --writes C:\\cache is stored and reads back', async () => {
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory,
      now:              () => FROZEN_NOW,
      platformPorts:    platformPortsFor('win32', PLATFORM_HOST_FACTS),
    });

    expect(await runCommandLineWithOverseerMoves(['gate', 'add', 'test', '--writes', 'C:\\cache', '--writes', '~\\AppData\\cache', '--', 'bun test'], context)).toBe(0);
    expect(PipelineFile.read(pipelineFilePath())).toEqual({
      verdict:  'readable',
      pipeline: {
        version: 2,
        prepare: [],
        gates:   [{ name: 'test', run: 'bun test', writes: ['C:\\cache', '~\\AppData\\cache'] }],
        phases:  { build: ['test'], review: ['test'], merge: ['test'] },
      },
    });
  });

  test('a line longer than the shell line port\'s limit is refused when stored, by gate add and gate prepare, and one at the limit is stored', async () => {
    const nativePorts = platformPortsFor(process.platform, PLATFORM_HOST_FACTS);
    const limitedShellLine = { ...nativePorts.shellLine, lineLimitCharacters: 12 };
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory,
      now:              () => FROZEN_NOW,
      platformPorts:    { ...nativePorts, shellLine: limitedShellLine },
    });
    const before = storedFiles();

    expect(await runCommandLineWithOverseerMoves(['gate', 'add', 'test', '--', 'bun test --all'], context)).toBe(1);
    expect(await runCommandLineWithOverseerMoves(['gate', 'prepare', 'install', '--', 'bun install --x'], context)).toBe(1);
    expect(context.errorText()).toContain('The command is 14 characters, and this machine\'s shell runs at most 12; nothing was stored.');
    expect(context.errorText()).toContain('The command is 15 characters, and this machine\'s shell runs at most 12; nothing was stored.');
    expect(storedFiles()).toEqual(before);
    expect(await runCommandLineWithOverseerMoves(['gate', 'add', 'test', '--', 'bun test --a'], context)).toBe(0);
  });

  test('a command missing after -- is refused with the usage', async () => {
    const refused = await runWithExitCode(['gate', 'add', 'test', 'bun test']);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('Put the command after --.');
    expect(existsSync(pipelineFilePath())).toBe(false);
  });
});
