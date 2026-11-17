/**
 * `hook stage-edits`, the edit guard of a stage of a job of an entity (E18). What matters: an Edit or Write of a path outside every
 * `--allow` folder is denied through the PreToolUse JSON, a new name directly in a folder on the way to a stage folder (the worktree root,
 * '/apps') above all, which no deny rule of the launch names, and a path that leaves a folder by `..`; a path inside a folder, or a stage
 * file itself, passes silently, granting nothing, a relative one placed by the call's `cwd`; and every failure (no input, not JSON, an
 * unknown tool, no or a relative `file_path` with no `cwd`, no `--allow`, a relative folder, an unknown option) answers deny, always at
 * exit 0.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                 from '../Main.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';

let scratchDirectory = '';
/** The worktree the calls name: under the scratch root, since the isolation check reads a piped hook input's `cwd`. */
let worktree = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stage-edits-hook');
  worktree = `${scratchDirectory}/example-worktrees/ticket-007`;
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

type CallOf = () => unknown;

function allowArgumentsOf(): string[] {
  return ['--allow', `${worktree}/apps/gaia`, '--allow', `${worktree}/bun.lock`];
}

async function answerOf(callOf: CallOf, allowArguments: readonly string[] = allowArgumentsOf()): Promise<{ exitCode: number; output: string }> {
  const hookInput = callOf();
  const standardInputText = typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput);
  const context = createCapturedCommandContext({ currentDirectory: scratchDirectory, standardInputText });
  const exitCode = await runCommandLine(['hook', 'stage-edits', ...allowArguments], context);
  return { exitCode, output: context.outputText() };
}

/** A path leading with '/' lies in the worktree; any other is taken as written. */
function fileCall(toolName: string, filePath: unknown, workingDirectory: 'worktree' | null = 'worktree'): CallOf {
  const placedPathOf = (path: unknown): unknown => (typeof path === 'string' && path.startsWith('/') ? `${worktree}${path}` : path);
  return () => ({
    hook_event_name: 'PreToolUse',
    cwd:             workingDirectory === null ? null : worktree,
    tool_name:       toolName,
    tool_input:      { file_path: placedPathOf(filePath), content: 'example' },
  });
}

function expectDenied({ exitCode, output }: { exitCode: number; output: string }): void {
  expect(exitCode).toBe(0);
  expect(JSON.parse(output)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
}

describe('denies what leaves the stage\'s folders', () => {
  test.each([
    ['a Write of a new name at the worktree root, which no deny rule of the launch names', fileCall('Write', '/new-config.json')],
    ['an Edit of a new name directly in a folder on the way to a stage folder', fileCall('Edit', '/apps/new-app.ts')],
    ['a Write in another entity\'s home', fileCall('Write', '/packages/design-system/index.ts')],
    ['a Write whose path leaves a stage folder by ..', fileCall('Write', '/apps/gaia/../example/index.ts')],
    ['a Write of a name that only starts with a stage folder\'s text', fileCall('Write', '/apps/gaia-extra/index.ts')],
    ['a Write outside the worktree', () => ({ cwd: worktree, tool_name: 'Write', tool_input: { file_path: `${scratchDirectory}/elsewhere/notes.md` } })],
    ['a relative path that the cwd places outside', fileCall('Write', 'scripts/new.sh')],
  ])('%s is denied through the PreToolUse JSON at exit 0', async (_case, callOf) => {
    expectDenied(await answerOf(callOf));
  });

  test('the reason names the path and the stage\'s folders', async () => {
    const { output } = await answerOf(fileCall('Write', '/new-config.json'));
    const reason = (JSON.parse(output) as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain(`${worktree}/new-config.json`);
    expect(reason).toContain(`${worktree}/apps/gaia`);
  });
});

describe('passes what stays inside them, granting nothing', () => {
  test.each([
    ['a Write of a new name in a stage folder', fileCall('Write', '/apps/gaia/src/new.ts')],
    ['an Edit of a stage file itself', fileCall('Edit', '/bun.lock')],
    ['an Edit of a stage folder\'s path', fileCall('Edit', '/apps/gaia')],
    ['a relative path that the cwd places inside', fileCall('Edit', 'apps/gaia/package.json')],
  ])('%s passes silently at exit 0', async (_case, callOf) => {
    const { exitCode, output } = await answerOf(callOf);
    expect(exitCode).toBe(0);
    expect(output).toBe('');
  });
});

describe('answers deny on every failure, at exit 0', () => {
  test.each([
    ['no input', () => ''],
    ['input that is not JSON', () => '{not json'],
    ['input that is not a JSON object', () => '[]'],
    ['a tool the guard does not check', fileCall('NotebookEdit', '/apps/gaia/notes.ipynb')],
    ['a call naming no tool', () => ({ tool_input: { file_path: `${worktree}/apps/gaia/index.ts` } })],
    ['a call with no file_path', fileCall('Write', undefined)],
    ['a file_path that is not text', fileCall('Write', ['apps/gaia/index.ts'])],
    ['a relative file_path with no cwd', fileCall('Write', 'apps/gaia/index.ts', null)],
  ])('%s is denied', async (_case, callOf) => {
    expectDenied(await answerOf(callOf));
  });

  test.each([
    ['no --allow', () => []],
    ['an --allow with no value', () => ['--allow']],
    ['a relative stage folder', () => ['--allow', 'apps/gaia']],
    ['an unknown option', () => [...allowArgumentsOf(), '--deny', `${worktree}/apps`]],
  ])('%s denies even a path inside the stage', async (_case, allowArgumentsOfCase) => {
    expectDenied(await answerOf(fileCall('Write', '/apps/gaia/index.ts'), allowArgumentsOfCase()));
  });
});
