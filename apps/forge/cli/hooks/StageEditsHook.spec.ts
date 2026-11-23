/**
 * `hook stage-edits`, the edit guard of a stage of a job of an entity (E18), over neutral calls a planted adapter reads from the hook
 * input. What matters: a file change of a path outside every `--allow` folder is denied through the adapter's denial line, a new name
 * directly in a folder on the way to a stage folder (the worktree root, '/apps') above all, which no deny rule of the launch names, and a
 * path that leaves a folder by `..`; a path inside a folder, or a stage file itself, passes silently, granting nothing, a relative one
 * placed by the call's working directory; and every failure (an input the adapter cannot read, any call but a file change, no or a
 * relative path with no working directory, no `--allow`, a relative folder, an unknown option) answers deny, always at exit 0. The
 * vendor's own hook input is `ClaudeHookInput.spec.ts`'s.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { AgentToolCall }                             from '../../src/lib/agent-launch/AgentToolCall.ts';
import { fakeAgentAdapter }                               from '../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGitOutsideAnyRepository }             from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';

useRecordedGitOutsideAnyRepository();

let scratchDirectory = '';
let worktree = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stage-edits-hook');
  worktree = `${scratchDirectory}/example-worktrees/ticket-007`;
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

const PLANTED_HOOK_INPUT = 'planted hook input';
const DENIAL_PREFIX = 'denied: ';

type CallOf = () => AgentToolCall | null;

function allowArgumentsOf(): string[] {
  return ['--allow', `${worktree}/apps/gaia`, '--allow', `${worktree}/bun.lock`];
}

async function answerOf(callOf: CallOf, allowArguments: readonly string[] = allowArgumentsOf()): Promise<{ exitCode: number; output: string }> {
  const plantedCall = callOf();
  const agentAdapter = {
    ...fakeAgentAdapter(),
    toolCallOf:           (hookInput: string): AgentToolCall | null => (hookInput === PLANTED_HOOK_INPUT ? plantedCall : null),
    toolCallDenialLineOf: (reason: string): string => `${DENIAL_PREFIX}${reason}`,
  };
  const context = createCapturedCommandContext({ currentDirectory: scratchDirectory, standardInputText: PLANTED_HOOK_INPUT, agentAdapter });
  const exitCode = await runCommandLine(['hook', 'stage-edits', ...allowArguments], context);
  return { exitCode, output: context.outputText() };
}

/** A path leading with '/' lies in the worktree; any other is taken as written. */
function fileChange(path: string | null, workingDirectory: 'worktree' | null = 'worktree'): CallOf {
  return () => ({
    kind:             'file-change',
    path:             path !== null && path.startsWith('/') ? `${worktree}${path}` : path,
    workingDirectory: workingDirectory === null ? null : worktree,
  });
}

function expectDenied({ exitCode, output }: { exitCode: number; output: string }): void {
  expect(exitCode).toBe(0);
  expect(output.startsWith(`${DENIAL_PREFIX}Denied by the folders of this job's stage: `)).toBe(true);
}

describe('denies what leaves the stage\'s folders', () => {
  test.each<[string, CallOf]>([
    ['a change of a new name at the worktree root, which no deny rule of the launch names', fileChange('/new-config.json')],
    ['a change of a new name directly in a folder on the way to a stage folder', fileChange('/apps/new-app.ts')],
    ['a change in another entity\'s home', fileChange('/packages/design-system/index.ts')],
    ['a change whose path leaves a stage folder by ..', fileChange('/apps/gaia/../example/index.ts')],
    ['a change of a name that only starts with a stage folder\'s text', fileChange('/apps/gaia-extra/index.ts')],
    ['a change outside the worktree', () => ({ kind: 'file-change', path: `${scratchDirectory}/elsewhere/notes.md`, workingDirectory: worktree })],
    ['a relative path that the working directory places outside', fileChange('scripts/new.sh')],
  ])('%s is denied through the adapter\'s denial line at exit 0', async (_case, callOf) => {
    expectDenied(await answerOf(callOf));
  });

  test('the reason names the path and the stage\'s folders', async () => {
    const { output } = await answerOf(fileChange('/new-config.json'));
    expect(output).toContain(`${worktree}/new-config.json`);
    expect(output).toContain(`${worktree}/apps/gaia`);
  });
});

describe('passes what stays inside them, granting nothing', () => {
  test.each([
    ['a change of a new name in a stage folder', fileChange('/apps/gaia/src/new.ts')],
    ['a change of a stage file itself', fileChange('/bun.lock')],
    ['a change of a stage folder\'s path', fileChange('/apps/gaia')],
    ['a relative path that the working directory places inside', fileChange('apps/gaia/package.json')],
  ])('%s passes silently at exit 0', async (_case, callOf) => {
    expect(await answerOf(callOf)).toEqual({ exitCode: 0, output: '' });
  });
});

describe('answers deny on every failure, at exit 0', () => {
  test.each<[string, CallOf]>([
    ['an input the adapter cannot read', () => null],
    ['a tool the adapter does not know', () => ({ kind: 'unknown', toolName: 'NotebookEdit' })],
    ['a call that reaches nothing, which the guard does not check', () => ({ kind: 'no-reach' })],
    ['a shell command', () => ({ kind: 'shell', requestedDomains: [] })],
    ['a web fetch', () => ({ kind: 'web-fetch', url: 'https://example.net/' })],
    ['a change naming no path', fileChange(null)],
    ['a relative path with no working directory', fileChange('apps/gaia/index.ts', null)],
  ])('%s is denied', async (_case, callOf) => {
    expectDenied(await answerOf(callOf));
  });

  test.each([
    ['no --allow', () => []],
    ['an --allow with no value', () => ['--allow']],
    ['a relative stage folder', () => ['--allow', 'apps/gaia']],
    ['an unknown option', () => [...allowArgumentsOf(), '--deny', `${worktree}/apps`]],
  ])('%s denies even a path inside the stage', async (_case, allowArgumentsOfCase) => {
    expectDenied(await answerOf(fileChange('/apps/gaia/index.ts'), allowArgumentsOfCase()));
  });
});
