/**
 * The network guard hook as a job's settings file holds it, run with a `PATH` that is one empty folder. What matters: the hook names the
 * Bun runtime by its absolute path and the entry script as an argument, so it still starts with no `bun` on `PATH` and denies a call to a
 * domain outside its list. A hook that did not start would be a non-blocking error, and the call would go on unchecked.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { WorkerProfile }                             from '../../src/lib/agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }                           from '../../src/lib/claude-code/ClaudeCodeAdapter.ts';
import { GuardCommand }                                   from '../../src/services/overseer/GuardCommand.ts';
import { WorkerProfiles }                                 from '../../src/services/overseer/WorkerProfiles.ts';
import { ToolRuntimeUtil }                                from '../../src/shared/ToolRuntimeUtil.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { runRenderedCommandLine }                         from '../testing/CliProcess.ts';

const ALLOWED_DOMAIN = 'registry.example.com';

let scratch = '';

beforeEach(() => {
  scratch = createScratchDirectory('guard-empty-path');
});

afterEach(() => removeScratchDirectory(scratch));

function profileWithGuard(repository: string): WorkerProfile {
  const entryScript = join(import.meta.dir, '..', '..', 'agent-progress.ts');
  const verdict = GuardCommand.guardCommandOf([process.execPath, ...ToolRuntimeUtil.isolatingArgumentsOfThisCheckout(), entryScript], repository);
  if (verdict.verdict !== 'found') throw new Error(`the guard command was refused: ${JSON.stringify(verdict)}`);
  return {
    writableRoots:          [],
    deniedWritableRoots:    [],
    deniedReadableRoots:    [],
    bashNetworkDomains:     [ALLOWED_DOMAIN],
    webNetworkDomains:      [ALLOWED_DOMAIN],
    hatchDirectory:         join(repository, 'hatch'),
    allowedCommandPrefixes: [],
    deniedCommandPrefixes:  [],
    askUser:                false,
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       repository,
    gitHooksDirectory:      join(repository, '.githooks'),
    commitSigning:          { kind: 'unsigned' },
    networkDomainGuard:     WorkerProfiles.networkDomainGuardOf([ALLOWED_DOMAIN], verdict.command),
  };
}

/** The first `PreToolUse` hook of the settings file the vendor adapter writes for this host. */
function renderedGuardCommandLine(repository: string): string[] {
  const jobFilesDirectory = join(scratch, 'job-files');
  const plan = claudeCodeAdapterFor(process.platform).planOf({
    programPath:      join(scratch, 'claude'),
    sessionId:        'session-example',
    resume:           false,
    workingDirectory: repository,
    homeDirectory:    scratch,
    firstMessage:     'Build.',
    roleBrief:        'Builder.',
    model:            'opus',
    effort:           'medium',
    environment:      {},
    profile:          profileWithGuard(repository),
    confinement:      'unconfined-by-design',
    jobFilesDirectory,
    reportSchema:     null,
  });
  const settingsText = plan.files.find((file) => file.path === join(jobFilesDirectory, 'settings.json'))?.text ?? '{}';
  const settings = JSON.parse(settingsText) as { hooks?: { PreToolUse: { hooks: { command: string; args: string[] }[] }[] } };
  const hook = settings.hooks?.PreToolUse[0]?.hooks[0];
  if (hook === undefined) throw new Error(`the settings hold no guard hook: ${settingsText}`);
  return [hook.command, ...hook.args];
}

test('with PATH one empty folder, the rendered guard still starts and denies a WebFetch outside its list', async () => {
  const repository = createScratchDirectory('guard-empty-path-repository');
  const emptyFolder = createScratchDirectory('guard-empty-path-folder');
  try {
    const hookInput = { hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://example.net/' } };
    const result = await runRenderedCommandLine(renderedGuardCommandLine(repository), {
      currentDirectory: repository,
      environment:      { PATH: emptyFolder },
      standardInput:    JSON.stringify(hookInput),
    });

    expect(result.exitCode, result.standardError).toBe(0);
    expect(JSON.parse(result.standardOutput)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
  } finally {
    removeScratchDirectory(repository);
    removeScratchDirectory(emptyFolder);
  }
});
