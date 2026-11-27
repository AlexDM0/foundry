/**
 * `gate agent`, `gate tools`, `gate look-again` and `machine agent` on a scratch board, the program check answered by its recording: a program is
 * kept only once it ran, one not there is refused writing nothing, and `machine agent` refuses a program inside a registered forge.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { MachineConfigFile }                      from '../../src/adapters/machine-config/MachineConfigFile.ts';
import { localStoreLayoutOf }                     from '../../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { fakeAgentAdapter }                       from '../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }      from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { storedLogTextOf }                        from '../testing/StoredLogText.ts';

const FROZEN_NOW = new Date('2026-11-24T09:00:00Z');
const VENDOR = fakeAgentAdapter().vendor;

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { context, exitCode } = await runWithExitCode(commandLineArguments);
  expect(exitCode, `\`${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

function storedPipeline(): Record<string, unknown> {
  return JSON.parse(readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).pipelineRecordPath, 'utf8')) as Record<string, unknown>;
}

function monitorFolder(): string {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
  return context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('gate-agent-verbs', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the agent verbs', () => {
  test('gate agent keeps a program that runs as its path names it, and refuses one that is not there with nothing written', async () => {
    await run(['gate', 'none']);
    await run(['gate', 'agent', process.execPath]);
    expect(storedPipeline()['agent']).toEqual({ vendor: VENDOR, program: { pinned: process.execPath } });

    const before = readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).pipelineRecordPath, 'utf8');
    const refused = await runWithExitCode(['gate', 'agent', '/opt/example/bin/missing-agent']);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('is not there');
    expect(readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).pipelineRecordPath, 'utf8')).toBe(before);
  });

  test('gate agent machine is refused while the machine names no program, and kept once machine agent stored one that runs', async () => {
    await run(['gate', 'none']);
    const refused = await runWithExitCode(['gate', 'agent', 'machine']);
    expect([refused.exitCode, refused.context.errorText()]).toEqual([1, expect.stringContaining('the machine names none')]);

    expect(JSON.parse((await run(['machine', 'agent', process.execPath, '--json'])).outputText())).toMatchObject({ outcome: 'done', programPath: process.execPath });
    expect(MachineConfigFile.programPathOf(MachineConfigFile.read(monitorFolder()), VENDOR)).toBe(process.execPath);
    await run(['gate', 'agent', 'machine']);
    expect(storedPipeline()['agent']).toEqual({ vendor: VENDOR, program: { follows: 'machine' } });
    expect(JSON.parse((await run(['machine', 'agent', '--json'])).outputText())).toMatchObject({ vendor: VENDOR, programPath: process.execPath });
  });

  test('machine agent refuses a program inside the repository of any forge the machine registry names, with nothing written', async () => {
    mkdirSync(monitorFolder(), { recursive: true });
    writeFileSync(join(monitorFolder(), 'projects.json'), JSON.stringify({ version: 2, projects: { 'example-tracker': { root: repositoryDirectory } } }));
    const programInsideAForge = join(repositoryDirectory, 'bin', 'example-agent');

    const refused = await runWithExitCode(['machine', 'agent', programInsideAForge]);
    expect([refused.exitCode, refused.context.errorText()]).toEqual([1, expect.stringContaining('lies inside a tracked repository')]);
    expect(MachineConfigFile.programPathOf(MachineConfigFile.read(monitorFolder()), VENDOR)).toBeNull();
  });

  test('gate tools keeps a named path, refuses a name found nowhere, and pipeline removes the list', async () => {
    await run(['gate', 'none']);
    await run(['gate', 'tools', `bun=${process.execPath}`]);
    expect(storedPipeline()['tools']).toEqual([{ name: 'bun', path: process.execPath }]);
    expect((await runWithExitCode(['gate', 'tools', 'example-missing-tool'])).exitCode).toBe(1);
    await run(['gate', 'tools', 'pipeline']);
    expect(Object.hasOwn(storedPipeline(), 'tools')).toBe(false);
    expect(storedLogTextOf(repositoryDirectory).split('\n').filter((line) => line.includes('"pipeline-tools-set"'))).toHaveLength(2);
  });

  test('gate look-again writes no record while no job stands not launched', async () => {
    await run(['gate', 'none']);
    await run(['gate', 'look-again']);
    expect(storedLogTextOf(repositoryDirectory)).not.toContain('"job-launch-retried"');
  });
});
