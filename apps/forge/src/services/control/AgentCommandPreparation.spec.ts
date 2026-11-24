/**
 * What a command about the forge's agent settles before the hold, on the answers the real program check recorded. What matters: a
 * chosen program that does not run refuses the command with its cause and path, naming the agent; one that runs passes the command as it
 * came and its run reaches the views; a tool named alone is found in the folders in order and one found nowhere is refused; and a command
 * of any other kind passes untouched.
 */
import { describe, expect, test } from 'bun:test';

import { createPosixLaunchEnvironment }                                 from '../../lib/agent-launch/PosixLaunchEnvironment.ts';
import { createPosixExecutableResolver }                                from '../../lib/executable-resolver/PosixExecutableResolver.ts';
import type { AgentProgramCheck }                                       from '../../shared/@types/AgentProgramCheck.ts';
import type { ControlCommand }                                          from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                             from '../../shared/OperationRefusal.ts';
import { fakeAgentAdapter }                                             from '../../testing/FakeAgentAdapter.ts';
import { PROGRAM_CHECK_RECORDING, recordedProgramCheckRun }             from '../../testing/RecordedProgramChecks.ts';
import { createScratchDirectory, removeScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import { type AgentCommandPreparationContext, AgentCommandPreparation } from './AgentCommandPreparation.ts';

const ADAPTER = fakeAgentAdapter();
const RUNS = '/opt/example/bin/agent';
const FAILS = '/opt/example/bin/failing-agent';
const PROGRAMS: ReadonlySet<string> = new Set([RUNS, FAILS, '/home/example/.bun/bin/bun', '/usr/bin/bun', '/usr/bin/git']);

const RESOLVER = createPosixExecutableResolver({
  lookUp:        () => null,
  realPathOf:    (path) => path,
  programKindOf: (path) => (PROGRAMS.has(path) ? 'program' : 'missing'),
});

const TOOL_FOLDERS: readonly string[] = ['/home/example/.bun/bin', '/usr/bin'];

function contextOf(monitorFolder: string, recorded: AgentProgramCheck[]): AgentCommandPreparationContext {
  return {
    check: {
      adapter:              ADAPTER,
      resolver:             RESOLVER,
      forbiddenRoots:       [],
      launchEnvironment:    createPosixLaunchEnvironment(() => []),
      inheritedEnvironment: {},
      run:                  recordedProgramCheckRun({ [RUNS]: PROGRAM_CHECK_RECORDING.ANSWERS, [FAILS]: PROGRAM_CHECK_RECORDING.FAILS }),
      timeoutMilliseconds:  1000,
    },
    monitorFolder,
    toolSearch:  { folders: TOOL_FOLDERS, pathsOf: (name) => TOOL_FOLDERS.map((folder) => `${folder}/${name}`) },
    recordCheck: (check) => recorded.push(check),
  };
}

async function refusalOf(attempt: () => Promise<unknown>): Promise<unknown> {
  try {
    await attempt();
  } catch (thrown) {
    return thrown instanceof OperationRefusal ? thrown.detail : thrown;
  }
  throw new Error('the command was not refused');
}

function withMonitorFolder(check: (monitorFolder: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const monitorFolder = createScratchDirectory('agent-command-preparation');
    try {
      await check(monitorFolder);
    } finally {
      removeScratchDirectory(monitorFolder);
    }
  };
}

describe('a chosen program', () => {
  test('that runs passes the command as it came, and its run reaches the views', withMonitorFolder(async (monitorFolder) => {
    const recorded: AgentProgramCheck[] = [];
    const command: ControlCommand = { kind: 'pipeline-agent-set', agent: { vendor: ADAPTER.vendor, program: { pinned: RUNS } } };
    expect(await AgentCommandPreparation.preparedCommandOf(command, contextOf(monitorFolder, recorded))).toBe(command);
    expect(recorded).toEqual([{ verdict: 'runs', programPath: RUNS, version: '1.2.3 (Example Agent)' }]);
  }));

  test('that fails, or follows a machine that names none, refuses the command with its cause, its path and the agent', withMonitorFolder(async (monitorFolder) => {
    const context = contextOf(monitorFolder, []);
    const failing: ControlCommand = { kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: ADAPTER.vendor, program: { pinned: FAILS } } };
    expect(await refusalOf(() => AgentCommandPreparation.preparedCommandOf(failing, context))).toEqual({
      kind: 'agent-program-does-not-run', cause: 'failed', programPath: FAILS, agentName: ADAPTER.displayName
    });
    const following: ControlCommand = {
      kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: { vendor: ADAPTER.vendor, program: { follows: 'machine' } }
    };
    expect(await refusalOf(() => AgentCommandPreparation.preparedCommandOf(following, context))).toMatchObject({ cause: 'no-machine-program' });
  }));

  test('the machine\'s program is checked as a pinned one would be', withMonitorFolder(async (monitorFolder) => {
    await AgentCommandPreparation.requireRunningProgram(ADAPTER.vendor, RUNS, contextOf(monitorFolder, []));
    expect(await refusalOf(() => AgentCommandPreparation.requireRunningProgram(ADAPTER.vendor, '/opt/example/bin/gone', contextOf(monitorFolder, []))))
      .toMatchObject({ cause: 'not-there', programPath: '/opt/example/bin/gone' });
  }));
});

describe('a tool named alone', () => {
  test('is found in the first folder that holds it, a named path kept, and null passes as the list removed', withMonitorFolder(async (monitorFolder) => {
    const command: ControlCommand = { kind: 'pipeline-tools-set', tools: [{ name: 'bun', path: '' }, { name: 'git', path: '/opt/git/bin/git' }] };
    const found = [{ name: 'bun', path: '/home/example/.bun/bin/bun' }, { name: 'git', path: '/opt/git/bin/git' }];
    expect(await AgentCommandPreparation.preparedCommandOf(command, contextOf(monitorFolder, []))).toEqual({ kind: 'pipeline-tools-set', tools: found });
    const removed: ControlCommand = { kind: 'pipeline-tools-set', tools: null };
    expect(await AgentCommandPreparation.preparedCommandOf(removed, contextOf(monitorFolder, []))).toBe(removed);
  }));

  test('in a draft edit is found too, and one found nowhere refuses the command naming where forge looked', withMonitorFolder(async (monitorFolder) => {
    const edit: ControlCommand = {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ target: 'tools', value: [{ name: 'git', path: '' }] }]
    };
    const foundEdits = [{ target: 'tools' as const, value: [{ name: 'git', path: '/usr/bin/git' }] }];
    expect(await AgentCommandPreparation.preparedCommandOf(edit, contextOf(monitorFolder, []))).toEqual({ ...edit, edits: foundEdits });
    const missing: ControlCommand = { kind: 'pipeline-tools-set', tools: [{ name: 'pnpm', path: '' }] };
    const refusal = await refusalOf(() => AgentCommandPreparation.preparedCommandOf(missing, contextOf(monitorFolder, [])));
    expect(refusal).toEqual({ kind: 'tool-not-found', name: 'pnpm', searchedFolders: ['/home/example/.bun/bin', '/usr/bin'] });
  }));
});

test('a command of any other kind passes untouched and runs nothing', withMonitorFolder(async (monitorFolder) => {
  const recorded: AgentProgramCheck[] = [];
  const command: ControlCommand = { kind: 'concurrency-set', limit: 3 };
  expect(await AgentCommandPreparation.preparedCommandOf(command, contextOf(monitorFolder, recorded))).toBe(command);
  expect(recorded).toEqual([]);
}));
