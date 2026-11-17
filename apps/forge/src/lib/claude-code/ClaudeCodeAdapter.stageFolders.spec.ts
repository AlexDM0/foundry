/**
 * A session of a stage of a job of an entity (E18). Auto mode lets Edit and Write reach any path no deny rule names, so what matters is
 * both sides: the allow rules name the stage's folders and files, each as itself and as a folder, never the whole worktree; and every
 * denied edit root is a deny rule for Edit and Write. The deny rules name only the paths at launch, so the stage edit guard runs before
 * every Edit and Write in exec form, beside the network guard when there is one; a guard that cannot start denies Edit and Write
 * outright. Bash is not stopped there: the sandbox's writes stay the profile's own. A profile without stage folders renders as it always
 * did, with no hook.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentLaunchRequest } from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }      from '../agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }    from './ClaudeCodeAdapter.ts';

const HOME = '/home/alex-example';
const REPOSITORY = `${HOME}/example-repository`;
const WORKTREE = `${REPOSITORY}/.example-worktrees/ticket-7`;
const JOB_FILES = `${REPOSITORY}/.example-data/jobs/J1`;

const PROFILE: WorkerProfile = {
  writableRoots:          [],
  deniedWritableRoots:    [`${REPOSITORY}/.example-data`, `${WORKTREE}/.claude`, `${WORKTREE}/apps/example/.claude`],
  deniedReadableRoots:    [`${HOME}/.ssh`],
  bashNetworkDomains:     [],
  webNetworkDomains:      'none',
  extraWritableDirectory: `${REPOSITORY}/.example-worktrees/hatch/J1`,
  allowedCommandPrefixes: [['git', 'commit']],
  deniedCommandPrefixes:  [['git', 'push']],
  askUser:                true,
  skills:                 false,
  subagents:              [],
  attribution:            'none',
  instructionsRoot:       REPOSITORY,
  gitHooksDirectory:      `${REPOSITORY}/.githooks`,
  commitSigning:          { kind: 'unsigned' },
  networkDomainGuard:     null,
};

const STAGE_FOLDERS = [`${WORKTREE}/apps/example`, `${WORKTREE}/bun.lock`];
const GUARD_RUNTIME = `${HOME}/.bun/bin/bun`;
const STAGE_GUARD_ARGUMENTS = [`${HOME}/forge/agent-progress.ts`, 'hook', 'stage-edits', '--allow', `${WORKTREE}/apps/example`, '--allow', `${WORKTREE}/bun.lock`];

const STAGE_PROFILE: WorkerProfile = {
  ...PROFILE,
  stageFolders:    STAGE_FOLDERS,
  deniedEditRoots: [`${WORKTREE}/packages`, `${WORKTREE}/scripts`],
  stageEditGuard:  { stageFolders: STAGE_FOLDERS, programPath: GUARD_RUNTIME, arguments: STAGE_GUARD_ARGUMENTS },
};

interface RenderedHook {
  matcher: string;
  hooks:   { type: string; command: string; args: string[] }[];
}

interface RenderedSettings {
  permissions: { allow: string[]; deny: string[] };
  sandbox:     { filesystem: { allowWrite: string[]; denyWrite: string[] } };
  hooks?:      { PreToolUse: RenderedHook[] };
}

function settingsOf(profile: WorkerProfile): RenderedSettings {
  const request: AgentLaunchRequest = {
    programPath:       `${HOME}/.local/bin/claude`,
    sessionId:         'session-example',
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     HOME,
    firstMessage:      'Build.',
    roleBrief:         'Builder.',
    model:             'opus',
    effort:            'medium',
    environment:       {},
    profile,
    confinement:       'confined',
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
  const settings = claudeCodeAdapterFor('linux').planOf(request).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  return JSON.parse(settings?.text ?? '{}') as RenderedSettings;
}

describe('a stage of a job of an entity', () => {
  test('lets Edit and Write reach its folders and files alone, never the whole worktree', () => {
    const { allow } = settingsOf(STAGE_PROFILE).permissions;
    expect(allow.filter((rule) => rule.startsWith('Edit(') || rule.startsWith('Write('))).toEqual([
      `Edit(/${WORKTREE}/apps/example)`,
      `Edit(/${WORKTREE}/apps/example/**)`,
      `Write(/${WORKTREE}/apps/example)`,
      `Write(/${WORKTREE}/apps/example/**)`,
      `Edit(/${WORKTREE}/bun.lock)`,
      `Edit(/${WORKTREE}/bun.lock/**)`,
      `Write(/${WORKTREE}/bun.lock)`,
      `Write(/${WORKTREE}/bun.lock/**)`,
    ]);
  });

  test('denies Edit and Write every path outside its folders, and the .claude folder of every entity home', () => {
    expect(settingsOf(STAGE_PROFILE).permissions.deny).toEqual(expect.arrayContaining([
      `Edit(/${WORKTREE}/packages/**)`,
      `Write(/${WORKTREE}/packages)`,
      `Write(/${WORKTREE}/scripts/**)`,
      `Edit(/${WORKTREE}/apps/example/.claude/**)`,
    ]));
  });

  test('leaves the sandbox\'s writes as they were, so Bash is not stopped there', () => {
    expect(settingsOf(STAGE_PROFILE).sandbox.filesystem).toEqual(settingsOf(PROFILE).sandbox.filesystem);
  });
});

describe('E18: the stage edit guard', () => {
  const stageHook = { type: 'command', command: GUARD_RUNTIME, args: STAGE_GUARD_ARGUMENTS };

  test('runs before every Edit and Write in exec form, so a name made after launch outside the stage is denied at once', () => {
    expect(settingsOf(STAGE_PROFILE).hooks?.PreToolUse).toEqual([{ matcher: 'Edit', hooks: [stageHook] }, { matcher: 'Write', hooks: [stageHook] }]);
  });

  test('runs beside the network guard, which keeps its own matchers', () => {
    const networkGuard = { allowedDomains: ['registry.example.com'], programPath: GUARD_RUNTIME, arguments: ['hook', 'bash-domains', '--allow', 'registry.example.com'] };
    const matchers = settingsOf({ ...STAGE_PROFILE, networkDomainGuard: networkGuard }).hooks?.PreToolUse.map((entry) => entry.matcher);
    expect(matchers).toEqual(['Bash', 'PowerShell', 'WebFetch', 'Edit', 'Write']);
  });

  test('that cannot start denies Edit and Write outright and renders no hook', () => {
    const settings = settingsOf({ ...STAGE_PROFILE, stageEditGuard: { stageFolders: STAGE_FOLDERS, programPath: null, arguments: STAGE_GUARD_ARGUMENTS } });
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['Edit', 'Write']));
    expect(settings.hooks).toBeUndefined();
  });

  test('is absent for a profile without stage folders, which renders no hooks key and denies Edit and Write nothing outright', () => {
    const settings = settingsOf(PROFILE);
    expect(settings.hooks).toBeUndefined();
    expect(settings.permissions.deny).not.toContain('Edit');
  });
});

test('a profile without stage folders lets Edit and Write reach the working directory and denies them nothing more', () => {
  const { allow, deny } = settingsOf(PROFILE).permissions;
  expect(allow.filter((rule) => rule.startsWith('Edit(') || rule.startsWith('Write('))).toEqual([`Edit(/${WORKTREE}/**)`, `Write(/${WORKTREE}/**)`]);
  expect(deny.some((rule) => rule.includes(`${WORKTREE}/packages`))).toBe(false);
});
